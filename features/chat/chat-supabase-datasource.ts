import { supabase } from "../../src/lib/supabase";
import type { ChatDataSource } from "./datasource";
import type {
  Conversation,
  CreateConversationInput,
  CreateMessageInput,
  Message,
} from "./types";

// ---- Row shapes (matching actual DB columns) ----

type SessionRow = {
  id: string;
  memory_id: string;
  user_id: string;
  title: string | null;
  summary: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string | null;
  memory_id: string;
  user_phone: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokens: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ---- Mappers ----

const toConversation = (row: SessionRow): Conversation => ({
  id: row.id,
  memoryId: row.memory_id,
  userId: row.user_id,
  title: row.title,
  summary: row.summary,
  lastMessageAt: row.last_message_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  sessionId: row.session_id,
  memoryId: row.memory_id,
  userId: row.user_phone,
  role: row.role,
  content: row.content,
  tokens: row.tokens,
  metadata: row.metadata,
  createdAt: row.created_at,
});

// ---- DataSource ----

export class ChatSupabaseDataSource implements ChatDataSource {
  async createConversation(
    input: CreateConversationInput
  ): Promise<Conversation> {
    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        memory_id: input.memoryId,
        user_id: input.userId,
        title: input.title ?? null,
        summary: input.summary ?? null,
      })
      .select(
        "id,memory_id,user_id,title,summary,last_message_at,created_at,updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return toConversation(data as SessionRow);
  }

  async findConversation(id: string): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select(
        "id,memory_id,user_id,title,summary,last_message_at,created_at,updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toConversation(data as SessionRow) : null;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select(
        "id,memory_id,user_id,title,summary,last_message_at,created_at,updated_at"
      )
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as SessionRow[]).map(toConversation);
  }

  async findConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation | null> {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select(
        "id,memory_id,user_id,title,summary,last_message_at,created_at,updated_at"
      )
      .eq("user_id", userId)
      .eq("memory_id", memoryId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toConversation(data as SessionRow) : null;
  }

  async getOrCreateConversationByMemory(
    userId: string,
    memoryId: string
  ): Promise<Conversation> {
    const existing = await this.findConversationByMemory(userId, memoryId);

    if (existing) {
      return existing;
    }

    return this.createConversation({
      userId,
      memoryId,
      title: "默认会话",
    });
  }

  async getOrCreateDefaultConversation(
    userId: string,
    memoryId: string
  ): Promise<Conversation> {
    return this.getOrCreateConversationByMemory(userId, memoryId);
  }

  async createMessage(input: CreateMessageInput): Promise<Message> {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        session_id: input.sessionId,
        memory_id: input.memoryId,
        user_phone: input.userId,
        role: input.role,
        content: input.content,
        tokens: input.tokens ?? null,
        metadata: input.metadata ?? null,
      })
      .select(
        "id,session_id,memory_id,user_phone,role,content,tokens,metadata,created_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return toMessage(data as MessageRow);
  }

  async listMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from("chat_messages")
      .select(
        "id,session_id,memory_id,user_phone,role,content,tokens,metadata,created_at"
      )
      .eq("session_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data as MessageRow[]).map(toMessage);
  }
}
