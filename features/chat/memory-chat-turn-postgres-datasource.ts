import { createHash } from "node:crypto";

import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import { ChatNotFoundError, ChatValidationError } from "./errors";
import type { MemoryChatTurnDataSource } from "./memory-chat-turn-datasource";
import type {
  ClaimMemoryChatTurnInput,
  CompleteMemoryChatTurnInput,
  MemoryChatTurnClaim,
  MemoryChatTurnResult,
} from "./memory-chat-turn-types";
import type { Conversation, Message } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

type ConversationRow = {
  id: string;
  memory_id: string;
  external_id: string;
  title: string | null;
  summary: string | null;
  last_message_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};
type MessageRow = {
  id: string;
  conversation_id: string | null;
  memory_id: string;
  external_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string;
};
type TurnRow = {
  conversation_id: string;
  request_hash: string;
  status: "pending" | "completed" | "failed";
  user_message_id: string | null;
  assistant_message_id: string | null;
};

const conversationColumns = `c.id, c.memory_id, u.external_id, c.title, c.summary,
  c.last_message_at, c.created_at, c.updated_at`;
const messageColumns = `m.id, m.conversation_id, m.memory_id, u.external_id,
  m.role, m.content, m.tokens, m.metadata, m.created_at`;

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    memoryId: row.memory_id,
    userId: row.external_id,
    title: row.title,
    summary: row.summary,
    lastMessageAt: row.last_message_at ? iso(row.last_message_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.conversation_id,
    memoryId: row.memory_id,
    userId: row.external_id,
    role: row.role,
    content: row.content,
    tokens: row.tokens,
    metadata: row.metadata,
    createdAt: iso(row.created_at),
  };
}

function required(value: string, field: string, maxLength = 8_000): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new ChatValidationError(`${field} is invalid`);
  }
  return normalized;
}

function uuid(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) throw new ChatValidationError(`${field} is invalid`);
  return value;
}

function idempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new ChatValidationError("Idempotency-Key is invalid");
  }
  return value;
}

function requestHash(question: string): string {
  return createHash("sha256").update(question).digest("hex");
}

async function lockOwnedMemory(
  client: PoolClient,
  externalUserId: string,
  memoryId: string
): Promise<string> {
  const result = await client.query<{ user_id: string }>(
    `SELECT m.user_id
     FROM memories m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND u.external_id = $2
     FOR KEY SHARE OF m`,
    [memoryId, externalUserId]
  );
  if (!result.rows[0]) throw new ChatNotFoundError("Owned memory was not found");
  return result.rows[0].user_id;
}

async function lockTurnScope(
  client: PoolClient,
  externalUserId: string,
  memoryId: string
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`memoryai:chat-turn:${externalUserId}:${memoryId}`]
  );
}

async function getOrCreateConversation(
  client: PoolClient,
  internalUserId: string,
  memoryId: string
): Promise<Conversation> {
  const created = await client.query<ConversationRow>(
    `WITH written AS (
       INSERT INTO conversations (user_id, memory_id, title, is_default)
       VALUES ($1, $2, '默认会话', TRUE)
       ON CONFLICT (user_id, memory_id) WHERE is_default DO NOTHING
       RETURNING *
     )
     SELECT written.id, written.memory_id, u.external_id, written.title,
       written.summary, written.last_message_at, written.created_at, written.updated_at
     FROM written
     JOIN users u ON u.id = written.user_id`,
    [internalUserId, memoryId]
  );
  if (created.rows[0]) return toConversation(created.rows[0]);

  const existing = await client.query<ConversationRow>(
    `SELECT ${conversationColumns}
     FROM conversations c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1 AND c.memory_id = $2 AND c.is_default
     LIMIT 1
     FOR UPDATE OF c`,
    [internalUserId, memoryId]
  );
  if (existing.rows[0]) return toConversation(existing.rows[0]);

  throw new ChatValidationError("Default conversation was not available");
}

async function getMessage(
  client: PoolClient,
  id: string,
  internalUserId: string,
  memoryId: string,
  conversationId: string,
  role: "user" | "assistant"
): Promise<Message | null> {
  const result = await client.query<MessageRow>(
    `SELECT ${messageColumns}
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND m.user_id = $2 AND m.memory_id = $3
       AND m.conversation_id = $4 AND m.role = $5
     LIMIT 1`,
    [id, internalUserId, memoryId, conversationId, role]
  );
  return result.rows[0] ? toMessage(result.rows[0]) : null;
}

async function completedResult(
  client: PoolClient,
  turn: TurnRow,
  internalUserId: string,
  memoryId: string,
  conversation: Conversation
): Promise<MemoryChatTurnResult> {
  if (!turn.user_message_id || !turn.assistant_message_id) {
    throw new ChatValidationError("Completed chat turn is inconsistent");
  }
  const [userMessage, assistantMessage] = await Promise.all([
    getMessage(client, turn.user_message_id, internalUserId, memoryId, conversation.id, "user"),
    getMessage(client, turn.assistant_message_id, internalUserId, memoryId, conversation.id, "assistant"),
  ]);
  if (!userMessage || !assistantMessage) {
    throw new ChatValidationError("Completed chat turn messages are inconsistent");
  }
  return { conversation, userMessage, assistantMessage };
}

async function insertMessage(
  client: PoolClient,
  conversationId: string,
  internalUserId: string,
  memoryId: string,
  role: "user" | "assistant",
  content: string,
  idempotency: string
): Promise<Message> {
  const result = await client.query<MessageRow>(
    `WITH written AS (
       INSERT INTO messages (
         conversation_id, user_id, memory_id, role, content, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *
     )
     SELECT written.id, written.conversation_id, written.memory_id, u.external_id,
       written.role, written.content, written.tokens, written.metadata, written.created_at
     FROM written
     JOIN users u ON u.id = written.user_id`,
    [
      conversationId,
      internalUserId,
      memoryId,
      role,
      content,
      JSON.stringify({ kind: "memory_chat_turn", idempotencyKey: idempotency }),
    ]
  );
  return toMessage(result.rows[0]);
}

