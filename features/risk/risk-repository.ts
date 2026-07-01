import type { RiskDataSource } from "./datasource";
import type { CreateRiskEventInput, RiskEvent } from "./types";

export class RiskRepository {
  constructor(private readonly dataSource: RiskDataSource) {}

  create(input: CreateRiskEventInput): Promise<RiskEvent> {
    return this.dataSource.create(input);
  }

  listByUser(userId: string, limit?: number): Promise<RiskEvent[]> {
    return this.dataSource.listByUser(userId, limit);
  }

  listByMemory(memoryId: string, limit?: number): Promise<RiskEvent[]> {
    return this.dataSource.listByMemory(memoryId, limit);
  }
}
