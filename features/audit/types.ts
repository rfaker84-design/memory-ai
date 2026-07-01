export type AuditAction =
  | "memory.created"
  | "memory.updated"
  | "chat.message.created"
  | "ai.reply.generated"
  | "media.uploaded"
  | "payment.success"
  | "permission.changed"
  | "risk.detected"
  | "system.error";

export type AuditLevel = "info" | "warning" | "error" | "critical";

export interface AuditLog {
  id: string;
  userId: string;
  memoryId: string | null;
  action: AuditAction;
  level: AuditLevel;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type CreateAuditLogInput = Omit<AuditLog, "id" | "createdAt">;
