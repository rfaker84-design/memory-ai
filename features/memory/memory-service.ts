import type { MemoryRepository } from "./memory-repository";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

import type { UpdateOwnedMemoryInput } from "./types";

export class MemoryService {
  constructor(private readonly memoryRepository: MemoryRepository) {}

  createMemory(memory: CreateMemoryInput): Promise<Memory> {
    return this.memoryRepository.createMemory(memory);
  }

  getMemory(id: string): Promise<Memory | null> {
    return this.memoryRepository.getMemory(id);
  }

  getMemoryForUser(id: string, userId: string): Promise<Memory | null> {
    return this.memoryRepository.getMemoryForUser(id, userId);
  }

  recoverCreatedMemory(
    userId: string,
    idempotencyKey: string
  ): Promise<Memory | null> {
    return this.memoryRepository.getMemoryByCreationKeyForUser(
      userId,
      idempotencyKey
    );
  }

  updateMemory(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    return this.memoryRepository.updateMemory(id, memory);
  }

  updateMemoryForUser(
    id: string,
    userId: string,
    memory: UpdateOwnedMemoryInput
  ): Promise<Memory> {
    return this.memoryRepository.updateMemoryForUser(id, userId, memory);
  }

  deleteMemory(id: string): Promise<void> {
    return this.memoryRepository.deleteMemory(id);
  }

  deleteMemoryForUser(id: string, userId: string): Promise<void> {
    return this.memoryRepository.deleteMemoryForUser(id, userId);
  }

  listUserMemories(userId: string): Promise<Memory[]> {
    return this.memoryRepository.listUserMemories(userId);
  }
}
