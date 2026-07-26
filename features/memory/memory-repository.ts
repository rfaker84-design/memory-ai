import type { MemoryDataSource } from "./datasource";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

import type { UpdateOwnedMemoryInput } from "./types";

export class MemoryRepository {
  constructor(private readonly dataSource: MemoryDataSource) {}

  createMemory(memory: CreateMemoryInput): Promise<Memory> {
    return this.dataSource.create(memory);
  }

  getMemory(id: string): Promise<Memory | null> {
    return this.dataSource.findById(id);
  }

  getMemoryForUser(id: string, userId: string): Promise<Memory | null> {
    if (!this.dataSource.findByIdForUser) {
      throw new Error("Owned memory reads require the formal PostgreSQL datasource");
    }
    return this.dataSource.findByIdForUser(id, userId);
  }

  getMemoryByCreationKeyForUser(
    userId: string,
    idempotencyKey: string
  ): Promise<Memory | null> {
    if (!this.dataSource.findByCreationIdempotencyKeyForUser) {
      throw new Error(
        "Memory creation recovery requires the formal PostgreSQL datasource"
      );
    }
    return this.dataSource.findByCreationIdempotencyKeyForUser(
      userId,
      idempotencyKey
    );
  }

  updateMemory(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    return this.dataSource.update(id, memory);
  }

  updateMemoryForUser(
    id: string,
    userId: string,
    memory: UpdateOwnedMemoryInput
  ): Promise<Memory> {
    if (!this.dataSource.updateForUser) {
      throw new Error("Owned memory updates require the formal PostgreSQL datasource");
    }
    return this.dataSource.updateForUser(id, userId, memory);
  }

  deleteMemory(id: string): Promise<void> {
    return this.dataSource.delete(id);
  }

  deleteMemoryForUser(id: string, userId: string): Promise<void> {
    if (!this.dataSource.deleteForUser) {
      throw new Error("Owned memory deletes require the formal PostgreSQL datasource");
    }
    return this.dataSource.deleteForUser(id, userId);
  }

  listUserMemories(userId: string): Promise<Memory[]> {
    return this.dataSource.listByUser(userId);
  }
}
