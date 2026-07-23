import { createHash } from "node:crypto";

import { supabase } from "../../src/lib/supabase";
import type { LongTermMemoryDataSource } from "./datasource";
import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
} from "./types";

// Legacy adapter retained only for historical code compatibility. Formal chat
// and context paths instantiate LongTermMemoryPostgresDataSource exclusively.
type LongTermMemoryRow = {
  id: string;
  memory_id: string;
  content: string;
  content_hash: string;
  source_type: string;
  source_id: string | null;
  importance: number;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id,memory_id,content,content_hash,source_type,source_id,importance,tags,metadata,created_at,updated_at";

function toEntity(row: LongTermMemoryRow): LongTermMemory {
  return {
    id: row.id,
    memoryId: row.memory_id,
    content: row.content,
    contentHash: row.content_hash,
    sourceType: row.source_type,
    sourceId: row.source_id,
    importance: row.importance,
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LongTermMemorySupabaseDataSource
  implements LongTermMemoryDataSource
{
  async create(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    const content = input.content.trim();
    const { data, error } = await supabase
      .from("long_term_memories")
      .insert({
        user_id: input.externalUserId,
        memory_id: input.memoryId,
        content,
        content_hash: createHash("sha256").update(content).digest("hex"),
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        importance: input.importance,
        tags: input.tags ?? [],
        metadata: input.metadata ?? {},
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw error;
    return toEntity(data as LongTermMemoryRow);
  }

  async recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    const { data, error } = await supabase
      .from("long_term_memories")
      .select(SELECT_COLUMNS)
      .eq("memory_id", input.memoryId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input.topK ?? 10);
    if (error) throw error;
    return {
      memories: (data as LongTermMemoryRow[]).map(toEntity),
      query: input.query,
    };
  }
}
