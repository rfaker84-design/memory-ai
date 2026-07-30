import { runtimeConfig } from "../config/environment";
import { MemoryMedia, type PickedMedia } from "../native/memory-media";
import {
  loadCommerceCreditBalance,
  loadReferralStatus,
  loadCommerceVideoProducts,
  type CommerceCreditBalance,
  type CommerceReferralStatus,
  type CommerceVideoProduct,
} from "../../../src/components/first-presence/commerceVideoCreditsClient";
import type { PersistedConversationMessage } from "../../../src/components/memory/conversationExperience";

export type ProductMemory = {
  id: string;
  name: string;
  relationship: string;
  lifeStory?: string | null;
  photoUrl?: string | null;
  /** Server-confirmed portrait asset; a local blob is never enough to unlock video. */
  photoAssetId?: string | null;
  createdAt?: string;
};

export type ProductMediaAsset = {
  id: string;
  mediaType: "image" | "audio";
  mimeType: string;
  sizeBytes: number;
  status: "uploaded";
  createdAt: string;
};

export type FirstGreeting = {
  session: { id: string; memoryId: string; userId: string };
  greeting: {
    id: string;
    sessionId: string;
    memoryId: string;
    role: "assistant";
    content: string;
    createdAt: string;
  };
  replayed: boolean;
};

export type ProductConversationMessage = PersistedConversationMessage & {
  id?: string;
  sessionId?: string | null;
  role: "assistant" | "user" | "system";
  content: string;
  metadata?: Record<string, unknown> | null;
};

export type ProductConversation = {
  sessionId: string | null;
  messages: ProductConversationMessage[];
};

export type FirstPresenceVideoIntent = "initial_preview" | "additional_generation";

/** The public, owner-safe video DTO returned by the existing first-presence route. */
export type FirstPresenceVideoSafeDto = {
  id: string;
  memoryId: string;
  intent: FirstPresenceVideoIntent;
  status: string;
  provider: "vidu-cn-q2-pro-fast";
  saveAllowed: boolean;
  artifactAvailable: boolean;
  manualReviewRequired: boolean;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ProductApiError extends Error {
  constructor(readonly status: number, message = "暂时无法连接忆见") {
    super(message);
  }
}

function apiUrl(path: string): string {
  if (!runtimeConfig.apiBaseUrl) throw new ProductApiError(0, "当前没有可用的服务连接");
  return new URL(path, `${runtimeConfig.apiBaseUrl}/`).toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formalApiPath(input: RequestInfo | URL): string {
  if (typeof input !== "string" && !(input instanceof URL)) {
    throw new ProductApiError(400, "Only formal API paths are available to the packaged App.");
  }
  const raw = typeof input === "string" ? input : input.toString();
  if (!raw.startsWith("/") || raw.startsWith("//")) {
    throw new ProductApiError(400, "Only formal API paths are available to the packaged App.");
  }
  const parsed = new URL(raw, "https://mobile.invalid");
  if (parsed.origin !== "https://mobile.invalid" || !parsed.pathname.startsWith("/api/")) {
    throw new ProductApiError(400, "Only formal API paths are available to the packaged App.");
  }
  return `${parsed.pathname}${parsed.search}`;
}

const mediaExtensions: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
};

function mediaFileName(item: PickedMedia): string {
  const extension = mediaExtensions[item.mimeType.toLowerCase()];
  if (!extension) throw new ProductApiError(400, "暂不支持这种素材格式");
  const stem = item.name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\.[^.]+$/, "").trim() || "memory-media";
  return `${stem}${extension}`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Transport adapter for portable Web/Core clients. It accepts only formal API
 * paths, preserves the browser-managed HttpOnly session, and attaches the
 * Debug access header only in a Debug build.
 */
export async function mobileApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const path = formalApiPath(input);
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (__MOBILE_DEBUG_BUILD__ && runtimeConfig.stagingAccessToken) {
      headers.set("X-MemoryAI-Staging-Access", runtimeConfig.stagingAccessToken);
    }
    return await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ProductApiError(0, "Network connection is temporarily unavailable.");
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (__MOBILE_DEBUG_BUILD__ && runtimeConfig.stagingAccessToken) {
      headers.set("X-MemoryAI-Staging-Access", runtimeConfig.stagingAccessToken);
    }
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ProductApiError(0, "网络暂时不稳定，请稍后再试");
  }
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new ProductApiError(response.status, typeof body.error === "string" ? body.error : "暂时无法完成这一步");
  }
  return body as T;
}

function normalizeConversationMessage(value: unknown): ProductConversationMessage | null {
  const message = asRecord(value);
  const role = message.role;
  if (
    (role !== "assistant" && role !== "user" && role !== "system")
    || typeof message.content !== "string"
  ) {
    return null;
  }
  return {
    id: typeof message.id === "string" ? message.id : undefined,
    sessionId: typeof message.sessionId === "string" ? message.sessionId : null,
    role,
    content: message.content,
    metadata: message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
      ? message.metadata as Record<string, unknown>
      : null,
  };
}

