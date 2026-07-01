import { supabase } from "../../src/lib/supabase";
import type { AuditDataSource } from "./datasource";
import type { AuditLog, CreateAuditLogInput } from "./types";

type AuditRow = {
  id: string;
  user_id: string;
  memory_id: string | null;
  action: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const AUDIT_SELECT =
  "id,user_id,memory_id,action,level,message,metadata,created_at";

const toEntity = (row: AuditRow): AuditLog => ({
  id: row.id,
  userId: row.user_id,
  memoryId: row.memory_id,
  action: row.action as AuditLog["action"],
  level: row.level as AuditLog["level"],
  message: row.message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

export class AuditSupabaseDataSource implements AuditDataSource {
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert({
        user_id: input.userId,
        memory_id: input.memoryId,
        action: input.action,
        level: input.level,
        message: input.message,
        metadata: input.metadata,
      })
      .select(AUDIT_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as AuditRow);
  }

  async listByUser(
    userId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select(AUDIT_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as unknown as AuditRow[]).map(toEntity);
  }

  async listByMemory(
    memoryId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select(AUDIT_SELECT)
      .eq("memory_id", memoryId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as unknown as AuditRow[]).map(toEntity);
  }
}
