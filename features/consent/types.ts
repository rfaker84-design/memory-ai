export type ConsentType =
  | "memory_profile"
  | "media_asset"
  | "voice_clone"
  | "avatar_generation"
  | "digital_human"
  | "commercial_use";

export type ConsentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export interface ConsentRecord {
  id: string;
  userId: string;
  memoryId: string;
  consentType: ConsentType;
  status: ConsentStatus;
  ownerName: string | null;
  relationshipToOwner: string | null;
  proofUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateConsentInput = Omit<
  ConsentRecord,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdateConsentInput = Partial<
  Pick<ConsentRecord, "status" | "proofUrl" | "notes">
>;

export interface ConsentCheckInput {
  userId: string;
  memoryId: string;
  consentType: ConsentType;
}

export interface ConsentCheckResult {
  allowed: boolean;
  status: ConsentStatus | null;
  reason?: string;
}