import { SOUNDSCAPE_PRESETS } from "./presets";
import type { ForegroundAudioKind, SoundscapeId, SoundscapeMediaEvent, SoundscapePreset } from "./types";

const CROSSFADE_MS = 1500;
export const FADE_TO_STOP_MS = 1500;
const VIDEO_FADE_MS = 240;
const VIDEO_RECOVER_MS = 1000;
const VOICE_DUCK_RATIO = 0.15;
const VOICE_RECOVER_MS = 750;
export const ROLLING_NOISE_BLOCK_SECONDS = 12;
export const ROLLING_NOISE_CROSSFADE_SECONDS = 1.2;
export const FIRST_SHIMMER_DELAY_MS = 180;
export const PRIMARY_DRONE_GAIN = 0.12;
export const SECONDARY_DRONE_GAIN = 0.055;

type ContextFactory = () => AudioContext;
type ActiveLayer = {
  preset: SoundscapePreset;
  gain: GainNode;
  noiseFilter: BiquadFilterNode;
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

/** Deterministic, non-looping pink-noise block with unique adjacent seed material. */
export function createDeterministicPinkNoiseBlock(frames: number, seed: string, blockIndex: number): Float32Array {
  const random = seededRandom(`${seed}:pink-noise:${blockIndex}`);
  const samples = new Float32Array(Math.max(1, frames));
  let pink = 0;
  for (let index = 0; index < samples.length; index += 1) {
    pink = pink * 0.985 + (random() * 2 - 1) * 0.015;
    samples[index] = pink;
  }
  return samples;
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
    this.scheduleRollingNoise(context, next, next.noiseFilter);
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
    const makeDrone = (frequency: number, type: OscillatorType, gainLevel: number, pan: number) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = Math.max(420, frequency * 8);
      filter.Q.value = 0.28;
      gain.gain.value = gainLevel;
      panner.pan.value = pan;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(layerGain);
      oscillator.start();
      sources.push(oscillator);
      nodes.push(filter, gain, panner);
    };
    // Keep the bed audible on phone and laptop speakers. The previous
    // sub-bass-only bed (55–110 Hz at very low gain) could be technically
    // running while sounding silent on small speakers.
    makeDrone(preset.droneHz[0], "sine", PRIMARY_DRONE_GAIN, -preset.stereoWidth);
    makeDrone(preset.droneHz[1], "triangle", SECONDARY_DRONE_GAIN, preset.stereoWidth);

    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = preset.noiseFilterHz;
    noiseFilter.Q.value = 0.42;
    noiseFilter.connect(layerGain);
    nodes.push(noiseFilter);

    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.021 + random() * 0.015;
    lfoDepth.gain.value = 0.014;
    lfo.connect(lfoDepth);
    lfoDepth.connect(layerGain.gain);
    lfo.start();
    sources.push(lfo);
    nodes.push(lfoDepth);

    const layer: ActiveLayer = { preset, gain: layerGain, noiseFilter, sources, nodes, timers: new Set() };
    this.layers.add(layer);
    this.scheduleShimmer(context, layer, random);
    return layer;
  }

  private scheduleShimmer(context: AudioContext, layer: ActiveLayer, random: () => number): void {
    const emit = () => {
      if (this.active !== layer || !this.context || this.context.state === "closed") return;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      const frequency = layer.preset.shimmerHz[0] + random() * (layer.preset.shimmerHz[1] - layer.preset.shimmerHz[0]);
      const duration = 1.6 + random() * 2.1;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 1.6;
      panner.pan.value = (random() * 2 - 1) * layer.preset.stereoWidth;
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(layer.gain);
      const now = context.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.011 + random() * 0.008, now + duration * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
      layer.sources.push(oscillator);
      layer.nodes.push(filter, gain, panner);
      oscillator.onended = () => {
        this.removeSourceAndNodes(layer, oscillator, [filter, gain, panner]);
      };
      const [minimum, maximum] = layer.preset.shimmerIntervalMs;
      this.defer(layer, emit, minimum + random() * (maximum - minimum));
    };
    // Give immediate audible feedback after the user gesture. Later shimmer
    // events still keep their long, non-mechanical spacing.
    this.defer(layer, emit, FIRST_SHIMMER_DELAY_MS);
  }

  private scheduleRollingNoise(context: AudioContext, layer: ActiveLayer, filter: BiquadFilterNode): void {
    let blockIndex = 0;
    const schedule = () => {
      if (this.active !== layer || !this.layers.has(layer) || !this.context || this.context.state === "closed") return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const frames = Math.max(1, Math.floor(context.sampleRate * ROLLING_NOISE_BLOCK_SECONDS));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      buffer.getChannelData(0).set(createDeterministicPinkNoiseBlock(frames, layer.preset.seed, blockIndex));
      blockIndex += 1;
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain);
      gain.connect(filter);
      const now = context.currentTime;
      const fade = ROLLING_NOISE_CROSSFADE_SECONDS;
      const end = now + ROLLING_NOISE_BLOCK_SECONDS;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(layer.preset.noiseGain, now + fade);
      gain.gain.setValueAtTime(layer.preset.noiseGain, end - fade);
      gain.gain.linearRampToValueAtTime(0, end);
      source.start(now);
      source.stop(end + 0.03);
      layer.sources.push(source);
      layer.nodes.push(gain);
      source.onended = () => this.removeSourceAndNodes(layer, source, [gain]);
      this.defer(layer, schedule, (ROLLING_NOISE_BLOCK_SECONDS - fade) * 1000);
    };
    schedule();
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
