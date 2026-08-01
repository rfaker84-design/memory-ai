export type CreateStage = 0 | 1 | 2 | 3;
export type CreateStatus = "loading" | "editing" | "saving-draft" | "uploading" | "submitting" | "success" | "media-recovery" | "recoverable-error" | "fatal-error";

export type CreateDraft = {
  name: string;
  relationship: string;
  preferredAddress: string;
  purpose: string;
  personality: string;
  catchPhrases: string;
  sharedExperiences: string;
  lifeMoments: string;
  interests: string;
  consent: boolean;
};

export const emptyDraft: CreateDraft = {
  name: "", relationship: "", preferredAddress: "", purpose: "", personality: "",
  catchPhrases: "", sharedExperiences: "", lifeMoments: "", interests: "", consent: false,
};
