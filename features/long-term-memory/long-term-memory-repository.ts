import type { LongTermMemoryDataSource } from "./datasource";
import type {
  CreateLongTermMemoryInput,
  DeleteLongTermMemoryInput,
  ListLongTermMemoriesInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

export class LongTermMemoryRepository {
  constructor(private readonly dataSource: LongTermMemoryDataSource) {}

  create(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.dataSource.create(input);
  }

  recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.dataSource.recall(input);
  }

  list(input: ListLongTermMemoriesInput): Promise<LongTermMemory[]> {
    return this.dataSource.list(input);
  }

  update(input: UpdateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.dataSource.update(input);
  }

  delete(input: DeleteLongTermMemoryInput): Promise<void> {
    return this.dataSource.delete(input);
  }
}
