export interface LongTermMemory {
  id: string;
  userId: string;
  memoryId: string;
  content: string;
  sourceType: string;
  sourceId: string | null;
  importance: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateLongTermMemoryInput = Omit<
  LongTermMemory,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdateLongTermMemoryInput = Partial<
  Pick<LongTermMemory, "content" | "importance" | "tags">
>;

export interface RecallMemoryInput {
  userId: string;
  memoryId: string;
  query: string;
  topK?: number;
}

export interface RecallMemoryResult {
  memories: LongTermMemory[];
  query: string;
}
