import type { ConsentRecord, CreateConsentInput, UpdateConsentInput } from "./types";

export interface ConsentDataSource {
  create(input: CreateConsentInput): Promise<ConsentRecord>;
  findById(id: string): Promise<ConsentRecord | null>;
  update(id: string, input: UpdateConsentInput): Promise<ConsentRecord>;
  listByMemory(memoryId: string): Promise<ConsentRecord[]>;
  listByUser(userId: string): Promise<ConsentRecord[]>;
}
