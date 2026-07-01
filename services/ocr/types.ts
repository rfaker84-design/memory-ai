export interface OCRInput {
  imageUrl: string;
  language?: string;
}

export interface OCRResult {
  text: string;
  provider: string;
}
