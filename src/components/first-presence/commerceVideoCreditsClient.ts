export type CommerceVideoProduct = {
  id: "memory_video_49" | "memory_video_99" | "memory_video_199";
  priceFen: 4900 | 9900 | 19900;
  generationCredits: 2 | 6 | 15;
  grantsFirstPreviewSave: true;
};

export type CommerceCreditBalance = {
  paidAvailable: number;
  referralAvailable: number;
  freePreviewAvailable: number;
  photoRemedyAvailable: number;
  occasionAvailable: number;
  totalAvailable: number;
  paidCreditsNeverExpire: true;
  canSaveFirstPreview: boolean;
};

export type CommerceReferralStatus = {
  code: string;
  qualifiedInvitees: number;
  rewardsGranted: number;
  inviteesUntilNextReward: number;
};

export type OccasionRewardOffer = {
  occasion: "birthday" | "mothers_day" | "fathers_day";
  calendarYear: number;
  eligibleOn: string;
  claimDeadline: string;
  claimed: boolean;
};

export type OccasionVideoRecovery = {
  memoryId: string;
  occasion: OccasionRewardOffer["occasion"];
  claimIdempotencyKey: string;
  videoIdempotencyKey: string;
};

export const COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY = "memoryai:commerce-video-order-recovery:v1";
export const OCCASION_VIDEO_RECOVERY_STORAGE_KEY = "memoryai:occasion-video-recovery:v1";
export const COMMERCE_REQUEST_TIMEOUT_MS = 20_000;

export type CommerceVideoOrderRecovery = {
  memoryId: string;
  productId: CommerceVideoProduct["id"];
  platform: "web" | "android" | "ios";
  idempotencyKey: string;
};

export type CommerceRecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type ResponseBody = Record<string, unknown>;

export class CommerceVideoEntryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function randomKey(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  return prefix + "-" + suffix;
}

export function createCommerceVideoOrderIdempotencyKey() {
  return randomKey("commerce-video-order");
}

export function createOccasionVideoRecovery(memoryId: string, occasion: OccasionRewardOffer["occasion"]): OccasionVideoRecovery {
  return {
    memoryId,
    occasion,
    claimIdempotencyKey: randomKey("occasion-reward-claim"),
    videoIdempotencyKey: randomKey("occasion-video"),
  };
}

function defaultCommerceRecoveryStorage(): CommerceRecoveryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isCommerceVideoOrderRecovery(value: unknown): value is CommerceVideoOrderRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4
    && typeof record.memoryId === "string"
    && typeof record.idempotencyKey === "string"
    && ["memory_video_49", "memory_video_99", "memory_video_199"].includes(record.productId as string)
    && ["web", "android", "ios"].includes(record.platform as string)
    && record.memoryId.length > 0
    && record.memoryId.length <= 128
    && /^commerce-video-order-[^\r\n]{8,120}$/.test(record.idempotencyKey);
}

export function readCommerceVideoOrderRecovery(
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): CommerceVideoOrderRecovery | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isCommerceVideoOrderRecovery(parsed)) return parsed;
    storage.removeItem(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY);
  } catch {
    // Private browsing storage failures must not create a second order attempt.
  }
  return null;
}

