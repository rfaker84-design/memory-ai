import { supabase } from "../../src/lib/supabase";
import type { LongTermMemoryDataSource } from "./datasource";
import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

// ---- Row shape ----

type LongTermMemoryRow = {
  id: string;
  user_id: string;
  memory_id: string;
  content: string;
  source_type: string;
  source_id: string | null;
  importance: number;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const LTM_SELECT =
  "id,user_id,memory_id,content,source_type,source_id,importance,tags,created_at,updated_at";

// ---- Mapper ----

const toEntity = (row: LongTermMemoryRow): LongTermMemory => ({
  id: row.id,
  userId: row.user_id,
  memoryId: row.memory_id,
  content: row.content,
  sourceType: row.source_type,
  sourceId: row.source_id,
  importance: row.importance,
  tags: row.tags ?? [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ---- DataSource ----

export class LongTermMemorySupabaseDataSource
  implements LongTermMemoryDataSource
{
  async create(
    input: CreateLongTermMemoryInput
  ): Promise<LongTermMemory> {
    const { data, error } = await supabase
      .from("long_term_memories")
      .insert({
        user_id: input.userId,
        memory_id: input.memoryId,
        content: input.content,
        source_type: input.sourceType,
        source_id: input.sourceId,
        importance: input.importance,
        tags: input.tags,
      })
      .select(LTM_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as LongTermMemoryRow);
  }

  async findById(id: string): Promise<LongTermMemory | null> {
    const { data, error } = await supabase
      .from("long_term_memories")
      .select(LTM_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    return data ? toEntity(data as unknown as LongTermMemoryRow) : null;
  }

  async update(
    id: string,
    input: UpdateLongTermMemoryInput
  ): Promise<LongTermMemory> {
    const row: Record<string, unknown> = {};
    if (input.content !== undefined) row.content = input.content;
    if (input.importance !== undefined) row.importance = input.importance;
    if (input.tags !== undefined) row.tags = input.tags;

    const { data, error } = await supabase
      .from("long_term_memories")
      .update(row)
      .eq("id", id)
      .select(LTM_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as LongTermMemoryRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from("long_term_memories")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async listByMemory(memoryId: string): Promise<LongTermMemory[]> {
    const { data, error } = await supabase
      .from("long_term_memories")
      .select(LTM_SELECT)
      .eq("memory_id", memoryId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data as unknown as LongTermMemoryRow[]).map(toEntity);
  }

  async recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    const topK = input.topK ?? 10;

    const { data, error } = await supabase
      .from("long_term_memories")
      .select(LTM_SELECT)
      .eq("memory_id", input.memoryId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(topK);

    if (error) throw error;

    const memories = (data as unknown as LongTermMemoryRow[]).map(toEntity);

    return { memories, query: input.query };
  }
}
