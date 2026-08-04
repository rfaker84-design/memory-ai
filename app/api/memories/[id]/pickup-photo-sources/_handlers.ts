import { NextRequest, NextResponse } from "next/server";

import { resolveSessionOwner, type SessionResolver } from "@/app/api/memories/_session-user-boundary";
import { PickupPhotoSourceError, PickupPhotoSourcePostgresService } from "@/features/pickup/pickup-photo-source-service";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "@/src/server/database";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string }> };
type Service = Pick<PickupPhotoSourcePostgresService, "list">;
type ServiceFactory = () => Service;

const createService: ServiceFactory = () => new PickupPhotoSourcePostgresService();

function json(body: Record<string, unknown>, init?: ResponseInit): NextResponse {
  return applyAuthNoStore(NextResponse.json(body, init));
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof PickupPhotoSourceError) return json({ error: error.code }, { status: 400 });
  if (error instanceof DatabaseDependencyError) {
    console.error("[api:pickup-photo-sources] database request failed", safeDatabaseErrorLog(error));
    return json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
  console.error("[api:pickup-photo-sources] unexpected request failure");
  return json({ error: "PICKUP_PHOTO_SOURCES_UNAVAILABLE" }, { status: 500 });
}

export function createPickupPhotoSourceHandlers(
  serviceFactory: ServiceFactory = createService,
  sessionResolver?: SessionResolver,
) {
  return {
    async GET(request: NextRequest, context: Context) {
      const owner = await resolveSessionOwner(request, undefined, sessionResolver);
      if ("response" in owner) return owner.response;
      try {
        const { id: memoryId } = await context.params;
        return json({ photos: await serviceFactory().list({ externalUserId: owner.externalUserId, memoryId }) });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
