export interface TTSGenerateInput {
  text: string;
  voice?: string;
  speed?: number;
  format?: string;
}

export interface TTSGenerateResult {
  audioUrl: string;
  provider: string;
  duration?: number;
  format?: string;
}
