import { runtimeConfig } from "../config/environment";

export type ProductMemory = {
  id: string;
  name: string;
  relationship: string;
  lifeStory?: string | null;
  photoUrl?: string | null;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      credentials: "include",
      headers: { Accept: "application/json", ...init.headers },
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
  async getMemory(id: string) {
    return request<ProductMemory>(`/api/memories/${encodeURIComponent(id)}`, { cache: "no-store" });
  },
  async askMemory(memoryId: string, question: string) {
    return request<{ answer?: string; reply?: string; text?: string }>("/api/memory-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `mobile-chat-${crypto.randomUUID()}` },
      body: JSON.stringify({ memoryId, question }),
    });
  },
};
