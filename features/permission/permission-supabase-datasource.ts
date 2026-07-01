import { supabase } from "../../src/lib/supabase";
import type { PermissionDataSource } from "./datasource";

export class PermissionSupabaseDataSource
  implements PermissionDataSource
{
  async canAccessMemory(
    userId: string,
    memoryId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("memories")
        .select("id")
        .eq("id", memoryId)
        .eq("user_phone", userId)
        .maybeSingle();

      if (error) return false;

      return data !== null;
    } catch {
      return false;
    }
  }

  async canAccessChatSession(
    userId: string,
    sessionId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return false;

      return data !== null;
    } catch {
      return false;
    }
  }

  async canAccessMedia(
    userId: string,
    mediaId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id")
        .eq("id", mediaId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return false;

      return data !== null;
    } catch {
      return false;
    }
  }
}
