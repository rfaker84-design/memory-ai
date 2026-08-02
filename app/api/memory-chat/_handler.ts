import { NextRequest, NextResponse } from "next/server";

import { ChatNotFoundError, ChatValidationError } from "../../../features/chat/errors";
import { MemoryChatTurnPostgresDataSource } from "../../../features/chat/memory-chat-turn-postgres-datasource";
import { MemoryChatTurnRepository } from "../../../features/chat/memory-chat-turn-repository";
import { MemoryChatTurnService } from "../../../features/chat/memory-chat-turn-service";
import type { MemoryChatTurnResult } from "../../../features/chat/memory-chat-turn-types";
import { MemoryEngineService } from "../../../features/memory-engine/memory-engine-service";
import { assertSafeMemorialResponse } from "../../../features/memory-engine/response-pipeline";
import { crisisResponseFor } from "../../../features/memory-engine/crisis-response";
import { MemoryValidationError } from "../../../features/memory/errors";
import { MemoryPostgresDataSource } from "../../../features/memory/memory-postgres-datasource";
import { MemoryRepository } from "../../../features/memory/memory-repository";
import { MemoryService } from "../../../features/memory/memory-service";
import {
  PaymentPostgresDataSource,
  PaymentRepository,
  PaymentService,
  isLegacyChatCommerceTestAccount,
} from "../../../features/payment";
import {
  AuthConfigurationError,
  requireAllowedOrigin,
  type AuthSession,
  verifyRequestSession,
} from "../../../src/server/auth";
import { DatabaseDependencyError, safeDatabaseErrorLog } from "../../../src/server/database";

type MemoryChatRequest = { memoryId: string; question: string };
type MemoryOwnershipService = Pick<MemoryService, "getMemoryForUser">;
type TurnService = Pick<MemoryChatTurnService, "claim" | "complete" | "fail">;
type EngineService = Pick<MemoryEngineService, "generateReply">;
type SessionResolver = (request: NextRequest) => Promise<AuthSession | null>;
type PersistCompletedTurn = (input: {
  externalUserId: string;
  memoryId: string;
  result: MemoryChatTurnResult;
}) => Promise<boolean>;
type AdmissionDecision = { rateAllowed: boolean; concurrencyAllowed: boolean };
type AdmissionControl = (externalUserId: string) => Promise<AdmissionDecision>;
type QuotaReservation = "free" | "reserved" | "unavailable";
type QuotaService = {
  reserveChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<QuotaReservation>;
  releaseChatQuota(input: { externalUserId: string; memoryId: string; idempotencyKey: string }): Promise<void>;
};
type LongTermMemoryAccess = (externalUserId: string) => boolean;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

const createMemoryService = (): MemoryOwnershipService =>
  new MemoryService(new MemoryRepository(new MemoryPostgresDataSource()));

const createTurnService = (): TurnService =>
  new MemoryChatTurnService(
    new MemoryChatTurnRepository(new MemoryChatTurnPostgresDataSource())
  );

const createEngineService = (): EngineService => new MemoryEngineService();

const checkAdmission: AdmissionControl = async (externalUserId) => {
  const [{ checkRateLimit }, { checkConcurrency }] = await Promise.all([
    import("../../../src/lib/cost-control"),
    import("../../../src/lib/concurrency-control"),
  ]);
  return {
    rateAllowed: checkRateLimit(externalUserId).allowed,
    concurrencyAllowed: checkConcurrency(externalUserId, "ai").allowed,
  };
};

const freeQuotaService: QuotaService = {
  reserveChatQuota: async () => "free",
  releaseChatQuota: async () => undefined,
};

export const createPaymentQuotaService = (): QuotaService => {
  let legacyService: PaymentService | undefined;
  const service = () => legacyService ??= new PaymentService(
    new PaymentRepository(new PaymentPostgresDataSource()),
  );
  return {
    reserveChatQuota: (input) =>
      isLegacyChatCommerceTestAccount(input.externalUserId)
        ? service().reserveChatQuota(input)
        : Promise.resolve("free"),
    releaseChatQuota: (input) =>
      isLegacyChatCommerceTestAccount(input.externalUserId)
        ? service().releaseChatQuota(input)
        : Promise.resolve(),
  };
};

function response(result: MemoryChatTurnResult) {
  const answer = result.assistantMessage.content;
  return NextResponse.json({
    answer,
    reply: answer,
    text: answer,
    sessionId: result.conversation.id,
  });
}

function isSafeQuestion(question: string): boolean {
  return !(
    /<\s*\/?\s*script\b/i.test(question)
    || /\bon[a-z]+\s*=/i.test(question)
    || /javascript\s*:/i.test(question)
  );
}

function parseBody(value: unknown): MemoryChatRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.every((key) => key === "memoryId" || key === "question")) {
    return null;
  }
  if (typeof body.memoryId !== "string" || typeof body.question !== "string") return null;
  const memoryId = body.memoryId.trim();
  const question = body.question.trim();
  if (!memoryId || !question || Array.from(question).length > 4_000 || !isSafeQuestion(question)) {
    return null;
  }
  return { memoryId, question };
}

