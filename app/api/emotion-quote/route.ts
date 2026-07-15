import { legacyMutationUnavailable } from "@/app/api/_legacy-unavailable";

export interface EmotionQuotes {
  surface: string;
  emotional: string;
  deep: string;
  quote: string;
}

export const POST = legacyMutationUnavailable;
