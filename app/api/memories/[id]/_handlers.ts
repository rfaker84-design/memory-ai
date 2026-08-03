import { NextRequest, NextResponse } from "next/server";

import {
  MemoryMediaConflictError,
  MemoryNotFoundError,
  MemoryValidationError,
} from "../../../../features/memory/errors";
import { MemoryPostgresDataSource } from "../../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../../features/memory/memory-repository";
import { MemoryService } from "../../../../features/memory/memory-service";
import type { UpdateOwnedMemoryInput } from "../../../../features/memory/types";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "../../../../src/server/database";
import { requireAllowedOrigin } from "../../../../src/server/auth";
import { AuthConfigurationError } from "../../../../src/server/auth";
import {
  resolveSessionOwner,
  type SessionResolver,
} from "../_session-user-boundary";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string }> };
type MemoryItemService = Pick<
  MemoryService,
  "getMemoryForUser" | "updateMemoryForUser" | "deleteMemoryForUser"
>;
type ServiceFactory = () => MemoryItemService;

const createMemoryService: ServiceFactory = () =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

const json = (body: unknown, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

const noContent = (init?: ResponseInit) =>
  applyAuthNoStore(new NextResponse(null, init));

const allowedUpdateFields = new Set([
  "name",
  "relationship",
  "lifeStory",
  "personalityProfile",
  "speechStyle",
  "catchPhrases",
  "photoUrl",
  "personalityTags",
  "birthYear",
  "deathYear",
  "valuesBelief",
  "personalityType",
  "fragments",
]);

function errorResponse(error: unknown) {
  if (error instanceof MemoryValidationError) {
    return json(
      { error: "INVALID_REQUEST", message: error.message },
      { status: 400 }
    );
  }
  if (error instanceof MemoryNotFoundError) {
    return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof MemoryMediaConflictError) {
    return json(
      {
        error: "MEMORY_MEDIA_NOT_CLEAN",
        message: "Delete media and wait for object cleanup before deleting this memory",
      },
      { status: 409 }
    );
  }
  if (error instanceof DatabaseDependencyError) {
    console.error(
      "[api:memory-item] database request failed",
      safeDatabaseErrorLog(error)
    );
    return json(
      { error: "Database dependency unavailable" },
      { status: 503 }
    );
  }
  if (error instanceof AuthConfigurationError) {
    return json(
      { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
      { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 }
    );
  }
  console.error("[api:memory-item] unexpected request failure");
  return json({ error: "Internal server error" }, { status: 500 });
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function validateUpdateBody(value: unknown): UpdateOwnedMemoryInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MemoryValidationError("PATCH body must be a JSON object");
  }

  const body = value as Record<string, unknown>;
  const fields = Object.keys(body);
  if (fields.length === 0) {
    throw new MemoryValidationError("PATCH body must not be empty");
  }
  const unsupported = fields.filter((field) => !allowedUpdateFields.has(field));
  if (unsupported.length > 0) {
    throw new MemoryValidationError(
      `Unsupported PATCH field: ${unsupported.sort().join(", ")}`
    );
  }

  for (const field of ["name", "relationship"] as const) {
    if (field in body && typeof body[field] !== "string") {
      throw new MemoryValidationError(`${field} must be a string`);
    }
  }
  for (const field of [
    "lifeStory",
    "personalityProfile",
    "speechStyle",
    "catchPhrases",
    "photoUrl",
    "valuesBelief",
    "personalityType",
  ] as const) {
    if (field in body && !isStringOrNull(body[field])) {
      throw new MemoryValidationError(`${field} must be a string or null`);
    }
  }
  for (const field of ["birthYear", "deathYear"] as const) {
    if (
      field in body &&
      body[field] !== null &&
      typeof body[field] !== "number"
    ) {
      throw new MemoryValidationError(`${field} must be a number or null`);
    }
  }
  if (
    "personalityTags" in body &&
    body.personalityTags !== null &&
    typeof body.personalityTags !== "string" &&
    !(
      Array.isArray(body.personalityTags) &&
      body.personalityTags.every((tag) => typeof tag === "string")
    )
  ) {
    throw new MemoryValidationError(
      "personalityTags must be a string, string array, or null"
    );
  }
  if (
    "fragments" in body &&
    !(
      Array.isArray(body.fragments) &&
      body.fragments.every(
        (fragment) =>
          fragment &&
          typeof fragment === "object" &&
          !Array.isArray(fragment) &&
          Object.keys(fragment).every((key) =>
            ["sourceType", "content"].includes(key)
          ) &&
          typeof (fragment as Record<string, unknown>).sourceType === "string" &&
          typeof (fragment as Record<string, unknown>).content === "string"
      )
    )
  ) {
    throw new MemoryValidationError(
      "fragments must contain only sourceType and content strings"
    );
  }

  return body as UpdateOwnedMemoryInput;
}

export function createMemoryItemHandlers(
  serviceFactory: ServiceFactory = createMemoryService,
  sessionResolver?: SessionResolver
) {
  return {
    async GET(req: NextRequest, context: Context) {
      const owner = await resolveSessionOwner(
        req,
        req.nextUrl.searchParams.has("userId")
          ? req.nextUrl.searchParams.get("userId")
          : undefined,
        sessionResolver
      );
      if ("response" in owner) return owner.response;
      try {
        const { id } = await context.params;
        const memory = await serviceFactory().getMemoryForUser(id, owner.externalUserId);
        if (!memory) throw new MemoryNotFoundError("Memory not found");
        return json(memory);
      } catch (error) {
        return errorResponse(error);
      }
    },

    async PATCH(req: NextRequest, context: Context) {
      const owner = await resolveSessionOwner(
        req,
        req.nextUrl.searchParams.has("userId")
          ? req.nextUrl.searchParams.get("userId")
          : undefined,
        sessionResolver
      );
      if ("response" in owner) return owner.response;
      try {
        requireAllowedOrigin(req);
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return json({ error: "INVALID_JSON" }, { status: 400 });
        }
        const body = validateUpdateBody(rawBody);
        const { id } = await context.params;
        const memory = await serviceFactory().updateMemoryForUser(
          id,
          owner.externalUserId,
          body
        );
        return json(memory);
      } catch (error) {
        return errorResponse(error);
      }
    },

    async DELETE(req: NextRequest, context: Context) {
      const owner = await resolveSessionOwner(
        req,
        req.nextUrl.searchParams.has("userId")
          ? req.nextUrl.searchParams.get("userId")
          : undefined,
        sessionResolver
      );
      if ("response" in owner) return owner.response;
      try {
        requireAllowedOrigin(req);
        const { id } = await context.params;
        await serviceFactory().deleteMemoryForUser(id, owner.externalUserId);
        return noContent({ status: 204 });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
