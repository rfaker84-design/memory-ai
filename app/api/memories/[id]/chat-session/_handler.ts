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
import { temporaryExternalUserIdFromBody } from "../../_temporary-user-boundary";

type Context = { params: Promise<{ id: string }> };
type MemoryOwnershipService = Pick<MemoryService, "getMemoryForUser">;
type ChatSessionService = Pick<
  ChatService,
  "getOrCreateConversationByMemory" | "listMessages"
>;

const createChatService = (): ChatSessionService =>
  new ChatService(new ChatRepository(new ChatPostgresDataSource()));

const createMemoryService = (): MemoryOwnershipService =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

export function createChatSessionHandler(
  memoryServiceFactory: () => MemoryOwnershipService = createMemoryService,
  chatServiceFactory: () => ChatSessionService = createChatService
) {
  return async function POST(req: NextRequest, { params }: Context) {
    try {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
      }
      const userId = temporaryExternalUserIdFromBody(body);
      if (!userId) {
        return NextResponse.json(
          {
            error: "AUTH_MIGRATION_REQUIRED",
            message: "Temporary userId compatibility input is required",
          },
          { status: 400 }
        );
      }

      const { id: memoryId } = await params;
      const memory = await memoryServiceFactory().getMemoryForUser(
        memoryId,
        userId
      );
      if (!memory) {
        return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }

      const chatService = chatServiceFactory();
      const session = await chatService.getOrCreateConversationByMemory(
        userId,
        memoryId
      );
      const messages = await chatService.listMessages(session.id);
      return NextResponse.json({ session, messages });
    } catch (error) {
      if (error instanceof MemoryValidationError || error instanceof ChatValidationError) {
        return NextResponse.json(
          { error: "INVALID_REQUEST", message: error.message },
          { status: 400 }
        );
      }
      if (error instanceof DatabaseDependencyError) {
        console.error(
          "[api:memory-chat-session] database request failed",
          safeDatabaseErrorLog(error)
        );
        return NextResponse.json(
          { error: "Database dependency unavailable" },
          { status: 503 }
        );
      }
      console.error("[api:memory-chat-session] unexpected request failure");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
