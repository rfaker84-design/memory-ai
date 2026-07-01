import type { AuditDataSource } from "./datasource";
import type { AuditLog, CreateAuditLogInput } from "./types";

export class AuditRepository {
  constructor(private readonly dataSource: AuditDataSource) {}

  create(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.dataSource.create(input);
  }

  listByUser(userId: string, limit?: number): Promise<AuditLog[]> {
    return this.dataSource.listByUser(userId, limit);
  }

  listByMemory(memoryId: string, limit?: number): Promise<AuditLog[]> {
    return this.dataSource.listByMemory(memoryId, limit);
  }
}
