export type FirstPresenceMediaProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  hasAudio: boolean;
};

export type FirstPresenceVisualCheck = {
  personPresent: boolean;
  finalFramePersonPresent: boolean;
  personLeftFrame: boolean;
  bodyOrHandAbnormal: boolean;
  notes?: string[];
};

export type FirstPresenceQualityDecision =
  | {
      status: "pass";
      reasons: [];
      media: FirstPresenceMediaProbe;
      visual: FirstPresenceVisualCheck;
    }
  | {
      status: "reject";
      reasons: string[];
      media: FirstPresenceMediaProbe;
      visual: FirstPresenceVisualCheck;
    };

const TARGET_DURATION_SECONDS = 8;
const DURATION_TOLERANCE_SECONDS = 0.5;
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

export function evaluateFirstPresenceQuality(input: {
  media: FirstPresenceMediaProbe;
  visual: FirstPresenceVisualCheck;
}): FirstPresenceQualityDecision {
  const reasons: string[] = [];
  const { media, visual } = input;

  if (
    !Number.isFinite(media.durationSeconds) ||
    Math.abs(media.durationSeconds - TARGET_DURATION_SECONDS) >
      DURATION_TOLERANCE_SECONDS
  ) {
    reasons.push("MEDIA_DURATION_INVALID");
  }
  if (media.width !== TARGET_WIDTH || media.height !== TARGET_HEIGHT) {
    reasons.push("MEDIA_RESOLUTION_INVALID");
  }
  if (media.hasAudio) {
    reasons.push("MEDIA_AUDIO_PRESENT");
  }
  if (!media.codec) {
    reasons.push("MEDIA_CODEC_MISSING");
  }
  if (!visual.personPresent) {
    reasons.push("PERSON_MISSING");
  }
  if (visual.personLeftFrame) {
    reasons.push("PERSON_LEFT_FRAME");
  }
  if (!visual.finalFramePersonPresent) {
    reasons.push("FINAL_FRAME_PERSON_MISSING");
  }
  if (visual.bodyOrHandAbnormal) {
    reasons.push("BODY_OR_HAND_ABNORMAL");
  }

  return reasons.length === 0
    ? { status: "pass", reasons: [], media, visual }
    : { status: "reject", reasons, media, visual };
}
