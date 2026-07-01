import type { LongTermMemoryRepository } from "./long-term-memory-repository";
import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
  UpdateLongTermMemoryInput,
} from "./types";

export class LongTermMemoryService {
  constructor(
    private readonly repository: LongTermMemoryRepository
  ) {}

  createMemory(
    input: CreateLongTermMemoryInput
  ): Promise<LongTermMemory> {
    return this.repository.create(input);
  }

  getMemory(id: string): Promise<LongTermMemory | null> {
    return this.repository.findById(id);
  }

  updateMemory(
    id: string,
    input: UpdateLongTermMemoryInput
  ): Promise<LongTermMemory> {
    return this.repository.update(id, input);
  }

  deleteMemory(id: string): Promise<void> {
    return this.repository.delete(id);
  }

  listMemory(memoryId: string): Promise<LongTermMemory[]> {
    return this.repository.listByMemory(memoryId);
  }

  recallMemory(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.repository.recall(input);
  }
}
