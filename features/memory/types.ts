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
  personalityTags?: string[] | string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  valuesBelief?: string | null;
  personalityType?: string | null;
}

export type CreateMemoryInput = Omit<Memory, "id" | "createdAt" | "updatedAt"> & {
  fragments?: MemoryFragmentInput[];
};

export type UpdateMemoryInput = Partial<CreateMemoryInput>;
