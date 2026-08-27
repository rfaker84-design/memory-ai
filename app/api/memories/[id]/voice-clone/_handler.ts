import { NextRequest, NextResponse } from "next/server";

import { resolveSessionOwner, type SessionResolver } from "@/app/api/memories/_session-user-boundary";
import {
  InternalBetaVoiceCloneService,
  VoiceCloneBetaError,
} from "@/features/voice-clone";
import { AuthConfigurationError, requireAllowedOrigin } from "@/src/server/auth";
import { canAccessInternalBeta } from "@/src/server/beta-access";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { mediaService } from "@/app/api/media/_lib";
import { hasApprovedMemoryConsent } from "@/features/consent/trust-consent-postgres";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const MAX_QWEN_SAMPLE_BYTES = 10 * 1024 * 1024;
const QWEN_SAMPLE_MIME_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/mp4"]);

type Context = { params: Promise<{ id: string }> };
type VoiceCloneService = Pick<InternalBetaVoiceCloneService, "reserve" | "create" | "complete" | "fail">;
type VoiceCloneMediaService = Pick<ReturnType<typeof mediaService>, "upload" | "createDownloadUrl">;
type BetaAccess = (externalUserId: string) => boolean;
type ConsentVerifier = (input: {
  externalUserId: string;
  consentType: "voice_clone";
  memoryId: string;
}) => Promise<boolean>;

const json = (body: Record<string, unknown>, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function responseJob(job: { jobId: string; status: "pending" | "ready" | "failed" }) {
  return { job: { id: job.jobId, status: job.status } };
}

function failure(error: unknown): NextResponse {
  if (error instanceof VoiceCloneBetaError) {
    return json({ error: error.code }, { status: error.status });
  }
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:qwen-voice-clone] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  if (error instanceof AuthConfigurationError) {
    return json(
      { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
      { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 },
    );
  }
  console.error("[api:qwen-voice-clone] request failed");
  return json({ error: "VOICE_CLONE_REQUEST_FAILED" }, { status: 500 });
}

export function createQwenVoiceCloneHandlers(
  serviceFactory: () => VoiceCloneService = () => new InternalBetaVoiceCloneService(),
  getMediaService: () => VoiceCloneMediaService = mediaService,
  sessionResolver?: SessionResolver,
  betaAccess: BetaAccess = (externalUserId) => canAccessInternalBeta("qwen-audio-tts-flash-voice-clone", externalUserId),
  consentVerifier: ConsentVerifier = hasApprovedMemoryConsent,
) {
  async function authorize(request: NextRequest) {
    const owner = await resolveSessionOwner(request, undefined, sessionResolver);
    if ("response" in owner) return owner;
    if (!betaAccess(owner.externalUserId)) {
      return { response: json({ error: "BETA_NOT_AVAILABLE" }, { status: 404 }) };
    }
    return owner;
  }

  return {
    async POST(request: NextRequest, context: Context): Promise<NextResponse> {
      const owner = await authorize(request);
      if ("response" in owner) return owner.response;
      try {
        requireAllowedOrigin(request);
        const { id: memoryId } = await context.params;
        const idempotencyKey = request.headers.get("idempotency-key");
        if (!UUID.test(memoryId) || !idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
          return json({ error: "INVALID_VOICE_CLONE_REQUEST" }, { status: 400 });
        }
        if (!(await consentVerifier({
          externalUserId: owner.externalUserId,
          consentType: "voice_clone",
          memoryId,
        }))) {
          return json({ error: "VOICE_CLONE_CONSENT_REQUIRED" }, { status: 403 });
        }
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || !QWEN_SAMPLE_MIME_TYPES.has(file.type.toLowerCase())) {
          return json({ error: "INVALID_VOICE_SAMPLE" }, { status: 400 });
        }
        if (file.size === 0 || file.size > MAX_QWEN_SAMPLE_BYTES) {
          return json({ error: "VOICE_SAMPLE_TOO_LARGE" }, { status: 413 });
        }

        const storage = getMediaService();
        const uploaded = await storage.upload({
          externalUserId: owner.externalUserId,
          memoryId,
          file: { name: file.name, type: file.type, body: Buffer.from(await file.arrayBuffer()) },
        });
        if (uploaded.asset.mediaType !== "audio") {
          return json({ error: "INVALID_VOICE_SAMPLE" }, { status: 400 });
        }

        const service = serviceFactory();
        const reservation = await service.reserve({
          externalUserId: owner.externalUserId,
          memoryId,
          audioAssetId: uploaded.asset.id,
          idempotencyKey,
        });
        if (reservation.existing) return json(responseJob(reservation));

        try {
          const download = await storage.createDownloadUrl(uploaded.asset.id, owner.externalUserId, 900);
          const result = await service.create(reservation, { memoryId, sampleUrl: download.url });
          await service.complete({ reservation, memoryId, result });
          return json(responseJob({ ...reservation, status: "ready" }), { status: 201 });
        } catch (error) {
          await service.fail({ reservation, memoryId }).catch(() => undefined);
          if (error instanceof VoiceCloneBetaError) return failure(error);
          return json({ error: "QWEN_VOICE_CLONE_PROVIDER_FAILED" }, { status: 502 });
        }
      } catch (error) {
        return failure(error);
      }
    },
  };
}
