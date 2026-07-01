import { supabase } from "../../src/lib/supabase";
import type { RiskDataSource } from "./datasource";
import type { CreateRiskEventInput, RiskEvent } from "./types";

type RiskRow = {
  id: string;
  user_id: string;
  memory_id: string | null;
  risk_type: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const RISK_SELECT =
  "id,user_id,memory_id,risk_type,level,message,metadata,created_at";

const toEntity = (row: RiskRow): RiskEvent => ({
  id: row.id,
  userId: row.user_id,
  memoryId: row.memory_id,
  riskType: row.risk_type as RiskEvent["riskType"],
  level: row.level as RiskEvent["level"],
  message: row.message,
  metadata: row.metadata ?? {},
  createdAt: row.created_at,
});

export class RiskSupabaseDataSource implements RiskDataSource {
  async create(input: CreateRiskEventInput): Promise<RiskEvent> {
    const { data, error } = await supabase
      .from("risk_events")
      .insert({
        user_id: input.userId,
        memory_id: input.memoryId,
        risk_type: input.riskType,
        level: input.level,
        message: input.message,
        metadata: input.metadata,
      })
      .select(RISK_SELECT)
      .single();

    if (error) throw error;

    return toEntity(data as unknown as RiskRow);
  }

  async listByUser(
    userId: string,
    limit = 50
  ): Promise<RiskEvent[]> {
    const { data, error } = await supabase
      .from("risk_events")
      .select(RISK_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as unknown as RiskRow[]).map(toEntity);
  }

  async listByMemory(
    memoryId: string,
    limit = 50
  ): Promise<RiskEvent[]> {
    const { data, error } = await supabase
      .from("risk_events")
      .select(RISK_SELECT)
      .eq("memory_id", memoryId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data as unknown as RiskRow[]).map(toEntity);
  }
}
