import assert from "node:assert/strict";
import test from "node:test";

import { FADE_TO_STOP_MS, FIRST_NOTE_DELAY_MS, MUSICAL_BAR_BEATS, SoundscapeEngine } from "../SoundscapeEngine";
import { SOUNDSCAPE_PRESETS } from "../presets";

function createParam() {
  return {
    value: 0,
    lastRamp: null as { value: number; time: number } | null,
    cancelScheduledValues: () => undefined,
    setValueAtTime(value: number) { this.value = value; },
    linearRampToValueAtTime(value: number, time: number) { this.value = value; this.lastRamp = { value, time }; },
    exponentialRampToValueAtTime(value: number) { this.value = value; },
    setValueCurveAtTime: () => undefined,
  };
}

function createContext() {
  const masterGain = createParam();
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const context = {
    currentTime: 0,
    sampleRate: 32,
    state: "running",
    destination: node(),
    suspended: 0,
    closed: 0,
    createGain: () => ({ ...node(), gain: masterGain }),
    createDynamicsCompressor: () => ({ ...node(), threshold: createParam(), knee: createParam(), ratio: createParam(), attack: createParam(), release: createParam() }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createBiquadFilter: () => ({ ...node(), type: "lowpass", frequency: createParam(), Q: createParam() }),
    createStereoPanner: () => ({ ...node(), pan: createParam() }),
    createOscillator: () => ({ ...node(), type: "sine", frequency: createParam(), start: () => undefined, stop: () => undefined, onended: null }),
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, start: () => undefined, stop: () => undefined, onended: null }),
    createBuffer: (channels: number, frames: number) => ({ numberOfChannels: channels, getChannelData: () => new Float32Array(frames) }),
    suspend() { this.suspended += 1; this.state = "suspended"; return Promise.resolve(); },
    resume() { this.state = "running"; return Promise.resolve(); },
    close() { this.closed += 1; this.state = "closed"; return Promise.resolve(); },
  };
  return { context, masterGain };
}

test("the engine does not allocate Web Audio before an explicit activation", () => {
  let calls = 0;
  const engine = new SoundscapeEngine(() => {
    calls += 1;
    throw new Error("factory should not run before activation");
  });
  assert.equal(engine.hasAudioContext, false);
  assert.equal(calls, 0);
});

test("each original composition starts promptly and contains harmony, melody, rests, and phone-audible notes", () => {
  assert.ok(FIRST_NOTE_DELAY_MS <= 120);
  assert.equal(MUSICAL_BAR_BEATS, 4);
  for (const preset of Object.values(SOUNDSCAPE_PRESETS)) {
    assert.equal(preset.engineVersion, "2");
    assert.ok(preset.tonicHz >= 120);
    assert.ok(preset.tempoBpm >= 50 && preset.tempoBpm <= 65);
    assert.equal(preset.chordRoots.length, 4);
    assert.equal(preset.chordVoicings.length, 4);
    assert.ok(preset.chordVoicings.every((chord) => chord.length >= 4));
    assert.ok(preset.melody.filter((note) => note !== null).length >= 9);
    assert.ok(preset.melody.some((note) => note === null));
    assert.ok(preset.melodyGain > preset.padGain);
  }
});

test("video pauses and recovers while voice is ducked without changing foreground media", () => {
  const { context, masterGain } = createContext();
  const engine = new SoundscapeEngine(() => context as unknown as AudioContext);
  engine.play("glow");
  engine.handleMediaEvent({ type: "tts", active: true });
  assert.equal(masterGain.lastRamp?.value, 0.22 * 0.64 * 0.15);
  engine.handleMediaEvent({ type: "tts", active: false });
  assert.equal(masterGain.lastRamp?.time, 0.75);
  engine.handleMediaEvent({ type: "video", active: true });
  assert.equal(masterGain.lastRamp?.value, 0);
  assert.equal(masterGain.lastRamp?.time, 0.24);
  engine.handleMediaEvent({ type: "video", active: false });
  assert.equal(masterGain.lastRamp?.time, 1);
  engine.dispose();
  assert.equal(context.closed, 1);
});

test("the musical arrangement schedules pitched voices and disposal stops every source", () => {
  let stopped = 0;
  const { context, masterGain } = createContext();
  const source = context.createOscillator;
  context.createOscillator = () => ({ ...source(), stop: () => { stopped += 1; }, onended: null });
  const engine = new SoundscapeEngine(() => context as unknown as AudioContext);
  engine.play("glow");
  engine.fadeToStop();
  assert.equal(masterGain.lastRamp?.time, FADE_TO_STOP_MS / 1000);
  engine.dispose();
  assert.ok(stopped > 0);
});

test("rapid fade, background transition, and unmount clear every soundscape timer", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const pending = new Set<ReturnType<typeof setTimeout>>();
  globalThis.setTimeout = ((callback: TimerHandler) => {
    const handle = { callback } as unknown as ReturnType<typeof setTimeout>;
    pending.add(handle);
    return handle;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle?: ReturnType<typeof setTimeout>) => {
    if (handle) pending.delete(handle);
  }) as typeof clearTimeout;
  try {
    const { context } = createContext();
    const engine = new SoundscapeEngine(() => context as unknown as AudioContext);
    engine.play("glow");
    engine.fadeToStop();
    engine.fadeToStop();
    engine.handleMediaEvent({ type: "visibility", visible: false });
    engine.dispose();
    assert.equal(pending.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
