export type PermissionAction = "read" | "create" | "update" | "delete" | "manage";

export type PermissionResourceType =
  | "memory"
  | "chat_session"
  | "media"
  | "long_term_memory"
  | "audit_log";

export interface PermissionCheckInput {
  userId: string;
  resourceType: PermissionResourceType;
  resourceId: string;
  action: PermissionAction;
  memoryId?: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}
