import { SOUNDSCAPE_PRESETS } from "./presets";
import type { ForegroundAudioKind, SoundscapeId, SoundscapeMediaEvent, SoundscapePreset } from "./types";

const CROSSFADE_MS = 1500;
export const FADE_TO_STOP_MS = 1500;
const VIDEO_FADE_MS = 240;
const VIDEO_RECOVER_MS = 1000;
const VOICE_DUCK_RATIO = 0.15;
const VOICE_RECOVER_MS = 750;
export const FIRST_NOTE_DELAY_MS = 90;
export const MUSICAL_BAR_BEATS = 4;

type ContextFactory = () => AudioContext;
type ActiveLayer = {
  preset: SoundscapePreset;
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  timers: Set<ReturnType<typeof setTimeout>>;
};
type MediaState = { video: boolean; foreground: Set<Exclude<ForegroundAudioKind, "video">>; visible: boolean };

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const unit of seed) state = Math.imul(state ^ unit.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function browserAudioContext(): AudioContext {
  const candidate = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!candidate) throw new Error("SOUNDSCAPE_WEB_AUDIO_UNAVAILABLE");
  return new candidate();
}

function ramp(gain: AudioParam, currentTime: number, from: number, to: number, durationMs: number): void {
  gain.cancelScheduledValues(currentTime);
  gain.setValueAtTime(from, currentTime);
  gain.linearRampToValueAtTime(to, currentTime + durationMs / 1000);
}

function equalPowerCrossfade(gain: AudioParam, currentTime: number, fadeIn: boolean): void {
  const curve = new Float32Array(13);
  for (let index = 0; index < curve.length; index += 1) {
    const point = index / (curve.length - 1);
    curve[index] = fadeIn ? Math.sin(point * Math.PI * 0.5) : Math.cos(point * Math.PI * 0.5);
  }
  gain.cancelScheduledValues(currentTime);
  gain.setValueAtTime(curve[0] ?? 0, currentTime);
  gain.setValueCurveAtTime(curve, currentTime, CROSSFADE_MS / 1000);
}

export class SoundscapeEngine {
  private readonly contextFactory: ContextFactory;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: ActiveLayer | null = null;
  private readonly layers = new Set<ActiveLayer>();
  private currentId: SoundscapeId | null = null;
  private volume = 0.22;
  private media: MediaState = { video: false, foreground: new Set(), visible: true };
  private recoverFromVideo = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(contextFactory: ContextFactory = browserAudioContext) {
    this.contextFactory = contextFactory;
  }

  public get hasAudioContext(): boolean { return this.context !== null; }

  public activate(): void {
    if (this.context) return;
    const context = this.contextFactory();
    const master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -22;
    limiter.knee.value = 18;
    limiter.ratio.value = 7;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.gain.value = 0;
    master.connect(limiter);
    limiter.connect(context.destination);
    this.context = context;
    this.master = master;
  }

  public setVolume(volume: number): void {
    this.volume = Math.min(0.35, Math.max(0.08, volume));
    this.applyMediaPolicy();
  }

