import type {
  CreateLongTermMemoryInput,
  DeleteLongTermMemoryInput,
  ListLongTermMemoriesInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

export interface LongTermMemoryDataSource {
  create(input: CreateLongTermMemoryInput): Promise<LongTermMemory>;
  recall(input: RecallMemoryInput): Promise<RecallMemoryResult>;
  list(input: ListLongTermMemoriesInput): Promise<LongTermMemory[]>;
  update(input: UpdateLongTermMemoryInput): Promise<LongTermMemory>;
  delete(input: DeleteLongTermMemoryInput): Promise<void>;
}
