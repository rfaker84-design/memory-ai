type FetchLike = typeof fetch;

export const VIDU_CN_API_BASE_URL = "https://api.vidu.cn";
export const VIDU_FIRST_PRESENCE_MODEL = "viduq2-pro-fast";
export const VIDU_FIRST_PRESENCE_DURATION_SECONDS = 8;
export const VIDU_COMPANION_MOTION_IDLE_DURATION_SECONDS = 10;
export const VIDU_COMPANION_MOTION_ATTENTIVE_VISUAL_REVIEW_DURATION_SECONDS = 10;
export const VIDU_FIRST_PRESENCE_RESOLUTION = "1080p";

export const VIDU_FIRST_PRESENCE_PROMPT =
  "Static camera, 9:16 first-presence memorial portrait. " +
  "The person always faces the camera and stays in the original place. " +
  "Preserve the same identity, age, facial features, face shape, hairstyle, clothing, body shape, background, lighting, and framing. " +
  "Natural blinking, a slight closed-mouth smile, and exactly one small slow right-hand wave. " +
  "During the final second, the hand naturally lowers and the person continues looking at the camera. " +
  "Mouth closed, silent, no speaking, no lip movement. " +
  "No turning around, no walking, no side-facing pose, no leaving the frame, no laughing, no camera movement, no zoom, no cuts, no flicker.";

export const VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT =
  "turning around, walking, side body, side face, leaving frame, big laugh, open mouth, teeth, talking, lip movement, speaking, audio, " +
  "identity change, age change, face change, hairstyle change, clothing change, background change, new person, new object, fast motion, " +
  "exaggerated expression, camera movement, zoom, pan, tilt, cut, flicker, subtitles, watermark";

export const VIDU_COMPANION_MOTION_NEGATIVE_PROMPT =
  "talking, speaking, lip movement, open mouth, waving, laughing, exaggerated smile, exaggerated emotion, large gesture, walking, " +
  "leaving frame, identity change, age change, face change, hairstyle change, clothing change, background change, new person, new object, " +
  "camera movement, zoom, pan, tilt, cut, flicker, fantasy effect, resurrection effect, subtitles, watermark, audio";

export const VIDU_COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_NEGATIVE_PROMPT =
  VIDU_COMPANION_MOTION_NEGATIVE_PROMPT +
  ", smiling, grin, facial response, nodding, head tilt, head turn, shoulder movement, neck movement, acknowledgement gesture";

export const VIDU_COMPANION_MOTION_PROMPTS = Object.freeze({
  idle:
    "Ten-second static-camera, vertical 9:16 realistic companion portrait. Preserve the exact identity, age, facial features, hairstyle, clothing, environment, lighting, and framing from the source photo. The person is quietly present in the original place and remains almost completely still for most of the clip. Use one or two natural blinks only, extremely gentle breathing, a barely perceptible eye movement, and at most one tiny relaxed head or shoulder adjustment. Do not nod, turn, perform, or repeatedly smile. Closed mouth, no speaking, no lip movement, no hand gesture, no camera movement. Warm restrained life-documentary feeling. The first and final posture should be nearly identical for a soft loop.",
  attentive:
    "Ten-second static-camera, vertical 9:16 realistic companion portrait. Preserve the exact identity, age, facial features, hairstyle, clothing, environment, lighting, and framing from the source photo. Use the approved quiet idle portrait as the visual baseline: for almost the entire clip, the person simply stays naturally and calmly attentive, nearly motionless. This is a sustained listening state, not a listening action. Allow only one or two natural blinks, extremely gentle breathing, a tiny focused eye change, and at most one barely perceptible relaxed head or shoulder-neck settling. No active nodding, no repeated smile, no visible response gesture, no noticeable turn, no performance. Closed mouth, no speaking, no lip movement, no hand gesture, no camera movement. Warm restrained life-documentary feeling. The first and final posture should be nearly identical for a soft loop.",
  reflective:
    "Static camera, vertical 9:16 realistic companion portrait. Preserve the exact identity, age, facial features, hairstyle, clothing, environment, lighting, and framing from the source photo. The person holds a quiet reflective pause with gentle breathing, natural blinking, a very small gaze change, and an extremely subtle posture adjustment. Closed mouth, no speaking, no lip movement, no dramatic emotion, no hand gesture, no camera movement. Warm restrained life-documentary feeling. The first and final posture should be nearly identical for a soft loop.",
} as const);

/** A strict, one-off passive-listening contract for the v6 Staging review. */
export const VIDU_COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_PROMPT =
  "Ten-second static-camera, vertical 9:16 realistic companion portrait. Preserve the exact identity, age, facial features, hairstyle, clothing, environment, lighting, and framing from the source photo. This is a sustained passive listening state, not an acknowledgement or performed listening action. For about ninety percent of the clip, remain naturally still with a stable, soft, attentive expression. Allow only one or two slow natural blinks, extremely gentle breathing, and at most one very small, slow eye shift. No smile, no expression change, no nod, no head tilt, no head turn, no shoulder or neck adjustment, and no response gesture. Closed mouth throughout: no speaking and no lip movement. No hand gesture and no camera movement. Warm restrained life-documentary feeling. The first and final posture must be nearly identical for a soft loop.";

export type ViduFirstPresenceSubmission = {
  taskId: string;
  providerState: string;
  credits: number | null;
};

export type ViduFirstPresencePoll =
  | {
      state: "running";
      providerState: string;
      credits: number | null;
    }
  | {
      state: "succeeded";
      providerState: string;
      credits: number | null;
      outputUrl: string;
    }
  | {
      state: "failed";
      providerState: string;
      credits: number | null;
      errorCode: string;
    };

