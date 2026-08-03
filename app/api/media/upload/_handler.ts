import { NextRequest, NextResponse } from "next/server";

import { hasApprovedMemoryConsent } from "@/features/consent/trust-consent-postgres";

import {
  authenticate,
  mediaError,
  mediaService,
  requireMediaMutationOrigin,
  safeMediaAsset,
} from "../_lib";

type UploadMediaService = Pick<ReturnType<typeof mediaService>, "upload">;
type ConsentVerifier = (input: {
  externalUserId: string;
  consentType: "media_asset";
  memoryId: string;
}) => Promise<boolean>;

export function createUploadMediaHandler(
  authenticateRequest: typeof authenticate = authenticate,
  requireOrigin: typeof requireMediaMutationOrigin = requireMediaMutationOrigin,
  getMediaService: () => UploadMediaService = mediaService,
  consentVerifier: ConsentVerifier = hasApprovedMemoryConsent,
) {
  return async function POST(req: NextRequest) {
    const userId = await authenticateRequest(req);
    if (!userId) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const originError = requireOrigin(req);
    if (originError) return originError;
    try {
      const contentLength = Number(req.headers.get("content-length") ?? "0");
      const requestLimit = (Number(process.env.MEDIA_MAX_IMAGE_BYTES) || 20 * 1024 * 1024) + 1024 * 1024;
      if (contentLength > requestLimit) {
        return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
      }
      const form = await req.formData();
      const file = form.get("file");
      const memoryId = form.get("memoryId");
      if (!(file instanceof File) || typeof memoryId !== "string" || !/^[0-9a-f-]{36}$/i.test(memoryId)) {
        return NextResponse.json({ error: "INVALID_UPLOAD_REQUEST" }, { status: 400 });
      }
      // First release accepts only a portrait image. Keep the broader media
      // model for controlled historical deletion/retention handling, but do
      // not let a public endpoint re-enable voice collection or cloning.
      if (!file.type.toLowerCase().startsWith("image/")) {
        return NextResponse.json({ error: "AUDIO_UPLOAD_NOT_AVAILABLE" }, { status: 415 });
      }
      if (!(await consentVerifier({ externalUserId: userId, consentType: "media_asset", memoryId }))) {
        return NextResponse.json({ error: "MEDIA_CONSENT_REQUIRED" }, { status: 403 });
      }
      const result = await getMediaService().upload({ externalUserId: userId, memoryId,
        file: { name: file.name, type: file.type, body: Buffer.from(await file.arrayBuffer()) } });
      return NextResponse.json({ asset: safeMediaAsset(result.asset), duplicate: result.duplicate }, { status: result.duplicate ? 200 : 201 });
    } catch (error) { return mediaError(error); }
  };
}
