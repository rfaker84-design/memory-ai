import type { CreateRiskEventInput, RiskEvent } from "./types";

export interface RiskDataSource {
  create(input: CreateRiskEventInput): Promise<RiskEvent>;
  listByUser(userId: string, limit?: number): Promise<RiskEvent[]>;
  listByMemory(memoryId: string, limit?: number): Promise<RiskEvent[]>;
}
