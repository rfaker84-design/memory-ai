import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

export interface MemoryDataSource {
  create(memory: CreateMemoryInput): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  update(id: string, memory: UpdateMemoryInput): Promise<Memory>;
  delete(id: string): Promise<void>;
  listByUser(userId: string): Promise<Memory[]>;
}
