import { NextRequest, NextResponse } from "next/server";

import {
  ChatRepository,
  ChatService,
  ChatPostgresDataSource,
} from "../../../../../features/chat";
import {
  MemoryEngineService,
} from "../../../../../features/memory-engine";
import { MemoryExtractor } from "../../../../../features/long-term-memory/memory-extractor";
import {
  LongTermMemoryRepository,
  LongTermMemoryService,
  LongTermMemorySupabaseDataSource,
} from "../../../../../features/long-term-memory";
import { AuditService, AuditRepository, AuditPostgresDataSource } from "../../../../../features/audit";
import { RiskService, RiskRepository, RiskSupabaseDataSource } from "../../../../../features/risk";
import { PermissionService, PermissionRepository, PermissionSupabaseDataSource } from "../../../../../features/permission";

const createChatService = () => {
  const dataSource = new ChatPostgresDataSource();
  const repository = new ChatRepository(dataSource);

  return new ChatService(repository);
};

const createLTService = () => {
  const dataSource = new LongTermMemorySupabaseDataSource();
  const repository = new LongTermMemoryRepository(dataSource);

  return new LongTermMemoryService(repository);
};

const createAuditService = () =>
  new AuditService(new AuditRepository(new AuditPostgresDataSource()));

const createPermissionService = () =>
  new PermissionService(new PermissionRepository(new PermissionSupabaseDataSource()));
const createRiskService = () =>
  new RiskService(new RiskRepository(new RiskSupabaseDataSource()));

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = _req.nextUrl.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const perm = await createPermissionService().check({
      userId,
      resourceType: "chat_session",
      resourceId: id,
      action: "read",
    });

    if (!perm.allowed) {
      return NextResponse.json({ error: perm.reason }, { status: 403 });
    }

    const chatService = createChatService();
    const messages = await chatService.listMessages(id);

    return NextResponse.json(messages);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await req.json();
    const { memoryId, userId, content } = body;

    if (!memoryId || !userId || !content) {
      return NextResponse.json(
        { error: "Missing memoryId, userId, or content" },
        { status: 400 }
      );
    }

    const perm = await createPermissionService().check({
      userId,
      resourceType: "chat_session",
      resourceId: id,
      action: "create",
    });

    if (!perm.allowed) {
      return NextResponse.json({ error: perm.reason }, { status: 403 });
    }

    try {
      const riskResult = createRiskService().detect({
        userId,
        memoryId,
        userMessage: content,
      });

      if (riskResult.detected) {
        await createRiskService().log({
          userId,
          memoryId,
          riskType: riskResult.riskType!,
          level: riskResult.level!,
          message: riskResult.message!,
          metadata: { sessionId: id, userMessage: content.substring(0, 200) },
        });

        if (riskResult.level === "critical") {
          await createAuditService().log({
            userId,
            memoryId,
            action: "risk.detected",
            level: "critical",
            message: riskResult.message!,
            metadata: { riskType: riskResult.riskType, sessionId: id, userMessage: content.substring(0, 200) },
          });
        }
      }
    } catch (riskErr) {
      console.warn("risk detection/logging failed (non-blocking):", riskErr);
    }

    const chatService = createChatService();
    const userMessage = await chatService.sendMessage({
      sessionId: id,
      memoryId,
      userId,
      role: "user",
      content,
    });

    const memoryEngine = new MemoryEngineService();
    const engineResponse = await memoryEngine.generateReply({
      userId,
      memoryId,
      sessionId: id,
      userMessage: content,
    });

    const assistantMessage = await chatService.sendMessage({
      sessionId: id,
      memoryId,
      userId,
      role: "assistant",
      content: engineResponse.content,
    });

    // ---- Long-term memory extraction (non-blocking) ----
    try {
      const extractor = new MemoryExtractor();
      const extractResult = extractor.extract({
        userId,
        memoryId,
        sessionId: id,
        userMessage: content,
        assistantMessage: engineResponse.content,
      });

      if (extractResult.shouldRemember) {
        const ltmService = createLTService();

        await ltmService.createMemory({
          userId,
          memoryId,
          content: extractResult.content ?? content,
          sourceType: "chat",
          sourceId: assistantMessage.id ?? id,
          importance: extractResult.importance,
          tags: extractResult.tags,
        });
      }
    } catch (ltmError) {
      console.warn(
        "Long-term memory extraction/persistence failed (non-blocking):",
        ltmError
      );
    }

    try {
      await createAuditService().log({
        userId,
        memoryId,
        action: "chat.message.created",
        level: "info",
        message: "聊天消息创建成功",
        metadata: { sessionId: id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id },
      });
    } catch (e) {
      console.warn("audit chat failed:", e);
    }

    try {
      await createAuditService().log({
        userId,
        memoryId,
        action: "ai.reply.generated",
        level: "info",
        message: "AI 回复生成成功",
        metadata: { sessionId: id, assistantMessageId: assistantMessage.id, provider: process.env.LLM_PROVIDER || "mock" },
      });
    } catch (e) {
      console.warn("audit ai failed:", e);
    }

    return NextResponse.json({ userMessage, assistantMessage });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