export class MemoryChatTurnPostgresDataSource
  implements MemoryChatTurnDataSource
{
  async claim(input: ClaimMemoryChatTurnInput): Promise<MemoryChatTurnClaim> {
    const externalUserId = required(input.userId, "userId", 255);
    const memoryId = uuid(input.memoryId, "memoryId");
    const key = idempotencyKey(input.idempotencyKey);
    const question = required(input.question, "question");
    const hash = requestHash(question);

    return withPostgresTransaction(async (client) => {
      const internalUserId = await lockOwnedMemory(client, externalUserId, memoryId);
      await lockTurnScope(client, externalUserId, memoryId);
      const existing = await client.query<TurnRow>(
        `SELECT conversation_id, request_hash, status, user_message_id, assistant_message_id
         FROM memory_chat_turns
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [internalUserId, memoryId, key]
      );
      const conversation = await getOrCreateConversation(client, internalUserId, memoryId);

      if (existing.rows[0]) {
        const turn = existing.rows[0];
        if (turn.request_hash !== hash || turn.conversation_id !== conversation.id) {
          throw new ChatValidationError("Idempotency-Key conflicts with a different request");
        }
        if (turn.status === "completed") {
          return {
            status: "replayed",
            conversation,
            result: await completedResult(client, turn, internalUserId, memoryId, conversation),
          };
        }
        if (turn.status === "pending") return { status: "in_progress", conversation };
        if (turn.status !== "failed") {
          throw new ChatValidationError("Chat turn status is invalid");
        }

        await client.query(
          `UPDATE memory_chat_turns
           SET status = 'pending', updated_at = NOW()
           WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3`,
          [internalUserId, memoryId, key]
        );
        return { status: "claimed", conversation };
      }

      await client.query(
        `INSERT INTO memory_chat_turns (
           user_id, memory_id, conversation_id, idempotency_key, request_hash, status
         ) VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [internalUserId, memoryId, conversation.id, key, hash]
      );
      return { status: "claimed", conversation };
    });
  }

  async complete(input: CompleteMemoryChatTurnInput): Promise<MemoryChatTurnResult> {
    const externalUserId = required(input.userId, "userId", 255);
    const memoryId = uuid(input.memoryId, "memoryId");
    const conversationId = uuid(input.conversationId, "conversationId");
    const key = idempotencyKey(input.idempotencyKey);
    const question = required(input.question, "question");
    const answer = required(input.answer, "answer");
    const hash = requestHash(question);

    return withPostgresTransaction(async (client) => {
      const internalUserId = await lockOwnedMemory(client, externalUserId, memoryId);
      await lockTurnScope(client, externalUserId, memoryId);
      const state = await client.query<TurnRow>(
        `SELECT conversation_id, request_hash, status, user_message_id, assistant_message_id
         FROM memory_chat_turns
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [internalUserId, memoryId, key]
      );
      const turn = state.rows[0];
      if (!turn || turn.request_hash !== hash || turn.conversation_id !== conversationId) {
        throw new ChatValidationError("Chat turn claim was not found");
      }
      const conversationResult = await client.query<ConversationRow>(
        `SELECT ${conversationColumns}
         FROM conversations c
         JOIN users u ON u.id = c.user_id
         WHERE c.id = $1 AND c.user_id = $2 AND c.memory_id = $3
         FOR UPDATE OF c`,
        [conversationId, internalUserId, memoryId]
      );
      const conversationRow = conversationResult.rows[0];
      if (!conversationRow) throw new ChatNotFoundError("Conversation was not found");
      const conversation = toConversation(conversationRow);
      if (turn.status === "completed") {
        return completedResult(client, turn, internalUserId, memoryId, conversation);
      }
      if (turn.status !== "pending") {
        throw new ChatValidationError("Chat turn is not pending");
      }

      const userMessage = await insertMessage(
        client, conversationId, internalUserId, memoryId, "user", question, key
      );
      const assistantMessage = await insertMessage(
        client, conversationId, internalUserId, memoryId, "assistant", answer, key
      );
      await client.query(
        `UPDATE memory_chat_turns
         SET status = 'completed', user_message_id = $4, assistant_message_id = $5,
           updated_at = NOW()
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3`,
        [internalUserId, memoryId, key, userMessage.id, assistantMessage.id]
      );
      await client.query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND memory_id = $3`,
        [conversationId, internalUserId, memoryId]
      );
      await client.query(
        `INSERT INTO public.business_funnel_events (user_id, memory_id, event_type, event_key)
         VALUES ($1, $2, 'first_conversation_completed', $3)
         ON CONFLICT (event_type, event_key) DO NOTHING`,
        [internalUserId, memoryId, `first_conversation_completed:${memoryId}`],
      );
      return { conversation, userMessage, assistantMessage };
    });
  }

  async fail(input: ClaimMemoryChatTurnInput): Promise<void> {
    const externalUserId = required(input.userId, "userId", 255);
    const memoryId = uuid(input.memoryId, "memoryId");
    const key = idempotencyKey(input.idempotencyKey);

    await withPostgresTransaction(async (client) => {
      const internalUserId = await lockOwnedMemory(client, externalUserId, memoryId);
      await lockTurnScope(client, externalUserId, memoryId);
      await client.query(
        `UPDATE memory_chat_turns
         SET status = 'failed', updated_at = NOW()
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
           AND status = 'pending'`,
        [internalUserId, memoryId, key]
      );
    });
  }
}