export function createMemoryChatHandler(
  memoryServiceFactory: () => MemoryOwnershipService = createMemoryService,
  turnServiceFactory: () => TurnService = createTurnService,
  engineServiceFactory: () => EngineService = createEngineService,
  sessionResolver: SessionResolver = verifyRequestSession,
  // Kept as an injected compatibility seam for existing callers. Ordinary chat
  // must never turn a heuristic into a durable memory without an explicit user
  // confirmation flow, including in internal beta.
  persistTurn: PersistCompletedTurn = async () => false,
  admissionControl: AdmissionControl = checkAdmission,
  quotaServiceFactory: () => QuotaService = () => freeQuotaService,
  longTermMemoryAccess: LongTermMemoryAccess = () => false,
) {
  return async function POST(request: NextRequest) {
    void persistTurn;
    void longTermMemoryAccess;
    try {
      const session = await sessionResolver(request);
      if (!session) {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }
      requireAllowedOrigin(request);

      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey) {
        return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
      }
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        return NextResponse.json({ error: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });
      }
      if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
      }
      const parsed = parseBody(body);
      if (!parsed) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

      const userId = session.externalUserId;
      const memory = await memoryServiceFactory().getMemoryForUser(parsed.memoryId, userId);
      if (!memory) return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });

      const turnInput = { userId, memoryId: parsed.memoryId, idempotencyKey, question: parsed.question };
      const turnService = turnServiceFactory();
      const claim = await turnService.claim(turnInput);
      if (claim.status === "replayed") {
        if (!claim.result) throw new ChatValidationError("Completed chat turn is inconsistent");
        return response(claim.result);
      }
      if (claim.status === "in_progress") {
        return NextResponse.json({ error: "CHAT_TURN_IN_PROGRESS" }, { status: 409 });
      }

      const quotaService = quotaServiceFactory();
      let quota: QuotaReservation;
      try {
        quota = await quotaService.reserveChatQuota({
          externalUserId: userId, memoryId: parsed.memoryId, idempotencyKey,
        });
      } catch (error) {
        try { await turnService.fail(turnInput); } catch { console.warn("[memory-chat] CHAT_TURN_FAILURE_MARK_UNAVAILABLE"); }
        throw error;
      }
      if (quota === "unavailable") {
        await turnService.fail(turnInput);
        return NextResponse.json({ error: "PAYMENT_ENTITLEMENT_REQUIRED" }, { status: 402 });
      }
      let quotaReleased = false;
      const releaseQuota = async () => {
        if (quota === "reserved" && !quotaReleased) {
          quotaReleased = true;
          await quotaService.releaseChatQuota({ externalUserId: userId, memoryId: parsed.memoryId, idempotencyKey });
        }
      };

      const admission = await admissionControl(userId);
      if (!admission.rateAllowed) {
        await turnService.fail(turnInput);
        await releaseQuota();
        const answer = "忆见服务暂时繁忙，请稍后重试。";
        return NextResponse.json({ answer, reply: answer, text: answer });
      }
      if (!admission.concurrencyAllowed) {
        await turnService.fail(turnInput);
        await releaseQuota();
        const answer = "忆见正在处理上一条请求，请稍后重试。";
        return NextResponse.json({ answer, reply: answer, text: answer });
      }

      const crisisResponse = crisisResponseFor(parsed.question);
      if (crisisResponse) await releaseQuota();

      let answer: string;
      try {
        if (crisisResponse) {
          answer = crisisResponse;
        } else {
          const engineResponse = await engineServiceFactory().generateReply({
            userId,
            memoryId: parsed.memoryId,
            sessionId: claim.conversation.id,
            userMessage: parsed.question,
            routeContext: {
              memoryName: memory.name,
              relationship: memory.relationship,
              lifeStory: memory.lifeStory,
              personalityProfile: memory.personalityProfile,
              speechStyle: memory.speechStyle,
              catchPhrases: memory.catchPhrases,
            },
          });
          answer = assertSafeMemorialResponse(engineResponse.content.trim(), {
            memoryName: memory.name,
            relationship: memory.relationship,
          });
        }
        if (!answer) throw new Error("Provider returned no content");
      } catch {
        try {
          await turnService.fail(turnInput);
          await releaseQuota();
        } catch {
          console.warn("[memory-chat] CHAT_TURN_FAILURE_MARK_UNAVAILABLE");
        }
        return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
      }

      const result = await turnService.complete({
        ...turnInput,
        conversationId: claim.conversation.id,
        answer,
      });
      return response(result);
    } catch (error) {
      if (error instanceof MemoryValidationError || error instanceof ChatNotFoundError) {
        return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
      }
      if (error instanceof ChatValidationError) {
        return NextResponse.json({ error: "IDEMPOTENCY_KEY_CONFLICT" }, { status: 409 });
      }
      if (error instanceof DatabaseDependencyError) {
        console.warn("[memory-chat] DATABASE_UNAVAILABLE", safeDatabaseErrorLog(error));
        return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
      }
      if (error instanceof AuthConfigurationError) {
        return NextResponse.json(
          { error: error.code === "ORIGIN_NOT_ALLOWED" ? "ORIGIN_NOT_ALLOWED" : "AUTH_UNAVAILABLE" },
          { status: error.code === "ORIGIN_NOT_ALLOWED" ? 403 : 503 }
        );
      }
      console.error("[api:memory-chat] unexpected request failure");
      return NextResponse.json({ error: "CHAT_REQUEST_FAILED" }, { status: 500 });
    }
  };
}
