import type { PermissionDataSource } from "./datasource";

export class PermissionRepository {
  constructor(private readonly dataSource: PermissionDataSource) {}

  canAccessMemory(userId: string, memoryId: string): Promise<boolean> {
    return this.dataSource.canAccessMemory(userId, memoryId);
  }

  canAccessChatSession(
    userId: string,
    sessionId: string
  ): Promise<boolean> {
    return this.dataSource.canAccessChatSession(userId, sessionId);
  }

  canAccessMedia(userId: string, mediaId: string): Promise<boolean> {
    return this.dataSource.canAccessMedia(userId, mediaId);
  }
}
