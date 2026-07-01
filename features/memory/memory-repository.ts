import type { MemoryDataSource } from "./datasource";
import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

export class MemoryRepository {
  constructor(private readonly dataSource: MemoryDataSource) {}

  createMemory(memory: CreateMemoryInput): Promise<Memory> {
    return this.dataSource.create(memory);
  }

  getMemory(id: string): Promise<Memory | null> {
    return this.dataSource.findById(id);
  }

  updateMemory(id: string, memory: UpdateMemoryInput): Promise<Memory> {
    return this.dataSource.update(id, memory);
  }

  deleteMemory(id: string): Promise<void> {
    return this.dataSource.delete(id);
  }

  listUserMemories(userId: string): Promise<Memory[]> {
    return this.dataSource.listByUser(userId);
  }
}
