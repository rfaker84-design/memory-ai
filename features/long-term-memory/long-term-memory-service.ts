import type { LongTermMemoryRepository } from "./long-term-memory-repository";
import type {
  CreateLongTermMemoryInput,
  LongTermMemory,
  RecallMemoryInput,
  RecallMemoryResult,
} from "./types";

export class LongTermMemoryService {
  constructor(private readonly repository: LongTermMemoryRepository) {}

  createMemory(input: CreateLongTermMemoryInput): Promise<LongTermMemory> {
    return this.repository.create(input);
  }

  recallMemory(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    return this.repository.recall(input);
  }
}
