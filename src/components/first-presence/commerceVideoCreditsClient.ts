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

async function body(response: Response): Promise<ResponseBody> {
  const parsed = await response.json().catch(() => ({}));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return parsed as ResponseBody;
}

async function requestJson(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  request: typeof fetch,
) {
  const response = await request(input, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const parsed = await body(response);
  if (!response.ok) {
    throw new CommerceVideoEntryError(
      typeof parsed.error === "string" ? parsed.error : "COMMERCE_UNAVAILABLE",
    );
  }
  return parsed;
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
) {
  return requestJson("/api/commerce/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomKey("commerce-video-order"),
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
