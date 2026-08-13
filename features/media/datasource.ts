import type { MediaAsset, ReserveMediaInput, ReserveMediaResult } from "./types";
export interface MediaDataSource {
  reserve(input: ReserveMediaInput): Promise<ReserveMediaResult>;
  markUploaded(id: string, externalUserId: string): Promise<MediaAsset>;
  markFailed(id: string, externalUserId: string, failureCode: string): Promise<void>;
  updateQualityPreflight(id: string, externalUserId: string, metadata: Record<string, unknown>, failureCode: string | null): Promise<MediaAsset | null>;
  findOwned(id: string, externalUserId: string): Promise<MediaAsset | null>;
  softDelete(id: string, externalUserId: string): Promise<MediaAsset | null>;
}