function normalizeFirstPresenceVideo(value: unknown): FirstPresenceVideoSafeDto | null {
  const job = asRecord(value);
  const intent = job.intent;
  if (
    typeof job.id !== "string"
    || typeof job.memoryId !== "string"
    || (intent !== "initial_preview" && intent !== "additional_generation")
    || typeof job.status !== "string"
    || job.provider !== "vidu-cn-q2-pro-fast"
    || typeof job.saveAllowed !== "boolean"
    || typeof job.artifactAvailable !== "boolean"
    || typeof job.manualReviewRequired !== "boolean"
    || (typeof job.errorCode !== "string" && job.errorCode !== null)
    || typeof job.createdAt !== "string"
    || typeof job.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: job.id,
    memoryId: job.memoryId,
    intent,
    status: job.status,
    provider: job.provider,
    saveAllowed: job.saveAllowed,
    artifactAvailable: job.artifactAvailable,
    manualReviewRequired: job.manualReviewRequired,
    errorCode: job.errorCode,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export const productApi = {
  enabled: () => Boolean(runtimeConfig.apiBaseUrl),
  async session() {
    return request<{ authenticated?: boolean }>("/api/auth/session", { cache: "no-store" });
  },
  async sendCode(phone: string) {
    return request<{ challengeId?: string }>("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
  },
  async verifyCode(phone: string, challengeId: string, code: string) {
    return request<{ authenticated?: boolean }>("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, challengeId, code }),
    });
  },
  async createMemory(input: { name: string; relationship: string; lifeStory: string }) {
    return request<ProductMemory>("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `mobile-${crypto.randomUUID()}` },
      body: JSON.stringify({ name: input.name, relationship: input.relationship, lifeStory: input.lifeStory }),
    });
  },
  async uploadMedia(memoryId: string, item: PickedMedia) {
    const mimeType = item.mimeType.toLowerCase();
    const fileName = mediaFileName({ ...item, mimeType });
    const source = await MemoryMedia.readMedia({ uri: item.uri });
    const file = base64ToBlob(source.base64, mimeType);
    if (file.size === 0 || file.size !== source.sizeBytes) {
      throw new ProductApiError(400, "素材读取不完整，请重新选择后再试");
    }
    const form = new FormData();
    form.set("memoryId", memoryId);
    form.set("file", file, fileName);
    const result = await request<{ asset?: ProductMediaAsset }>("/api/media/upload", {
      method: "POST",
      body: form,
    });
    if (!result.asset || result.asset.status !== "uploaded" || !result.asset.id) {
      throw new ProductApiError(502, "服务端未确认素材保存，请重试");
    }
    return result.asset;
  },
  async createFirstGreeting(memoryId: string, idempotencyKey: string) {
    const result = await request<FirstGreeting>(`/api/memories/${encodeURIComponent(memoryId)}/first-greeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({}),
    });
    if (
      !result.session?.id
      || result.session.memoryId !== memoryId
      || result.greeting?.memoryId !== memoryId
      || result.greeting.role !== "assistant"
      || !result.greeting.content?.trim()
    ) {
      throw new ProductApiError(502, "服务端问候确认不完整，请重试");
    }
    return result;
  },
  async listMemories() {
    return request<ProductMemory[]>("/api/memories", { cache: "no-store" });
  },
  async getMemory(id: string) {
    return request<ProductMemory>(`/api/memories/${encodeURIComponent(id)}`, { cache: "no-store" });
  },
  async getConversation(memoryId: string) {
    const result = await request<{ session?: unknown; messages?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/chat-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const session = asRecord(result.session);
    const messages = Array.isArray(result.messages)
      ? result.messages.map(normalizeConversationMessage).filter((message): message is ProductConversationMessage => message !== null)
      : [];
    return {
      sessionId: typeof session.id === "string" ? session.id : null,
      messages,
    } satisfies ProductConversation;
  },
  async askMemory(memoryId: string, question: string) {
    return request<{ answer?: string; reply?: string; text?: string }>("/api/memory-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `mobile-chat-${crypto.randomUUID()}` },
      body: JSON.stringify({ memoryId, question }),
    });
  },
  async listFirstPresenceVideos(memoryId: string) {
    const result = await request<{ jobs?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/first-presence-video`, {
      cache: "no-store",
    });
    if (!Array.isArray(result.jobs)) throw new ProductApiError(502, "The video opportunity response was incomplete.");
    const jobs = result.jobs.map(normalizeFirstPresenceVideo);
    if (jobs.some((job) => job === null)) throw new ProductApiError(502, "The video opportunity response was incomplete.");
    return jobs as FirstPresenceVideoSafeDto[];
  },
  async loadCommerceCreditBalance(): Promise<CommerceCreditBalance> {
    return loadCommerceCreditBalance(mobileApiFetch);
  },
  async loadCommerceVideoProducts(): Promise<CommerceVideoProduct[]> {
    return loadCommerceVideoProducts(mobileApiFetch);
  },
  async loadCommerceReferralStatus(): Promise<CommerceReferralStatus> {
    return loadReferralStatus(mobileApiFetch);
  },
};
