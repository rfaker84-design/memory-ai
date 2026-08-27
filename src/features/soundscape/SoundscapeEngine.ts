import { SOUNDSCAPE_PRESETS } from "./presets";
import type { SoundscapeId, SoundscapeMediaEvent, SoundscapePreset } from "./types";

const CROSSFADE_MS = 1500;
const VIDEO_FADE_MS = 240;
const VIDEO_RECOVER_MS = 1000;
const VOICE_DUCK_RATIO = 0.15;
const VOICE_RECOVER_MS = 750;

type ContextFactory = () => AudioContext;
type ActiveLayer = { preset: SoundscapePreset; gain: GainNode; sources: AudioScheduledSourceNode[]; timers: Array<ReturnType<typeof setTimeout>> };
type MediaState = { video: boolean; voice: boolean; visible: boolean };

function seededRandom(seed: string): () => number {
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
  private media: MediaState = { video: false, voice: false, visible: true };
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
    const next = this.createLayer(context, master, SOUNDSCAPE_PRESETS[id]);
    const previous = this.active;
    this.active = next;
    this.currentId = id;
    equalPowerCrossfade(next.gain.gain, context.currentTime, true);
    if (previous) {
      equalPowerCrossfade(previous.gain.gain, context.currentTime, false);
      previous.timers.push(setTimeout(() => this.destroyLayer(previous), CROSSFADE_MS + 80));
    }
    this.applyMediaPolicy();
  }

  public stop(): void {
    if (!this.context || !this.master) return;
    this.clearSuspendTimer();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setValueAtTime(0, this.context.currentTime);
    for (const layer of this.layers) this.destroyLayer(layer);
    this.active = null;
    this.currentId = null;
  }

  public handleMediaEvent(event: SoundscapeMediaEvent): void {
    if (event.type === "video") {
      this.recoverFromVideo = !event.active && this.media.video;
      this.media.video = event.active;
    }
    if (event.type === "voice") this.media.voice = event.active;
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
    };
    makeDrone(preset.droneHz[0], "sine", 0.055, -preset.stereoWidth);
    makeDrone(preset.droneHz[1], "triangle", 0.026, preset.stereoWidth);

    const noise = context.createBufferSource();
    noise.buffer = this.createPinkNoise(context, random, 31.1 + random() * 7.9);
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = preset.noiseFilterHz;
    noiseFilter.Q.value = 0.42;
    noiseGain.gain.value = preset.noiseGain;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(layerGain);
    noise.start();
    sources.push(noise);

    const lfo = context.createOscillator();
    const lfoDepth = context.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.021 + random() * 0.015;
    lfoDepth.gain.value = 0.014;
    lfo.connect(lfoDepth);
    lfoDepth.connect(layerGain.gain);
    lfo.start();
    sources.push(lfo);

    const layer: ActiveLayer = { preset, gain: layerGain, sources, timers: [] };
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
      oscillator.onended = () => {
        const sourceIndex = layer.sources.indexOf(oscillator);
        if (sourceIndex >= 0) layer.sources.splice(sourceIndex, 1);
        for (const node of [oscillator, filter, gain, panner]) {
          try { node.disconnect(); } catch { /* already disconnected */ }
        }
      };
      const [minimum, maximum] = layer.preset.shimmerIntervalMs;
      layer.timers.push(setTimeout(emit, minimum + random() * (maximum - minimum)));
    };
    const [minimum, maximum] = layer.preset.shimmerIntervalMs;
    layer.timers.push(setTimeout(emit, minimum + random() * (maximum - minimum)));
  }

  private createPinkNoise(context: AudioContext, random: () => number, seconds: number): AudioBuffer {
    const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let pink = 0;
    for (let index = 0; index < samples.length; index += 1) {
      pink = pink * 0.985 + (random() * 2 - 1) * 0.015;
      samples[index] = pink;
    }
    return buffer;
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
    const target = this.volume * this.active.preset.gain * (this.media.voice ? VOICE_DUCK_RATIO : 1);
    const duration = this.media.voice ? 160 : this.recoverFromVideo ? VIDEO_RECOVER_MS : VOICE_RECOVER_MS;
    this.recoverFromVideo = false;
    ramp(master.gain, context.currentTime, master.gain.value, target, duration);
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
  }

  private destroyLayer(layer: ActiveLayer): void {
    this.layers.delete(layer);
    for (const timer of layer.timers) clearTimeout(timer);
    for (const source of layer.sources) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    try { layer.gain.disconnect(); } catch { /* already disconnected */ }
  }
}
