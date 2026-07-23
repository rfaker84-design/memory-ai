export interface MemoryFragmentInput {
  sourceType: string;
  content: string;
}

export interface Memory {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  createdAt: string;
  updatedAt: string;
  lifeStory?: string | null;
  personalityProfile?: string | null;
  speechStyle?: string | null;
  catchPhrases?: string | null;
  photoUrl?: string | null;
  /** Latest uploaded, owned portrait asset. The client resolves it through the signed media route. */
  photoAssetId?: string | null;
  personalityTags?: string[] | string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  valuesBelief?: string | null;
  personalityType?: string | null;
}

export type CreateMemoryInput = Omit<Memory, "id" | "createdAt" | "updatedAt"> & {
  fragments?: MemoryFragmentInput[];
  idempotencyKey?: string;
};

export type UpdateMemoryInput = Partial<CreateMemoryInput>;

export type UpdateOwnedMemoryInput = Omit<
  UpdateMemoryInput,
  "userId" | "idempotencyKey"
>;
