export interface PermissionDataSource {
  canAccessMemory(userId: string, memoryId: string): Promise<boolean>;
  canAccessChatSession(
    userId: string,
    sessionId: string
  ): Promise<boolean>;
  canAccessMedia(userId: string, mediaId: string): Promise<boolean>;
}
