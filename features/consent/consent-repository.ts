import type { ConsentDataSource } from "./datasource";
import type { ConsentRecord, CreateConsentInput, UpdateConsentInput } from "./types";

export class ConsentRepository {
  constructor(private readonly dataSource: ConsentDataSource) {}

  create(input: CreateConsentInput): Promise<ConsentRecord> {
    return this.dataSource.create(input);
  }

  findById(id: string): Promise<ConsentRecord | null> {
    return this.dataSource.findById(id);
  }

  update(id: string, input: UpdateConsentInput): Promise<ConsentRecord> {
    return this.dataSource.update(id, input);
  }

  listByMemory(memoryId: string): Promise<ConsentRecord[]> {
    return this.dataSource.listByMemory(memoryId);
  }

  listByUser(userId: string): Promise<ConsentRecord[]> {
    return this.dataSource.listByUser(userId);
  }
}
