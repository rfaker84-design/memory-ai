export interface LongTermMemory {
  id: string;
  memoryId: string;
  content: string;
  contentHash: string;
  sourceType: string;
  sourceId: string | null;
  importance: number;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLongTermMemoryInput {
  externalUserId: string;
  memoryId: string;
  content: string;
  sourceType: string;
  sourceId?: string | null;
  importance: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface RecallMemoryInput {
  externalUserId: string;
  memoryId: string;
  query: string;
  topK?: number;
}

export interface RecallMemoryResult {
  memories: LongTermMemory[];
  query: string;
}