export function writeCommerceVideoOrderRecovery(
  record: CommerceVideoOrderRecovery,
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): boolean {
  if (!storage || !isCommerceVideoOrderRecovery(record)) return false;
  try {
    storage.setItem(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearCommerceVideoOrderRecovery(
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(COMMERCE_VIDEO_ORDER_RECOVERY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function isOccasionVideoRecovery(value: unknown): value is OccasionVideoRecovery {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4
    && typeof record.memoryId === "string"
    && ["birthday", "mothers_day", "fathers_day"].includes(record.occasion as string)
    && typeof record.claimIdempotencyKey === "string"
    && typeof record.videoIdempotencyKey === "string"
    && /^occasion-reward-claim-[^\r\n]{8,120}$/.test(record.claimIdempotencyKey)
    && /^occasion-video-[^\r\n]{8,120}$/.test(record.videoIdempotencyKey);
}

export function readOccasionVideoRecovery(
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): OccasionVideoRecovery | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(OCCASION_VIDEO_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isOccasionVideoRecovery(parsed)) return parsed;
    storage.removeItem(OCCASION_VIDEO_RECOVERY_STORAGE_KEY);
  } catch {
    // A missing recovery record must never cause a blind duplicate request.
  }
  return null;
}

export function writeOccasionVideoRecovery(
  record: OccasionVideoRecovery,
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): boolean {
  if (!storage || !isOccasionVideoRecovery(record)) return false;
  try {
    storage.setItem(OCCASION_VIDEO_RECOVERY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearOccasionVideoRecovery(
  storage: CommerceRecoveryStorage | null = defaultCommerceRecoveryStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(OCCASION_VIDEO_RECOVERY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

async function body(response: Response, signal: AbortSignal): Promise<ResponseBody> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ResponseBody;
  } catch (error) {
    if (signal.aborted) throw error;
    return {};
  }
}

async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  request: typeof fetch,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = globalThis.setTimeout(() => { timedOut = true; controller.abort(); }, COMMERCE_REQUEST_TIMEOUT_MS);
  try {
    const response = await request(input, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      signal: controller.signal,
    });
    const parsed = await body(response, controller.signal);
    if (!response.ok) {
      throw new CommerceVideoEntryError(
        typeof parsed.error === "string" ? parsed.error : "COMMERCE_UNAVAILABLE",
      );
    }
    return parsed;
  } catch (error) {
    if (timedOut) throw new CommerceVideoEntryError("COMMERCE_REQUEST_TIMEOUT");
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function isNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCommerceCreditBalance(value: unknown): value is CommerceCreditBalance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const balance = value as Record<string, unknown>;
  return [
    "paidAvailable",
    "referralAvailable",
    "freePreviewAvailable",
    "photoRemedyAvailable",
    "occasionAvailable",
    "totalAvailable",
  ].every((key) => isNonNegativeInteger(balance[key]))
    && balance.paidCreditsNeverExpire === true
    && typeof balance.canSaveFirstPreview === "boolean";
}

export async function loadCommerceVideoProducts(request: typeof fetch = fetch) {
  const parsed = await requestJson("/api/commerce/catalog", undefined, request);
  if (!Array.isArray(parsed.products)) throw new CommerceVideoEntryError("INVALID_COMMERCE_CATALOG");
  return parsed.products as CommerceVideoProduct[];
}

export async function loadCommerceCreditBalance(request: typeof fetch = fetch) {
  const parsed = await requestJson("/api/commerce/credits", undefined, request);
  if (!isCommerceCreditBalance(parsed.balance)) {
    throw new CommerceVideoEntryError("INVALID_COMMERCE_BALANCE");
  }
  return parsed.balance;
}

export async function loadReferralStatus(request: typeof fetch = fetch) {
  const parsed = await requestJson("/api/commerce/referrals/code", undefined, request);
  if (typeof parsed.referral !== "object" || parsed.referral === null || Array.isArray(parsed.referral)) {
    throw new CommerceVideoEntryError("INVALID_REFERRAL_STATUS");
  }
  return parsed.referral as CommerceReferralStatus;
}

function isOccasionRewardOffer(value: unknown): value is OccasionRewardOffer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const offer = value as Record<string, unknown>;
  return ["birthday", "mothers_day", "fathers_day"].includes(offer.occasion as string)
    && isNonNegativeInteger(offer.calendarYear)
    && /^\d{4}-\d{2}-\d{2}$/.test(offer.eligibleOn as string)
    && /^\d{4}-\d{2}-\d{2}$/.test(offer.claimDeadline as string)
    && typeof offer.claimed === "boolean";
}

export async function loadOpenOccasionRewardOffers(request: typeof fetch = fetch) {
  const parsed = await requestJson("/api/commerce/occasion-rewards", undefined, request);
  if (!Array.isArray(parsed.offers) || !parsed.offers.every(isOccasionRewardOffer)) {
    throw new CommerceVideoEntryError("INVALID_OCCASION_REWARDS");
  }
  return parsed.offers;
}

export async function claimOccasionReward(
  occasion: OccasionRewardOffer["occasion"],
  idempotencyKey: string,
  request: typeof fetch = fetch,
) {
  return requestJson("/api/commerce/occasion-rewards", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ occasion }),
  }, request);
}

export async function createOccasionVideo(
  memoryId: string,
  idempotencyKey: string,
  request: typeof fetch = fetch,
) {
  return requestJson(`/api/memories/${encodeURIComponent(memoryId)}/first-presence-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ intent: "additional_generation", creditSource: "occasion_reward" }),
  }, request);
}

export async function createReferralCode(request: typeof fetch = fetch) {
  const parsed = await requestJson("/api/commerce/referrals/code", {
    method: "POST",
    headers: { "Idempotency-Key": randomKey("commerce-referral") },
  }, request);
  if (typeof parsed.referral !== "object" || parsed.referral === null || Array.isArray(parsed.referral)) {
    throw new CommerceVideoEntryError("INVALID_REFERRAL_CODE");
  }
  return parsed.referral as { code: string };
}

export async function createCommerceVideoOrder(
  memoryId: string,
  productId: CommerceVideoProduct["id"],
  platform: "web" | "android" | "ios",
  request: typeof fetch = fetch,
  idempotencyKey = createCommerceVideoOrderIdempotencyKey(),
) {
  return requestJson("/api/commerce/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ memoryId, productId, platform }),
  }, request);
}

export function availableVideoCredits(balance: CommerceCreditBalance | null) {
  return balance?.totalAvailable ?? 0;
}

export function commercePlatform(userAgent: string) {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios" as const;
  if (/Android/i.test(userAgent)) return "android" as const;
  return "web" as const;
}
