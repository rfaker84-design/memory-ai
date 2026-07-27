import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import type { ChatDataSource } from "./datasource";
import { ChatNotFoundError, ChatValidationError } from "./errors";
import type { Conversation, CreateConversationInput, CreateMessageInput, Message } from "./types";
import type {
  ClaimFirstGreetingInput,
  CompleteFirstGreetingInput,
  FirstGreetingClaim,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

type ConversationRow = {
  id: string; memory_id: string; external_id: string; title: string | null;
  summary: string | null; last_message_at: Date | string | null;
  created_at: Date | string; updated_at: Date | string;
};
type MessageRow = {
  id: string; conversation_id: string | null; memory_id: string; external_id: string;
  role: "user" | "assistant" | "system"; content: string; tokens: number | null;
  metadata: Record<string, unknown> | null; created_at: Date | string;
};

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const optionalIso = (value: Date | string | null) => value ? iso(value) : null;
const required = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) throw new ChatValidationError(`${field} is required`);
  return normalized;
};
const uuid = (value: string, field: string) => {
  if (!UUID_PATTERN.test(value)) throw new ChatValidationError(`${field} is invalid`);
  return value;
};
const idempotencyKey = (value: string) => {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new ChatValidationError("Idempotency-Key is invalid");
  }
  return value;
};
const conversationColumns = `c.id, c.memory_id, u.external_id, c.title, c.summary,
  c.last_message_at, c.created_at, c.updated_at`;
const messageColumns = `m.id, m.conversation_id, m.memory_id, u.external_id,
  m.role, m.content, m.tokens, m.metadata, m.created_at`;

