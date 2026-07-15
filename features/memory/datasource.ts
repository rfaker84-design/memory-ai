import type { CreateMemoryInput, Memory, UpdateMemoryInput } from "./types";

import type { UpdateOwnedMemoryInput } from "./types";

export interface MemoryDataSource {
  create(memory: CreateMemoryInput): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  findByIdForUser?(id: string, userId: string): Promise<Memory | null>;
  update(id: string, memory: UpdateMemoryInput): Promise<Memory>;
  updateForUser?(
    id: string,
    userId: string,
    memory: UpdateOwnedMemoryInput
  ): Promise<Memory>;
  delete(id: string): Promise<void>;
  deleteForUser?(id: string, userId: string): Promise<void>;
  listByUser(userId: string): Promise<Memory[]>;
}
