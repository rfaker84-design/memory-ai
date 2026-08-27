import assert from "node:assert/strict";
import test from "node:test";

import { SoundscapeEngine } from "../SoundscapeEngine";

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
    createBufferSource: () => ({ ...node(), buffer: null, loop: false, start: () => undefined, stop: () => undefined }),
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

test("video pauses and recovers while voice is ducked without changing foreground media", () => {
  const { context, masterGain } = createContext();
  const engine = new SoundscapeEngine(() => context as unknown as AudioContext);
  engine.play("glow");
  engine.handleMediaEvent({ type: "voice", active: true });
  assert.equal(masterGain.lastRamp?.value, 0.22 * 0.64 * 0.15);
  engine.handleMediaEvent({ type: "voice", active: false });
  assert.equal(masterGain.lastRamp?.time, 0.75);
  engine.handleMediaEvent({ type: "video", active: true });
  assert.equal(masterGain.lastRamp?.value, 0);
  assert.equal(masterGain.lastRamp?.time, 0.24);
  engine.handleMediaEvent({ type: "video", active: false });
  assert.equal(masterGain.lastRamp?.time, 1);
  engine.dispose();
  assert.equal(context.closed, 1);
});