function toConversation(row: ConversationRow): Conversation {
  return { id: row.id, memoryId: row.memory_id, userId: row.external_id,
    title: row.title, summary: row.summary, lastMessageAt: optionalIso(row.last_message_at),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function toMessage(row: MessageRow): Message {
  return { id: row.id, sessionId: row.conversation_id, memoryId: row.memory_id,
    userId: row.external_id, role: row.role, content: row.content, tokens: row.tokens,
    metadata: row.metadata, createdAt: iso(row.created_at) };
}
async function ensureUser(client: PoolClient, externalId: string) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (external_id) VALUES ($1)
     ON CONFLICT (external_id) DO UPDATE SET updated_at = users.updated_at RETURNING id`,
    [required(externalId, "userId")]
  );
  return result.rows[0].id;
}

type OwnedMemoryRow = { user_id: string };
type FirstGreetingStateRow = {
  conversation_id: string;
  status: "pending" | "completed" | "failed";
  assistant_message_id: string | null;
};

async function lockOwnedMemory(
  client: PoolClient,
  externalUserId: string,
  memoryId: string
): Promise<string | null> {
  const result = await client.query<OwnedMemoryRow>(
    `SELECT m.user_id
     FROM memories m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND u.external_id = $2
     FOR KEY SHARE OF m`,
    [memoryId, externalUserId]
  );
  return result.rows[0]?.user_id ?? null;
}

async function lockFirstGreetingScope(
  client: PoolClient,
  externalUserId: string,
  memoryId: string
): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`memoryai:first-greeting:${externalUserId}:${memoryId}`]
  );
}

async function getOrCreateDefaultConversation(
  client: PoolClient,
  userId: string,
  memoryId: string
): Promise<Conversation> {
  const created = await client.query<ConversationRow>(
    `WITH written AS (
       INSERT INTO conversations (user_id, memory_id, title, is_default)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (user_id, memory_id) WHERE is_default DO NOTHING
       RETURNING *
     )
     SELECT written.id, written.memory_id, u.external_id, written.title,
       written.summary, written.last_message_at, written.created_at, written.updated_at
     FROM written
     JOIN users u ON u.id = written.user_id`,
    [userId, memoryId, "默认会话"]
  );
  if (created.rows[0]) return toConversation(created.rows[0]);

  // A concurrent INSERT can win the partial unique index after this
  // transaction's first statement snapshot. A separate statement observes
  // that committed winner and locks it before returning it to the caller.
  const existing = await client.query<ConversationRow>(
    `SELECT ${conversationColumns}
     FROM conversations c
     JOIN users u ON u.id = c.user_id
     WHERE c.user_id = $1 AND c.memory_id = $2 AND c.is_default
     LIMIT 1
     FOR UPDATE OF c`,
    [userId, memoryId]
  );
  if (existing.rows[0]) return toConversation(existing.rows[0]);

  throw new ChatValidationError("Default conversation was not available");
}

async function getGreetingMessage(
  client: PoolClient,
  messageId: string,
  userId: string,
  memoryId: string,
  conversationId: string
): Promise<Message | null> {
  const result = await client.query<MessageRow>(
    `SELECT ${messageColumns}
     FROM messages m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1
       AND m.user_id = $2
       AND m.memory_id = $3
       AND m.conversation_id = $4
       AND m.role = 'assistant'
     LIMIT 1`,
    [messageId, userId, memoryId, conversationId]
  );
  return result.rows[0] ? toMessage(result.rows[0]) : null;
}

export class ChatPostgresDataSource implements ChatDataSource {
  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const memoryId = uuid(input.memoryId, "memoryId");
    const row = await withPostgresTransaction(async (client) => {
      const userId = await ensureUser(client, input.userId);
      const result = await client.query<ConversationRow>(
        `WITH written AS (
           INSERT INTO conversations (user_id, memory_id, title, summary)
           VALUES ($1, $2, $3, $4) RETURNING *
         ) SELECT written.id, written.memory_id, u.external_id, written.title,
           written.summary, written.last_message_at, written.created_at, written.updated_at
         FROM written JOIN users u ON u.id = written.user_id`,
        [userId, memoryId, input.title ?? null, input.summary ?? null]
      );
      return result.rows[0];
    });
    return toConversation(row);
  }

  async findConversation(id: string): Promise<Conversation | null> {
    const result = await queryPostgres<ConversationRow>(
      `SELECT ${conversationColumns} FROM conversations c JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 LIMIT 1`, [uuid(id, "conversationId")]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    const result = await queryPostgres<ConversationRow>(
      `SELECT ${conversationColumns} FROM conversations c JOIN users u ON u.id = c.user_id
       WHERE u.external_id = $1 ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      [required(userId, "userId")]
    );
    return result.rows.map(toConversation);
  }

  async findConversationByMemory(userId: string, memoryId: string): Promise<Conversation | null> {
    const result = await queryPostgres<ConversationRow>(
      `SELECT ${conversationColumns} FROM conversations c JOIN users u ON u.id = c.user_id
       WHERE u.external_id = $1 AND c.memory_id = $2 AND c.is_default
       LIMIT 1`,
      [required(userId, "userId"), uuid(memoryId, "memoryId")]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
  }

  async getOrCreateDefaultConversation(
    externalUserId: string,
    inputMemoryId: string
  ): Promise<Conversation> {
    const memoryId = uuid(inputMemoryId, "memoryId");
    return withPostgresTransaction(async (client) => {
      const userId = await ensureUser(client, externalUserId);
      return getOrCreateDefaultConversation(client, userId, memoryId);
    });
  }

  async createMessage(input: CreateMessageInput): Promise<Message> {
    const conversationId = uuid(input.sessionId, "sessionId");
    const memoryId = uuid(input.memoryId, "memoryId");
    const content = required(input.content, "content");
    const row = await withPostgresTransaction(async (client) => {
      const userId = await ensureUser(client, input.userId);
      const result = await client.query<MessageRow>(
        `WITH written AS (
           INSERT INTO messages (conversation_id, user_id, memory_id, role, content, tokens, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *
         ) SELECT written.id, written.conversation_id, written.memory_id, u.external_id,
           written.role, written.content, written.tokens, written.metadata, written.created_at
         FROM written JOIN users u ON u.id = written.user_id`,
        [conversationId, userId, memoryId, input.role, content, input.tokens ?? null,
          JSON.stringify(input.metadata ?? {})]
      );
      await client.query("UPDATE conversations SET last_message_at = NOW() WHERE id = $1", [conversationId]);
      return result.rows[0];
    });
    return toMessage(row);
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const result = await queryPostgres<MessageRow>(
      `SELECT ${messageColumns} FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = $1 ORDER BY m.created_at ASC`,
      [uuid(conversationId, "conversationId")]
    );
    return result.rows.map(toMessage);
  }

  async claimFirstGreeting(input: ClaimFirstGreetingInput): Promise<FirstGreetingClaim> {
    const memoryId = uuid(input.memoryId, "memoryId");
    const externalUserId = required(input.userId, "userId");
    const requestKey = idempotencyKey(input.idempotencyKey);

    return withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      if (!userId) {
        throw new ChatNotFoundError("Owned memory was not found");
      }
      await lockFirstGreetingScope(client, externalUserId, memoryId);

      const existing = await client.query<FirstGreetingStateRow>(
        `SELECT conversation_id, status, assistant_message_id
         FROM memory_first_greetings
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [userId, memoryId, requestKey]
      );

      if (existing.rows[0]) {
        const state = existing.rows[0];
        const conversation = await getOrCreateDefaultConversation(
          client,
          userId,
          memoryId
        );
        if (conversation.id !== state.conversation_id) {
          throw new ChatValidationError("First greeting conversation is inconsistent");
        }
        if (state.status === "completed") {
          if (!state.assistant_message_id) {
            throw new ChatValidationError("First greeting completion is inconsistent");
          }
          const message = await getGreetingMessage(
            client,
            state.assistant_message_id,
            userId,
            memoryId,
            conversation.id
          );
          if (!message) {
            throw new ChatValidationError("First greeting message is inconsistent");
          }
          return { status: "replayed", conversation, message };
        }
        if (state.status === "pending") {
          return { status: "in_progress", conversation };
        }

        await client.query(
          `UPDATE memory_first_greetings
           SET status = 'pending', assistant_message_id = NULL, updated_at = NOW()
           WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3`,
          [userId, memoryId, requestKey]
        );
        return { status: "claimed", conversation };
      }

      const conversation = await getOrCreateDefaultConversation(client, userId, memoryId);
      await client.query(
        `INSERT INTO memory_first_greetings (
           user_id, memory_id, conversation_id, idempotency_key, status
         ) VALUES ($1, $2, $3, $4, 'pending')`,
        [userId, memoryId, conversation.id, requestKey]
      );
      return { status: "claimed", conversation };
    });
  }

  async completeFirstGreeting(input: CompleteFirstGreetingInput): Promise<Message> {
    const memoryId = uuid(input.memoryId, "memoryId");
    const conversationId = uuid(input.conversationId, "conversationId");
    const externalUserId = required(input.userId, "userId");
    const requestKey = idempotencyKey(input.idempotencyKey);
    const content = required(input.content, "content");

    return withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      if (!userId) {
        throw new ChatNotFoundError("Owned memory was not found");
      }
      await lockFirstGreetingScope(client, externalUserId, memoryId);
      const stateResult = await client.query<FirstGreetingStateRow>(
        `SELECT conversation_id, status, assistant_message_id
         FROM memory_first_greetings
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [userId, memoryId, requestKey]
      );
      const state = stateResult.rows[0];
      if (!state || state.conversation_id !== conversationId) {
        throw new ChatValidationError("First greeting claim was not found");
      }
      if (state.status === "completed") {
        if (!state.assistant_message_id) {
          throw new ChatValidationError("First greeting completion is inconsistent");
        }
        const replay = await getGreetingMessage(
          client,
          state.assistant_message_id,
          userId,
          memoryId,
          conversationId
        );
        if (!replay) {
          throw new ChatValidationError("First greeting message is inconsistent");
        }
        return replay;
      }
      if (state.status !== "pending") {
        throw new ChatValidationError("First greeting is not pending");
      }

      const inserted = await client.query<MessageRow>(
        `WITH written AS (
           INSERT INTO messages (
             conversation_id, user_id, memory_id, role, content, metadata
           ) VALUES ($1, $2, $3, 'assistant', $4, $5::jsonb)
           RETURNING *
         )
         SELECT written.id, written.conversation_id, written.memory_id, u.external_id,
           written.role, written.content, written.tokens, written.metadata, written.created_at
         FROM written
         JOIN users u ON u.id = written.user_id`,
        [
          conversationId,
          userId,
          memoryId,
          content,
          JSON.stringify({ kind: "first_greeting", idempotencyKey: requestKey }),
        ]
      );
      const message = toMessage(inserted.rows[0]);
      await client.query(
        `UPDATE memory_first_greetings
         SET status = 'completed', assistant_message_id = $4, updated_at = NOW()
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3`,
        [userId, memoryId, requestKey, message.id]
      );
      await client.query(
        "UPDATE conversations SET last_message_at = NOW() WHERE id = $1 AND user_id = $2 AND memory_id = $3",
        [conversationId, userId, memoryId]
      );
      return message;
    });
  }

  async failFirstGreeting(input: ClaimFirstGreetingInput): Promise<void> {
    const memoryId = uuid(input.memoryId, "memoryId");
    const externalUserId = required(input.userId, "userId");
    const requestKey = idempotencyKey(input.idempotencyKey);

    await withPostgresTransaction(async (client) => {
      const userId = await lockOwnedMemory(client, externalUserId, memoryId);
      if (!userId) return;
      await lockFirstGreetingScope(client, externalUserId, memoryId);
      await client.query(
        `UPDATE memory_first_greetings
         SET status = 'failed', updated_at = NOW()
         WHERE user_id = $1 AND memory_id = $2 AND idempotency_key = $3
           AND status = 'pending'`,
        [userId, memoryId, requestKey]
      );
    });
  }
}
