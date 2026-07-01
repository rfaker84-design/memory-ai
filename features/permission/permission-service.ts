import type { PermissionRepository } from "./permission-repository";
import type {
  PermissionCheckInput,
  PermissionCheckResult,
} from "./types";

export class PermissionService {
  constructor(
    private readonly repository: PermissionRepository
  ) {}

  async check(input: PermissionCheckInput): Promise<PermissionCheckResult> {
    let allowed = false;

    if (input.resourceType === "memory") {
      allowed = await this.repository.canAccessMemory(
        input.userId,
        input.resourceId
      );
    } else if (input.resourceType === "chat_session") {
      allowed = await this.repository.canAccessChatSession(
        input.userId,
        input.resourceId
      );
    } else if (input.resourceType === "media") {
      allowed = await this.repository.canAccessMedia(
        input.userId,
        input.resourceId
      );
    }

    return allowed
      ? { allowed: true }
      : {
          allowed: false,
          reason:
            "用户无权访问该 " + input.resourceType + " 资源。",
        };
  }
}
