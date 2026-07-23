import type { LongTermMemoryDataSource } from "./datasource";
import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
} from "./types";

export class LongTermMemoryRepository {
  constructor(private readonly dataSource: LongTermMemoryDataSource) {}

  create(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.dataSource.create(input);
  }

  recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.dataSource.recall(input);
  }
}
