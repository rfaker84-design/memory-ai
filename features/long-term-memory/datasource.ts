import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

export interface LongTermMemoryDataSource {
  create(input: CreateLongTermMemoryInput): Promise<LongTermMemory>;
  findById(id: string): Promise<LongTermMemory | null>;
  update(
    id: string,
    input: UpdateLongTermMemoryInput
  ): Promise<LongTermMemory>;
  delete(id: string): Promise<void>;
  listByMemory(memoryId: string): Promise<LongTermMemory[]>;
  recall(input: RecallMemoryInput): Promise<RecallMemoryResult>;
}
