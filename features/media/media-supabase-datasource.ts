import { supabase } from "../../src/lib/supabase";
import type { MediaDataSource } from "./datasource";
import type { CreateMediaInput, MediaAsset, MediaType, UpdateMediaInput } from "./types";

// ---- Row shape ----

type MediaRow = {
  id: string;
  user_id: string;
  memory_id: string;
  media_type: string;
  url: string;
  thumbnail_url: string | null;
  mime_type: string;
  size: number;
  status: string;
  created_at: string;
  updated_at: string;
};

// ---- Mappers ----

const toAsset = (row: MediaRow): MediaAsset => ({
  id: row.id,
  userId: row.user_id,
  memoryId: row.memory_id,
  mediaType: row.media_type as MediaType,
  url: row.url,
  thumbnailUrl: row.thumbnail_url,
  mimeType: row.mime_type,
  size: row.size,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// ---- DataSource ----

export class MediaSupabaseDataSource implements MediaDataSource {
  async create(input: CreateMediaInput): Promise<MediaAsset> {
    const { data, error } = await supabase
      .from("media_assets")
      .insert({
        user_id: input.userId,
        memory_id: input.memoryId,
        media_type: input.mediaType,
        url: input.url,
        thumbnail_url: input.thumbnailUrl,
        mime_type: input.mimeType,
        size: input.size,
        status: input.status,
      })
      .select(
        "id,user_id,memory_id,media_type,url,thumbnail_url,mime_type,size,status,created_at,updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return toAsset(data as MediaRow);
  }

  async findById(id: string): Promise<MediaAsset | null> {
    const { data, error } = await supabase
      .from("media_assets")
      .select(
        "id,user_id,memory_id,media_type,url,thumbnail_url,mime_type,size,status,created_at,updated_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? toAsset(data as MediaRow) : null;
  }

  async update(id: string, input: UpdateMediaInput): Promise<MediaAsset> {
    const row: Record<string, unknown> = {};
    if (input.status !== undefined) row.status = input.status;
    if (input.thumbnailUrl !== undefined) row.thumbnail_url = input.thumbnailUrl;
    if (input.url !== undefined) row.url = input.url;

    const { data, error } = await supabase
      .from("media_assets")
      .update(row)
      .eq("id", id)
      .select(
        "id,user_id,memory_id,media_type,url,thumbnail_url,mime_type,size,status,created_at,updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return toAsset(data as MediaRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("media_assets").delete().eq("id", id);

    if (error) {
      throw error;
    }
  }

  async listByMemory(memoryId: string): Promise<MediaAsset[]> {
    const { data, error } = await supabase
      .from("media_assets")
      .select(
        "id,user_id,memory_id,media_type,url,thumbnail_url,mime_type,size,status,created_at,updated_at"
      )
      .eq("memory_id", memoryId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as MediaRow[]).map(toAsset);
  }

  async listByUser(userId: string): Promise<MediaAsset[]> {
    const { data, error } = await supabase
      .from("media_assets")
      .select(
        "id,user_id,memory_id,media_type,url,thumbnail_url,mime_type,size,status,created_at,updated_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as MediaRow[]).map(toAsset);
  }
}
