import { NextRequest, NextResponse } from "next/server";

import {
  ChatPostgresDataSource,
  ChatRepository,
  ChatService,
} from "../../../../../features/chat";
import { ChatValidationError } from "../../../../../features/chat/errors";
import { MemoryValidationError } from "../../../../../features/memory/errors";
import { MemoryPostgresDataSource } from "../../../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../../../features/memory/memory-repository";
import { MemoryService } from "../../../../../features/memory/memory-service";
import {
  DatabaseDependencyError,
  safeDatabaseErrorLog,
} from "../../../../../src/server/database";
import { requireAllowedOrigin } from "../../../../../src/server/auth";
import { AuthConfigurationError } from "../../../../../src/server/auth";
import {
  resolveSessionOwner,
  type SessionResolver,
} from "../../_session-user-boundary";
import { applyAuthNoStore } from "@/src/server/security/auth-cache";

type Context = { params: Promise<{ id: string }> };
type MemoryOwnershipService = Pick<MemoryService, "getMemoryForUser">;
type ChatSessionService = Pick<
  ChatService,
  "getOrCreateConversationByMemory" | "listMessages" | "clearMessagesForMemory"
>;
const CLEAR_CHAT_HISTORY_CONFIRMATION = "CLEAR_CHAT_HISTORY";

const createChatService = (): ChatSessionService =>
  new ChatService(new ChatRepository(new ChatPostgresDataSource()));

const createMemoryService = (): MemoryOwnershipService =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

const json = (body: unknown, init?: ResponseInit) =>
  applyAuthNoStore(NextResponse.json(body, init));

function isClearChatHistoryRequest(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return Object.keys(value).length === 2
    && value.action === "clear_chat_history"
    && value.confirmation === CLEAR_CHAT_HISTORY_CONFIRMATION;
}

export function createChatSessionHandler(
  memoryServiceFactory: () => MemoryOwnershipService = createMemoryService,
  chatServiceFactory: () => ChatSessionService = createChatService,
  sessionResolver?: SessionResolver
) {
  return async function POST(req: NextRequest, { params }: Context) {
    try {
      requireAllowedOrigin(req);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ error: "INVALID_JSON" }, { status: 400 });
      }
      const compatibilityUserId = body && typeof body === "object" && !Array.isArray(body)
        && "userId" in body ? (body as Record<string, unknown>).userId : undefined;
      const owner = await resolveSessionOwner(req, compatibilityUserId, sessionResolver);
      if ("response" in owner) return owner.response;
      const userId = owner.externalUserId;

      const { id: memoryId } = await params;
      const memory = await memoryServiceFactory().getMemoryForUser(
        memoryId,
        userId
      );
      if (!memory) {
        return json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }

      const chatService = chatServiceFactory();
      if (isClearChatHistoryRequest(body)) {
        const clearedCount = await chatService.clearMessagesForMemory(userId, memoryId);
        return json({ cleared: true, clearedCount });
      }
      if (body && typeof body === "object" && !Array.isArray(body)
        && ("action" in body || "confirmation" in body)) {
        return json({ error: "INVALID_REQUEST" }, { status: 400 });
      }
      const session = await chatService.getOrCreateConversationByMemory(
        userId,
        memoryId
      );
      const messages = await chatService.listMessages(session.id);
      return json({ session, messages });
    } catch (error) {
      if (error instanceof MemoryValidationError || error instanceof ChatValidationError) {
        return json(
          { error: "INVALID_REQUEST", message: error.message },
          { status: 400 }
        );
      }
      if (error instanceof DatabaseDependencyError) {
        console.error(
          "[api:memory-chat-session] database request failed",
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
      console.error("[api:memory-chat-session] unexpected request failure");
      return json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
