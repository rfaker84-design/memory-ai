export type FirstPresenceFrameEvidence = {
  firstFramePath: string;
  actionFramePath: string;
  finalFramePath: string;
};

export type FirstPresenceMediaProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  sizeBytes: number;
  hasAudio: boolean;
  decodable: boolean;
  evidence: FirstPresenceFrameEvidence;
};

export type FirstPresenceQualityDecision =
  | {
      status: "manual_review_required";
      reasons: [];
      media: FirstPresenceMediaProbe;
      manualReviewReasons: string[];
    }
  | {
      status: "reject";
      reasons: string[];
      media: FirstPresenceMediaProbe;
      manualReviewReasons: string[];
    };

const TARGET_DURATION_SECONDS = 8;
const DURATION_TOLERANCE_SECONDS = 0.5;
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export const FIRST_PRESENCE_MANUAL_REVIEW_REASONS = [
  "IDENTITY_STABILITY_UNVERIFIED",
  "PERSON_LEAVING_FRAME_UNVERIFIED",
  "FINAL_FRAME_PERSON_PRESENCE_UNVERIFIED",
  "BODY_OR_HAND_ABNORMALITY_UNVERIFIED",
] as const;

export function evaluateFirstPresenceQuality(input: {
  media: FirstPresenceMediaProbe;
}): FirstPresenceQualityDecision {
  const reasons: string[] = [];
  const { media } = input;

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
  if (media.sizeBytes <= 0 || media.sizeBytes > MAX_VIDEO_BYTES) {
    reasons.push("MEDIA_SIZE_INVALID");
  }
  if (media.hasAudio) {
    reasons.push("MEDIA_AUDIO_PRESENT");
  }
  if (!media.codec) {
    reasons.push("MEDIA_CODEC_MISSING");
  }
  if (!media.decodable) {
    reasons.push("MEDIA_NOT_DECODABLE");
  }

  const manualReviewReasons = [...FIRST_PRESENCE_MANUAL_REVIEW_REASONS];
  return reasons.length === 0
    ? {
        status: "manual_review_required",
        reasons: [],
        media,
        manualReviewReasons,
      }
    : { status: "reject", reasons, media, manualReviewReasons };
}
