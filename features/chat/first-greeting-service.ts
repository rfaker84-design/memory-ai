import { resolveFormalLLMProvider } from "../../services/llm/formal-llm-provider";
import type { LLMProvider } from "../../services/llm/llm-provider";
import type { LLMMessage } from "../../services/llm/types";
import type { Memory } from "../memory/types";
import type { ChatService } from "./chat-service";
import type { Message } from "./types";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export class FirstGreetingProviderError extends Error {}
export class FirstGreetingInProgressError extends Error {}

export interface CreateFirstGreetingInput {
  userId: string;
  memoryId: string;
  idempotencyKey: string;
  memory: Pick<
    Memory,
    | "id"
    | "userId"
    | "name"
    | "relationship"
    | "lifeStory"
    | "personalityProfile"
    | "speechStyle"
    | "catchPhrases"
    | "valuesBelief"
    | "personalityType"
  >;
}

export interface FirstGreetingResult {
  message: Message;
  sessionId: string;
  replayed: boolean;
}

function resolveProvider(): LLMProvider {
  try {
    return resolveFormalLLMProvider();
  } catch {
    throw new FirstGreetingProviderError("First greeting provider is unavailable");
  }
}

function validateIdempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new Error("Idempotency-Key is invalid");
  }
  return value;
}

function savedProfile(memory: CreateFirstGreetingInput["memory"]): string[] {
  const fields: Array<[string, string | null | undefined]> = [
    ["名字", memory.name],
    ["关系", memory.relationship],
    ["生平", memory.lifeStory],
    ["人格档案", memory.personalityProfile],
    ["说话风格", memory.speechStyle],
    ["常用语", memory.catchPhrases],
    ["价值观", memory.valuesBelief],
    ["性格类型", memory.personalityType],
  ];
  return fields
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([label, value]) => `${label}：${value?.trim()}`);
}

export function buildFirstGreetingPrompt(
  memory: CreateFirstGreetingInput["memory"]
): LLMMessage[] {
  const profile = savedProfile(memory);
  return [
    {
      role: "system",
      content: [
        "你正在生成一次首次问候，不存在用户消息或既有对话。",
        "只能使用以下已保存的亲人档案；不能编造、补充或猜测档案之外的人生事实、经历或关系细节。",
        "若档案没有足够细节，请保持简短、温和，并承认不知道具体细节。",
        "档案中已确认的称呼、常用语、说话风格和共同回忆必须被尊重；若适合首次问候，请自然使用，不得用通用固定问候替代。",
        "不要声称用户已经说过、经历过或同意过任何事情。",
        "已保存档案：",
        ...(profile.length > 0 ? profile.map((line) => `- ${line}`) : ["- 无额外资料"]),
      ].join("\n"),
    },
  ];
}

export class FirstGreetingService {
  constructor(
    private readonly chatService: Pick<
      ChatService,
      "claimFirstGreeting" | "completeFirstGreeting" | "failFirstGreeting"
    >,
    private readonly provider: LLMProvider = resolveProvider()
  ) {}

  async create(input: CreateFirstGreetingInput): Promise<FirstGreetingResult> {
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const claim = await this.chatService.claimFirstGreeting({
      userId: input.userId,
      memoryId: input.memoryId,
      idempotencyKey,
    });

    if (claim.status === "replayed") {
      if (!claim.message) {
        throw new Error("First greeting replay is inconsistent");
      }
      return {
        message: claim.message,
        sessionId: claim.conversation.id,
        replayed: true,
      };
    }
    if (claim.status === "in_progress") {
      throw new FirstGreetingInProgressError("First greeting is in progress");
    }

    let content: string;
    try {
      const response = await this.provider.generate({
        messages: buildFirstGreetingPrompt(input.memory),
      });
      content = response.content.trim();
      if (!content) {
        throw new FirstGreetingProviderError("First greeting provider returned no content");
      }
    } catch (error) {
      try {
        await this.chatService.failFirstGreeting({
          userId: input.userId,
          memoryId: input.memoryId,
          idempotencyKey,
        });
      } catch {
        // Preserve the provider failure without exposing its details.
      }
      if (error instanceof FirstGreetingProviderError) throw error;
      throw new FirstGreetingProviderError("First greeting provider failed");
    }

    try {
      const message = await this.chatService.completeFirstGreeting({
        userId: input.userId,
        memoryId: input.memoryId,
        idempotencyKey,
        conversationId: claim.conversation.id,
        content,
      });
      return { message, sessionId: claim.conversation.id, replayed: false };
    } catch (error) {
      try {
        await this.chatService.failFirstGreeting({
          userId: input.userId,
          memoryId: input.memoryId,
          idempotencyKey,
        });
      } catch {
        // Preserve the persistence failure without exposing provider details.
      }
      throw error;
    }
  }
}
