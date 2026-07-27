import type { LongTermMemoryRepository } from "./long-term-memory-repository";
import type {
  CreateLongTermMemoryInput,
  DeleteLongTermMemoryInput,
  ListLongTermMemoriesInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

export class LongTermMemoryService {
  constructor(private readonly repository: LongTermMemoryRepository) {}

  createMemory(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.repository.create(input);
  }

  recallMemory(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.repository.recall(input);
  }

  listMemories(input: ListLongTermMemoriesInput): Promise<LongTermMemory[]> {
    return this.repository.list(input);
  }

  updateMemory(input: UpdateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.repository.update(input);
  }

  deleteMemory(input: DeleteLongTermMemoryInput): Promise<void> {
    return this.repository.delete(input);
  }
}
