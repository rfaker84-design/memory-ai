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
  birthYear?: number | null;
  deathYear?: number | null;
  valuesBelief?: string | null;
  personalityType?: string | null;
}

export type CreateMemoryInput = Omit<Memory, "id" | "createdAt" | "updatedAt">;

export type UpdateMemoryInput = Partial<CreateMemoryInput>;
