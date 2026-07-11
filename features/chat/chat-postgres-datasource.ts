import type { PoolClient } from "pg";

import { queryPostgres, withPostgresTransaction } from "../../src/server/database";
import type { ChatDataSource } from "./datasource";
import { ChatValidationError } from "./errors";
import type { Conversation, CreateConversationInput, CreateMessageInput, Message } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
       WHERE u.external_id = $1 AND c.memory_id = $2
       ORDER BY c.created_at DESC LIMIT 1`,
      [required(userId, "userId"), uuid(memoryId, "memoryId")]
    );
    return result.rows[0] ? toConversation(result.rows[0]) : null;
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
}
