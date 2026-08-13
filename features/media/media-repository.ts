import type { MediaDataSource } from "./datasource";
import type { ReserveMediaInput } from "./types";
export class MediaRepository {
  constructor(private readonly dataSource: MediaDataSource) {}
  reserve(input: ReserveMediaInput) { return this.dataSource.reserve(input); }
  markUploaded(id: string, userId: string) { return this.dataSource.markUploaded(id, userId); }
  markFailed(id: string, userId: string, code: string) { return this.dataSource.markFailed(id, userId, code); }
  updateQualityPreflight(id: string, userId: string, metadata: Record<string, unknown>, failureCode: string | null) {
    return this.dataSource.updateQualityPreflight(id, userId, metadata, failureCode);
  }
  findOwned(id: string, userId: string) { return this.dataSource.findOwned(id, userId); }
  softDelete(id: string, userId: string) { return this.dataSource.softDelete(id, userId); }
}
