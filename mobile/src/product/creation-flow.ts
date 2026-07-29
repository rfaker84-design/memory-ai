import type { PickedMedia } from "../native/memory-media";
import type { FirstGreeting, ProductMediaAsset, ProductMemory } from "./api";

export class CreationFlowError extends Error {}

export type PendingCreation = {
  memory: ProductMemory;
  media: readonly PickedMedia[];
  uploadedMediaUris: readonly string[];
  firstGreetingKey: string;
};

export type CreationApi = {
  uploadMedia(memoryId: string, item: PickedMedia): Promise<ProductMediaAsset>;
  createFirstGreeting(memoryId: string, idempotencyKey: string): Promise<FirstGreeting>;
};

function isPhoto(item: PickedMedia): boolean {
  return item.mimeType.toLowerCase().startsWith("image/");
}

export function startPendingCreation(memory: ProductMemory, media: readonly PickedMedia[]): PendingCreation {
  if (!media.some(isPhoto)) {
    throw new CreationFlowError("请至少选择一张照片后再继续");
  }
  return {
    memory,
    media,
    uploadedMediaUris: [],
    firstGreetingKey: `first-greeting-${memory.id}-${crypto.randomUUID()}`,
  };
}

export async function uploadPendingMedia(
  pending: PendingCreation,
  api: CreationApi,
  onProgress?: (next: PendingCreation) => void,
): Promise<PendingCreation> {
  let next = pending;
  for (const item of pending.media) {
    if (next.uploadedMediaUris.includes(item.uri)) continue;
    const asset = await api.uploadMedia(next.memory.id, item);
    if (asset.status !== "uploaded") {
      throw new CreationFlowError("服务端未确认素材保存，请重试");
    }
    next = { ...next, uploadedMediaUris: [...next.uploadedMediaUris, item.uri] };
    onProgress?.(next);
  }
  return next;
}

export async function requestServerGreeting(pending: PendingCreation, api: CreationApi): Promise<FirstGreeting> {
  if (pending.uploadedMediaUris.length !== pending.media.length) {
    throw new CreationFlowError("照片尚未全部保存，请重试");
  }
  const result = await api.createFirstGreeting(pending.memory.id, pending.firstGreetingKey);
  if (
    result.session.memoryId !== pending.memory.id
    || result.greeting.memoryId !== pending.memory.id
    || result.greeting.role !== "assistant"
    || !result.greeting.content.trim()
  ) {
    throw new CreationFlowError("服务端问候确认不完整，请重试");
  }
  return result;
}
