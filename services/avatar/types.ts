export interface AvatarGenerateInput {
  memoryId: string;
  userId: string;
  imageUrl?: string;
  prompt?: string;
  style?: string;
}

export interface AvatarGenerateResult {
  avatarUrl: string;
  provider: string;
  status: string;
  jobId?: string;
}
