import type { MemoryRepository } from "./memory-repository";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

export class MemoryService {
  constructor(private readonly memoryRepository: MemoryRepository) {}

  createMemory(memory: CreateMemoryInput): Promise<Memory> {
    return this.memoryRepository.createMemory(memory);
  }

  getMemory(id: string): Promise<Memory | null> {
    return this.memoryRepository.getMemory(id);
  }

  updateMemory(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    return this.memoryRepository.updateMemory(id, memory);
  }

  deleteMemory(id: string): Promise<void> {
    return this.memoryRepository.deleteMemory(id);
  }

  listUserMemories(userId: string): Promise<Memory[]> {
    return this.memoryRepository.listUserMemories(userId);
  }
}
