import { registerPlugin } from "@capacitor/core";

export type PickedMedia = {
  uri: string;
  mimeType: string;
  name: string;
  sizeBytes?: number;
};

export type ReadMedia = {
  base64: string;
  sizeBytes: number;
};

export interface MemoryMediaPlugin {
  pickMedia(options: { limit: number }): Promise<{ items: PickedMedia[] }>;
  readMedia(options: { uri: string }): Promise<ReadMedia>;
  saveVideo(options: { signedUrl: string; fileName: string; mimeType: string }): Promise<{ uri: string }>;
}

export const MemoryMedia = registerPlugin<MemoryMediaPlugin>("MemoryMedia");

export async function saveSignedVideo(input: { signedUrl: string; fileName: string; mimeType: string }): Promise<string> {
  const result = await MemoryMedia.saveVideo({
    signedUrl: input.signedUrl,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  return result.uri;
}
