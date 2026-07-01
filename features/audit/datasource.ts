import type { AuditLog, CreateAuditLogInput } from "./types";

export interface AuditDataSource {
  create(input: CreateAuditLogInput): Promise<AuditLog>;
  listByUser(userId: string, limit?: number): Promise<AuditLog[]>;
  listByMemory(memoryId: string, limit?: number): Promise<AuditLog[]>;
}