export type ViduFirstPresenceSubmitInput = {
  imageDataUrl: string;
  imageSha256: string;
  idempotencyKey: string;
  motionVariant?: keyof typeof VIDU_COMPANION_MOTION_PROMPTS;
  companionMotionPackVersion?: number;
};

function requireRawViduApiKey(environment: Record<string, string | undefined>): string {
  const rawApiKey = environment.VIDU_API_KEY;
  if (!rawApiKey) throw new Error("VIDU_API_KEY_MISSING");
  if (/[\r\n]/.test(rawApiKey)) throw new Error("VIDU_API_KEY_CONFIG_INVALID: line_break");
  if (rawApiKey !== rawApiKey.trim()) throw new Error("VIDU_API_KEY_CONFIG_INVALID: surrounding_whitespace");
  if (/["']/.test(rawApiKey)) throw new Error("VIDU_API_KEY_CONFIG_INVALID: quoted_value");
  if (/^(?:token|bearer)\b/i.test(rawApiKey)) throw new Error("VIDU_API_KEY_CONFIG_INVALID: auth_scheme_prefix");
  return rawApiKey;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export class ViduFirstPresenceHttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`VIDU_HTTP_${status}:${code}`);
  }
}

export class ViduFirstPresenceNetworkError extends Error {
  constructor() {
    super("VIDU_NETWORK_UNCERTAIN");
  }
}

export class ViduFirstPresenceProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    input: {
      environment?: Record<string, string | undefined>;
      baseUrl?: string;
      fetchImpl?: FetchLike;
    } = {}
  ) {
    this.baseUrl = (input.baseUrl ?? VIDU_CN_API_BASE_URL).replace(/\/+$/, "");
    this.apiKey = requireRawViduApiKey(input.environment ?? process.env);
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  private readonly fetchImpl: FetchLike;

  private headers(): Record<string, string> {
    return {
      Authorization: `Token ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private async requestJson(
    url: string,
    init: RequestInit
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ViduFirstPresenceNetworkError();
    }
    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? objectValue(JSON.parse(text)) : {};
    } catch {
      data = { message: text.slice(0, 1000) };
    }
    if (!response.ok) {
      throw new ViduFirstPresenceHttpError(
        response.status,
        stringValue(data.code) ??
          stringValue(data.error_code) ??
          stringValue(data.errorCode) ??
          stringValue(data.error) ??
          "NO_NON_SENSITIVE_CODE_FOUND"
      );
    }
    return data;
  }

  async submit(
    input: ViduFirstPresenceSubmitInput
  ): Promise<ViduFirstPresenceSubmission> {
    const attentiveStillReview = input.motionVariant === "attentive"
      && input.companionMotionPackVersion === 6;
    const prompt = attentiveStillReview
      ? VIDU_COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_PROMPT
      : input.motionVariant
      ? VIDU_COMPANION_MOTION_PROMPTS[input.motionVariant]
      : VIDU_FIRST_PRESENCE_PROMPT;
    const negativePrompt = attentiveStillReview
      ? VIDU_COMPANION_MOTION_ATTENTIVE_STILL_VISUAL_REVIEW_NEGATIVE_PROMPT
      : input.motionVariant
      ? VIDU_COMPANION_MOTION_NEGATIVE_PROMPT
      : VIDU_FIRST_PRESENCE_NEGATIVE_PROMPT;
    const data = await this.requestJson(`${this.baseUrl}/ent/v2/img2video`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: VIDU_FIRST_PRESENCE_MODEL,
        images: [input.imageDataUrl],
        prompt,
        negative_prompt: negativePrompt,
        is_rec: false,
        bgm: false,
        audio: false,
        duration: (
           (input.motionVariant === "idle" && input.companionMotionPackVersion === 3)
           || (input.motionVariant === "attentive" && (
             input.companionMotionPackVersion === 5 || input.companionMotionPackVersion === 6
           ))
        ) ? input.motionVariant === "attentive"
          ? VIDU_COMPANION_MOTION_ATTENTIVE_VISUAL_REVIEW_DURATION_SECONDS
          : VIDU_COMPANION_MOTION_IDLE_DURATION_SECONDS
          : VIDU_FIRST_PRESENCE_DURATION_SECONDS,
        resolution: VIDU_FIRST_PRESENCE_RESOLUTION,
        movement_amplitude: "small",
        off_peak: false,
        payload: JSON.stringify({
          idempotency_key: input.idempotencyKey,
          input_sha256: input.imageSha256,
          ...(input.motionVariant ? { motion_variant: input.motionVariant } : {}),
        }),
      }),
    });
    const taskId = stringValue(data.task_id);
    if (!taskId) throw new Error("VIDU_SUBMIT_TASK_ID_MISSING");
    return {
      taskId,
      providerState: stringValue(data.state) ?? "created",
      credits: numberValue(data.credits),
    };
  }

  async poll(taskId: string): Promise<ViduFirstPresencePoll> {
    const data = await this.requestJson(
      `${this.baseUrl}/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`,
      { method: "GET", headers: this.headers() }
    );
    const providerState = stringValue(data.state) ?? "unknown";
    const credits = numberValue(data.credits);
    if (providerState === "success") {
      const creations = Array.isArray(data.creations) ? data.creations : [];
      const outputUrl = stringValue(objectValue(creations[0]).url);
      if (!outputUrl) {
        return {
          state: "failed",
          providerState,
          credits,
          errorCode: "VIDU_OUTPUT_URL_MISSING",
        };
      }
      return { state: "succeeded", providerState, credits, outputUrl };
    }
    if (providerState === "failed") {
      return {
        state: "failed",
        providerState,
        credits,
        errorCode: stringValue(data.err_code) ?? "VIDU_FAILED",
      };
    }
    return { state: "running", providerState, credits };
  }
}
