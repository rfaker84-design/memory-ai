import { supabase } from "../../src/lib/supabase";
import type { MemoryDataSource } from "./datasource";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

type MemoryRow = {
  id: string;
  user_phone: string;
  name: string;
  relationship: string;
  created_at: string;
  life_story: string | null;
  personality_profile: string | null;
  speech_style: string | null;
  catch_phrases: string | null;
  birth_year: number | null;
  death_year: number | null;
  values_belief: string | null;
  personality_type: string | null;
};

const MEMORY_SELECT =
  "id,user_phone,name,relationship,created_at," +
  "life_story,personality_profile,speech_style,catch_phrases," +
  "birth_year,death_year,values_belief,personality_type";

const toMemory = (row: MemoryRow): Memory => ({
  id: row.id,
  userId: row.user_phone,
  name: row.name,
  relationship: row.relationship,
  createdAt: row.created_at,
  updatedAt: row.created_at,
  lifeStory: row.life_story ?? undefined,
  personalityProfile: row.personality_profile ?? undefined,
  speechStyle: row.speech_style ?? undefined,
  catchPhrases: row.catch_phrases ?? undefined,
  birthYear: row.birth_year ?? undefined,
  deathYear: row.death_year ?? undefined,
  valuesBelief: row.values_belief ?? undefined,
  personalityType: row.personality_type ?? undefined,
});

const toCreateRow = (memory: CreateMemoryInput) => ({
  user_phone: memory.userId,
  name: memory.name,
  relationship: memory.relationship,
});

const toUpdateRow = (memory: UpdateMemoryInput) => ({
  ...(memory.userId !== undefined ? { user_phone: memory.userId } : {}),
  ...(memory.name !== undefined ? { name: memory.name } : {}),
  ...(memory.relationship !== undefined
    ? { relationship: memory.relationship }
    : {}),
});

export class MemorySupabaseDataSource implements MemoryDataSource {
  async create(memory: CreateMemoryInput): Promise<Memory> {
    const { data, error } = await supabase
      .from("memories")
      .insert(toCreateRow(memory))
      .select(MEMORY_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return toMemory(data as unknown as MemoryRow);
  }

  async findById(id: string): Promise<Memory | null> {
    const { data, error } = await supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toMemory(data as unknown as MemoryRow) : null;
  }

  async update(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    const { data, error } = await supabase
      .from("memories")
      .update(toUpdateRow(memory))
      .eq("id", id)
      .select(MEMORY_SELECT)
      .single();

    if (error) {
      throw error;
    }

    return toMemory(data as unknown as MemoryRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("memories").delete().eq("id", id);

    if (error) {
      throw error;
    }
  }

  async listByUser(userId: string): Promise<Memory[]> {
    const { data, error } = await supabase
      .from("memories")
      .select(MEMORY_SELECT)
      .eq("user_phone", userId);

    if (error) {
      throw error;
    }

    return (data as unknown as MemoryRow[]).map(toMemory);
  }
}
