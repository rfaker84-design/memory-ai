import type { AuditRepository } from "./audit-repository";
import type { AuditLog, CreateAuditLogInput } from "./types";

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  log(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.repository.create(input);
  }

  listUserLogs(userId: string, limit?: number): Promise<AuditLog[]> {
    return this.repository.listByUser(userId, limit);
  }

  listMemoryLogs(memoryId: string, limit?: number): Promise<AuditLog[]> {
    return this.repository.listByMemory(memoryId, limit);
  }
}
