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
import { appendConfirmedCorrection, type ReplyCorrectionSuggestion } from "../../../src/components/first-presence/memoryReplyCorrection";

export type ProductMemory = {
  id: string;
  name: string;
  relationship: string;
  lifeStory?: string | null;
  photoUrl?: string | null;
  /** Server-confirmed portrait asset; a local blob is never enough to unlock video. */
  photoAssetId?: string | null;
  personalityProfile?: string | null;
  speechStyle?: string | null;
  catchPhrases?: string | null;
  createdAt?: string;
};

export type ProductMemoryProfileInput = Pick<
  ProductMemory,
  "name" | "relationship" | "lifeStory" | "personalityProfile" | "speechStyle" | "catchPhrases"
>;

export type ProductMediaAsset = {
  id: string;
  mediaType: "image" | "audio";
  mimeType: string;
  sizeBytes: number;
  status: "uploaded";
  createdAt: string;
};

export type ProductPickup = {
  id: string;
  originalText: string;
  organizedText: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductAccountProfile = {
  birthDate: string | null;
  adultEligible: boolean;
};

export type ProductAccountDeletionProgress = {
  requestId: string;
  status: "requested" | "content_pending" | "provider_pending" | "legal_hold" | "completed" | "failed";
  contentDeleteAfter: string;
  providerDeleteAfter: string;
  backupExpireAfter: string;
  legalHold: boolean;
  completedAt: string | null;
};

export type ProductCrisisContact = {
  id: string;
  role: "owner" | "contact";
  status: "pending" | "accepted" | "revoked";
};

const pendingCrisisContactUpdates = new Set<string>();

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

export type ProductVideoShare = {
  publicId: string;
  title: string;
  jobId: string;
  memoryId: string;
  revokedAt: string | null;
  watermarkDownloadEnabled: boolean;
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

function normalizePickup(value: unknown): ProductPickup | null {
  const pickup = asRecord(value);
  if (
    typeof pickup.id !== "string"
    || typeof pickup.originalText !== "string"
    || typeof pickup.organizedText !== "string"
    || typeof pickup.createdAt !== "string"
    || typeof pickup.updatedAt !== "string"
  ) return null;
  return {
    id: pickup.id,
    originalText: pickup.originalText,
    organizedText: pickup.organizedText,
    createdAt: pickup.createdAt,
    updatedAt: pickup.updatedAt,
  };
}

function normalizeAccountDeletion(value: unknown): ProductAccountDeletionProgress | null {
  const deletion = asRecord(value);
  const status = deletion.status;
  if (
    typeof deletion.requestId !== "string"
    || !["requested", "content_pending", "provider_pending", "legal_hold", "completed", "failed"].includes(status as string)
    || typeof deletion.contentDeleteAfter !== "string"
    || typeof deletion.providerDeleteAfter !== "string"
    || typeof deletion.backupExpireAfter !== "string"
    || typeof deletion.legalHold !== "boolean"
    || (typeof deletion.completedAt !== "string" && deletion.completedAt !== null)
  ) return null;
  return {
    requestId: deletion.requestId,
    status: status as ProductAccountDeletionProgress["status"],
    contentDeleteAfter: deletion.contentDeleteAfter,
    providerDeleteAfter: deletion.providerDeleteAfter,
    backupExpireAfter: deletion.backupExpireAfter,
    legalHold: deletion.legalHold,
    completedAt: deletion.completedAt,
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
  async updateMemoryProfile(memoryId: string, input: ProductMemoryProfileInput) {
    const updated = await request<ProductMemory>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (typeof updated.id !== "string" || updated.id !== memoryId || !updated.name.trim() || !updated.relationship.trim()) {
      throw new ProductApiError(502, "服务端未确认 TA 资料保存");
    }
    return updated;
  },
  async appendConfirmedReplyCorrection(memoryId: string, suggestion: ReplyCorrectionSuggestion) {
    const current = await this.getMemory(memoryId);
    const currentValue = current[suggestion.field];
    if (currentValue?.includes(suggestion.text)) return current;
    const updated = await request<ProductMemory>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [suggestion.field]: appendConfirmedCorrection(currentValue, suggestion.text) }),
    });
    if (typeof updated.id !== "string" || updated.id !== memoryId) {
      throw new ProductApiError(502, "服务端未确认 TA 资料校正");
    }
    return updated;
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
  async getAccountProfile() {
    const result = await request<{ birthDate?: unknown; adultEligible?: unknown }>("/api/account/profile", { cache: "no-store" });
    if ((typeof result.birthDate !== "string" && result.birthDate !== null) || typeof result.adultEligible !== "boolean") {
      throw new ProductApiError(502, "服务端个人资料格式不完整");
    }
    return { birthDate: result.birthDate, adultEligible: result.adultEligible } satisfies ProductAccountProfile;
  },
  async updateBirthDate(birthDate: string) {
    const result = await request<{ birthDate?: unknown; adultEligible?: unknown }>("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate }),
    });
    if (typeof result.birthDate !== "string" || typeof result.adultEligible !== "boolean") {
      throw new ProductApiError(502, "服务端未确认生日保存");
    }
    return { birthDate: result.birthDate, adultEligible: result.adultEligible } satisfies ProductAccountProfile;
  },
  async getCrisisSupport() {
    const [consents, contacts] = await Promise.all([
      request<{ crisisSupportEnabled?: unknown }>("/api/consents", { cache: "no-store" }),
      request<{ contacts?: unknown }>("/api/account/crisis-contacts", { cache: "no-store" }),
    ]);
    if (typeof consents.crisisSupportEnabled !== "boolean" || !Array.isArray(contacts.contacts)) {
      throw new ProductApiError(502, "服务端未确认危机支持设置");
    }
    const normalized = contacts.contacts.flatMap((value): ProductCrisisContact[] => {
      if (typeof value !== "object" || value === null) return [];
      const contact = value as Record<string, unknown>;
      return typeof contact.id === "string" && (contact.role === "owner" || contact.role === "contact") && (contact.status === "pending" || contact.status === "accepted" || contact.status === "revoked")
        ? [{ id: contact.id, role: contact.role, status: contact.status }]
        : [];
    });
    if (normalized.length !== contacts.contacts.length) throw new ProductApiError(502, "服务端危机联系人格式不完整");
    return { enabled: consents.crisisSupportEnabled, contacts: normalized };
  },
  async setCrisisSupport(enabled: boolean) {
    if (enabled) {
      await request<{ recorded?: unknown }>("/api/consents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `mobile-consent-${crypto.randomUUID()}` },
        body: JSON.stringify({ consentType: "crisis_support_escalation" }),
      });
    } else {
      await request<{ revoked?: unknown }>("/api/consents", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentType: "crisis_support_escalation" }),
      });
    }
  },
  async requestCrisisContact(contactExternalId: string) {
    await request<{ requested?: unknown }>("/api/account/crisis-contacts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactExternalId }),
    });
  },
  async updateCrisisContact(consentId: string, action: "accept" | "revoke") {
    const operationKey = `${consentId}:${action}`;
    if (pendingCrisisContactUpdates.has(operationKey)) {
      throw new ProductApiError(409, "联系人状态正在更新，请勿重复提交");
    }
    pendingCrisisContactUpdates.add(operationKey);
    try {
      const result = await request<{ updated?: unknown }>("/api/account/crisis-contacts", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consentId, action }),
      });
      if (result.updated !== true) throw new ProductApiError(409, "服务端未确认联系人状态变更");
    } finally {
      pendingCrisisContactUpdates.delete(operationKey);
    }
  },
  async downloadAccountDataExport(): Promise<Blob> {
    const response = await mobileApiFetch("/api/account/export", { method: "POST", cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new ProductApiError(response.status, typeof body.error === "string" ? body.error : "ACCOUNT_DATA_EXPORT_FAILED");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new ProductApiError(502, "ACCOUNT_DATA_EXPORT_INVALID_RESPONSE");
    }
    return response.blob();
  },
  async getAccountDeletion() {
    const result = await request<{ deletion?: unknown }>("/api/account/deletion", { cache: "no-store" });
    if (result.deletion === undefined || result.deletion === null) return null;
    const deletion = normalizeAccountDeletion(result.deletion);
    if (!deletion) throw new ProductApiError(502, "服务端未确认注销进度");
    return deletion;
  },
  async requestAccountDeletion() {
    const result = await request<{ deletion?: unknown }>("/api/account/deletion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE_ACCOUNT" }),
    });
    const deletion = normalizeAccountDeletion(result.deletion);
    if (!deletion) throw new ProductApiError(502, "服务端未确认注销申请");
    return deletion;
  },
  async listPickups(memoryId: string) {
    const result = await request<{ pickups?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, { cache: "no-store" });
    if (!Array.isArray(result.pickups)) throw new ProductApiError(502, "服务端未返回确认资料列表");
    const pickups = result.pickups.map(normalizePickup);
    if (pickups.some((pickup) => pickup === null)) throw new ProductApiError(502, "服务端确认资料格式不完整");
    return pickups as ProductPickup[];
  },
  async confirmPickup(memoryId: string, input: { originalText: string; organizedText: string }, idempotencyKey: string) {
    const result = await request<{ pickup?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/pickups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...input, confirmed: true }),
    });
    const pickup = normalizePickup(result.pickup);
    if (!pickup) throw new ProductApiError(502, "服务端未确认资料保存");
    return pickup;
  },
  async updatePickup(memoryId: string, pickupId: string, input: { originalText: string; organizedText: string }) {
    const result = await request<{ pickup?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/pickups/${encodeURIComponent(pickupId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const pickup = normalizePickup(result.pickup);
    if (!pickup) throw new ProductApiError(502, "服务端未确认资料更新");
    return pickup;
  },
  async deletePickup(memoryId: string, pickupId: string) {
    const response = await mobileApiFetch(`/api/memories/${encodeURIComponent(memoryId)}/pickups/${encodeURIComponent(pickupId)}`, { method: "DELETE" });
    if (response.status === 204) return;
    const body = await response.json().catch(() => ({})) as { error?: unknown };
    throw new ProductApiError(response.status, typeof body.error === "string" ? body.error : "暂时无法删除确认资料");
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
  async listVideoShares(memoryId: string): Promise<ProductVideoShare[]> {
    const result = await request<{ shares?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/video-shares`, { cache: "no-store" });
    if (!Array.isArray(result.shares)) throw new ProductApiError(502, "VIDEO_SHARE_RESPONSE_INCOMPLETE");
    return result.shares.map((value) => {
      const share = asRecord(value);
      if (typeof share.publicId !== "string" || typeof share.title !== "string" || typeof share.jobId !== "string" || share.memoryId !== memoryId || share.revokedAt !== null || typeof share.watermarkDownloadEnabled !== "boolean") throw new ProductApiError(502, "VIDEO_SHARE_RESPONSE_INCOMPLETE");
      return { publicId: share.publicId, title: share.title, jobId: share.jobId, memoryId, revokedAt: null, watermarkDownloadEnabled: share.watermarkDownloadEnabled };
    });
  },
  async createVideoShare(memoryId: string, jobId: string, title: string): Promise<ProductVideoShare> {
    const result = await request<{ share?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/video-shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, title }) });
    const share = asRecord(result.share);
    if (typeof share.publicId !== "string" || typeof share.title !== "string" || typeof share.jobId !== "string" || share.memoryId !== memoryId || share.revokedAt !== null || typeof share.watermarkDownloadEnabled !== "boolean") throw new ProductApiError(502, "VIDEO_SHARE_RESPONSE_INCOMPLETE");
    return { publicId: share.publicId, title: share.title, jobId: share.jobId, memoryId, revokedAt: null, watermarkDownloadEnabled: share.watermarkDownloadEnabled };
  },
  async revokeVideoShare(memoryId: string, publicId: string): Promise<void> {
    const result = await request<{ revoked?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(publicId)}`, { method: "DELETE" });
    if (result.revoked !== true) throw new ProductApiError(409, "VIDEO_SHARE_REVOKE_UNCONFIRMED");
  },
  async setVideoShareWatermarkDownload(memoryId: string, publicId: string, enabled: boolean): Promise<ProductVideoShare> {
    const result = await request<{ share?: unknown }>(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(publicId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ watermarkDownloadEnabled: enabled }) });
    const share = asRecord(result.share);
    if (typeof share.publicId !== "string" || typeof share.title !== "string" || typeof share.jobId !== "string" || share.memoryId !== memoryId || share.revokedAt !== null || typeof share.watermarkDownloadEnabled !== "boolean") throw new ProductApiError(502, "VIDEO_SHARE_RESPONSE_INCOMPLETE");
    return { publicId: share.publicId, title: share.title, jobId: share.jobId, memoryId, revokedAt: null, watermarkDownloadEnabled: share.watermarkDownloadEnabled };
  },
  async downloadWatermarkedVideoShare(memoryId: string, publicId: string): Promise<Blob> {
    const response = await mobileApiFetch(`/api/memories/${encodeURIComponent(memoryId)}/video-shares/${encodeURIComponent(publicId)}/download`, { cache: "no-store" });
    if (!response.ok || response.headers.get("content-type") !== "video/mp4") throw new ProductApiError(response.status || 502, "VIDEO_SHARE_DOWNLOAD_UNAVAILABLE");
    return response.blob();
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