  public play(id: SoundscapeId): void {
    this.activate();
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.currentId === id) return;
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const next = this.createLayer(context, master, SOUNDSCAPE_PRESETS[id]);
    const previous = this.active;
    this.active = next;
    this.currentId = id;
    this.scheduleComposition(context, next);
    equalPowerCrossfade(next.gain.gain, context.currentTime, true);
    if (previous) {
      equalPowerCrossfade(previous.gain.gain, context.currentTime, false);
      this.defer(previous, () => this.destroyLayer(previous), CROSSFADE_MS + 80);
    }
    this.applyMediaPolicy();
  }

  public stop(): void {
    if (!this.context || !this.master) return;
    this.clearSuspendTimer();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setValueAtTime(0, this.context.currentTime);
    for (const layer of [...this.layers]) this.destroyLayer(layer);
    this.active = null;
    this.currentId = null;
  }

  /** Fade route-owned ambience before graph disposal. Safe under rapid navigation. */
  public fadeToStop(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.layers.size === 0) return;
    this.clearSuspendTimer();
    ramp(master.gain, context.currentTime, master.gain.value, 0, FADE_TO_STOP_MS);
    const retiring = [...this.layers];
    this.active = null;
    this.currentId = null;
    for (const layer of retiring) this.defer(layer, () => this.destroyLayer(layer), FADE_TO_STOP_MS + 80);
  }

  public handleMediaEvent(event: SoundscapeMediaEvent): void {
    if (event.type === "video") {
      this.recoverFromVideo = !event.active && this.media.video;
      this.media.video = event.active;
    }
    if (event.type !== "video" && event.type !== "visibility") {
      if (event.active) this.media.foreground.add(event.type);
      else this.media.foreground.delete(event.type);
    }
    if (event.type === "visibility") this.media.visible = event.visible;
    this.applyMediaPolicy();
  }

  public dispose(): void {
    this.stop();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
  }

  private createLayer(context: AudioContext, master: GainNode, preset: SoundscapePreset): ActiveLayer {
    const random = seededRandom(preset.seed);
    const layerGain = context.createGain();
    layerGain.gain.value = 0;
    const reverb = context.createConvolver();
    reverb.buffer = this.createImpulse(context, preset, random);
    const dryGain = context.createGain();
    dryGain.gain.value = 0.82;
    const wetGain = context.createGain();
    wetGain.gain.value = 0.18;
    layerGain.connect(dryGain);
    layerGain.connect(reverb);
    dryGain.connect(master);
    reverb.connect(wetGain);
    wetGain.connect(master);

    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [layerGain, reverb, dryGain, wetGain];
    const layer: ActiveLayer = { preset, gain: layerGain, sources, nodes, timers: new Set() };
    this.layers.add(layer);
    return layer;
  }

  private semitone(base: number, offset: number): number {
    return base * 2 ** (offset / 12);
  }

  private scheduleComposition(context: AudioContext, layer: ActiveLayer): void {
    const random = seededRandom(`${layer.preset.seed}:arrangement`);
    const beatSeconds = 60 / layer.preset.tempoBpm;
    const barSeconds = beatSeconds * MUSICAL_BAR_BEATS;
    let barIndex = 0;
    let melodyIndex = 0;
    const scheduleBar = () => {
      if (this.active !== layer || !this.layers.has(layer) || !this.context || this.context.state === "closed") return;
      const chordIndex = barIndex % layer.preset.chordRoots.length;
      const rootOffset = layer.preset.chordRoots[chordIndex] ?? 0;
      const voicing = layer.preset.chordVoicings[chordIndex] ?? [0, 4, 7];
      const when = context.currentTime + FIRST_NOTE_DELAY_MS / 1000;

      // A slow four-note pad gives each track a recognisable harmonic movement.
      voicing.forEach((interval, voiceIndex) => {
        const pan = ((voiceIndex / Math.max(1, voicing.length - 1)) * 2 - 1) * layer.preset.stereoWidth;
        this.scheduleVoice(context, layer, this.semitone(layer.preset.tonicHz, rootOffset + interval), when, barSeconds * 1.08, layer.preset.padGain, pan, "pad");
      });

      // Four deliberately written motif steps per bar. Nulls are musical rests,
      // so the result breathes instead of becoming a mechanical arpeggiator.
      for (let beat = 0; beat < MUSICAL_BAR_BEATS; beat += 1) {
        const note = layer.preset.melody[melodyIndex % layer.preset.melody.length];
        melodyIndex += 1;
        if (note === null || note === undefined) continue;
        const velocity = 0.88 + random() * 0.18;
        const pan = (random() * 2 - 1) * layer.preset.stereoWidth;
        this.scheduleVoice(context, layer, this.semitone(layer.preset.tonicHz, note + 12), when + beat * beatSeconds, beatSeconds * 1.75, layer.preset.melodyGain * velocity, pan, "felt");
      }

      // A restrained root pulse anchors the harmony without the old continuous drone.
      this.scheduleVoice(context, layer, this.semitone(layer.preset.tonicHz, rootOffset), when, beatSeconds * 2.5, layer.preset.padGain * 1.35, -layer.preset.stereoWidth * 0.25, "bass");
      barIndex += 1;
      this.defer(layer, scheduleBar, barSeconds * 1000);
    };
    scheduleBar();
  }

  private scheduleVoice(
    context: AudioContext,
    layer: ActiveLayer,
    frequency: number,
    when: number,
    duration: number,
    level: number,
    pan: number,
    character: "pad" | "felt" | "bass",
  ): void {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = character === "felt" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = character === "felt" ? Math.min(3200, frequency * 5.5) : Math.min(1800, frequency * 4);
    filter.Q.value = character === "felt" ? 0.72 : 0.3;
    panner.pan.value = pan;
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(layer.gain);

    const attack = character === "pad" ? Math.min(1.15, duration * 0.28) : character === "felt" ? 0.035 : 0.16;
    const peak = Math.max(0.0002, level);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + attack);
    if (character === "felt") gain.gain.exponentialRampToValueAtTime(peak * 0.42, when + Math.min(duration * 0.42, 0.7));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
    layer.sources.push(oscillator);
    layer.nodes.push(filter, gain, panner);
    oscillator.onended = () => this.removeSourceAndNodes(layer, oscillator, [filter, gain, panner]);
  }

  private createImpulse(context: AudioContext, preset: SoundscapePreset, random: () => number): AudioBuffer {
    const frames = Math.max(1, Math.floor(context.sampleRate * preset.reverbSeconds));
    const buffer = context.createBuffer(2, frames, context.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) data[index] = (random() * 2 - 1) * (1 - index / data.length) ** 2.7 * 0.24;
    }
    return buffer;
  }

  private applyMediaPolicy(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.active) return;
    this.clearSuspendTimer();
    if (!this.media.visible || this.media.video) {
      const duration = this.media.video ? VIDEO_FADE_MS : 180;
      ramp(master.gain, context.currentTime, master.gain.value, 0, duration);
      this.suspendTimer = setTimeout(() => {
        if (this.context === context && (!this.media.visible || this.media.video) && context.state === "running") void context.suspend().catch(() => undefined);
      }, duration + 20);
      return;
    }
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    const foregroundActive = this.media.foreground.size > 0;
    const target = this.volume * this.active.preset.gain * (foregroundActive ? VOICE_DUCK_RATIO : 1);
    const duration = foregroundActive ? 160 : this.recoverFromVideo ? VIDEO_RECOVER_MS : VOICE_RECOVER_MS;
    this.recoverFromVideo = false;
    ramp(master.gain, context.currentTime, master.gain.value, target, duration);
  }

  private defer(layer: ActiveLayer, callback: () => void, delayMs: number): void {
    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      layer.timers.delete(timer);
      callback();
    }, delayMs);
    layer.timers.add(timer);
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  private removeSourceAndNodes(layer: ActiveLayer, source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    const sourceIndex = layer.sources.indexOf(source);
    if (sourceIndex >= 0) layer.sources.splice(sourceIndex, 1);
    for (const node of [source, ...nodes]) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    for (const node of nodes) {
      const nodeIndex = layer.nodes.indexOf(node);
      if (nodeIndex >= 0) layer.nodes.splice(nodeIndex, 1);
    }
  }

  private destroyLayer(layer: ActiveLayer): void {
    if (!this.layers.delete(layer)) return;
    for (const timer of layer.timers) clearTimeout(timer);
    layer.timers.clear();
    for (const source of layer.sources) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    for (const node of layer.nodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
    layer.sources.length = 0;
    layer.nodes.length = 0;
  }
}
