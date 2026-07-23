import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
} from "./types";

export interface LongTermMemoryDataSource {
  create(input: CreateLongTermMemoryInput): Promise<LongTermMemory>;
  recall(input: RecallMemoryInput): Promise<RecallMemoryResult>;
}
