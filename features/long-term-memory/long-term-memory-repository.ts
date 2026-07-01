import type { LongTermMemoryDataSource } from "./datasource";
import type {
  CreateLongTermMemoryInput,
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

  findById(id: string): Promise<LongTermMemory | null> {
    return this.dataSource.findById(id);
  }

  update(
    id: string,
    input: UpdateLongTermMemoryInput
  ): Promise<LongTermMemory> {
    return this.dataSource.update(id, input);
  }

  delete(id: string): Promise<void> {
    return this.dataSource.delete(id);
  }

  listByMemory(memoryId: string): Promise<LongTermMemory[]> {
    return this.dataSource.listByMemory(memoryId);
  }

  recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.dataSource.recall(input);
  }
}
