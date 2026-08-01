const MINIMUM_SECRET_BYTES = 48;

export class VideoInternalAccessConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "VideoInternalAccessConfigurationError";
  }
}

export type VideoInternalAccessKind = "review" | "reconciliation";

type VideoInternalAccessConfiguration = Readonly<{
  reviewToken: string;
  previousReviewToken: string | null;
  reviewAccount: string;
  reconciliationToken: string;
  previousReconciliationToken: string | null;
  reconciliationAccount: string;
}>;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const raw = environment[name];
  const value = raw?.trim();
  if (!value || raw !== value) throw new VideoInternalAccessConfigurationError(`${name}_NOT_CONFIGURED`);
  return value;
}

function requiredAccessToken(environment: NodeJS.ProcessEnv, name: string): string {
  const value = required(environment, name);
  if (new TextEncoder().encode(value).length < MINIMUM_SECRET_BYTES || new Set(value).size < 16) {
    throw new VideoInternalAccessConfigurationError(`${name}_NOT_CONFIGURED`);
  }
  return value;
}

function requireExact(environment: NodeJS.ProcessEnv, name: string, expected: string): void {
  if (required(environment, name) !== expected) {
    throw new VideoInternalAccessConfigurationError(`${name}_INVALID`);
  }
}

function previousToken(environment: NodeJS.ProcessEnv, name: "VIDEO_REVIEW_ACCESS_TOKEN" | "VIDEO_RECONCILIATION_ACCESS_TOKEN", current: string): string | null {
  const previous = environment[`${name}_PREVIOUS`];
  const validUntil = environment[`${name}_PREVIOUS_VALID_UNTIL`];
  if (!previous && !validUntil) return null;
  const expiry = Date.parse(validUntil ?? "");
  if (!previous || !validUntil || previous !== previous.trim() || previous === current
    || new TextEncoder().encode(previous).length < MINIMUM_SECRET_BYTES || new Set(previous).size < 16
    || !Number.isFinite(expiry) || expiry <= Date.now() || expiry - Date.now() > 900_000) {
    throw new VideoInternalAccessConfigurationError(`${name}_PREVIOUS_INVALID`);
  }
  return previous;
}

function constantTimeEquals(expected: string, candidate: string): boolean {
  const expectedBytes = new TextEncoder().encode(expected);
  const candidateBytes = new TextEncoder().encode(candidate);
  const length = Math.max(expectedBytes.length, candidateBytes.length);
  let difference = expectedBytes.length ^ candidateBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (expectedBytes[index] ?? 0) ^ (candidateBytes[index] ?? 0);
  }
  return difference === 0;
}

/** Both internal video control planes must be configured together. */
export function getVideoInternalAccessConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): VideoInternalAccessConfiguration {
  requireExact(environment, "YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED", "true");
  requireExact(environment, "YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED", "true");
  const reviewToken = requiredAccessToken(environment, "VIDEO_REVIEW_ACCESS_TOKEN");
  const reconciliationToken = requiredAccessToken(environment, "VIDEO_RECONCILIATION_ACCESS_TOKEN");
  const previousReviewToken = previousToken(environment, "VIDEO_REVIEW_ACCESS_TOKEN", reviewToken);
  const previousReconciliationToken = previousToken(environment, "VIDEO_RECONCILIATION_ACCESS_TOKEN", reconciliationToken);
  if (constantTimeEquals(reviewToken, reconciliationToken)) {
    throw new VideoInternalAccessConfigurationError("VIDEO_INTERNAL_ACCESS_TOKENS_NOT_DISTINCT");
  }
  return Object.freeze({
    reviewToken,
    previousReviewToken,
    reviewAccount: required(environment, "YIJIAN_VIDEO_REVIEW_ACCOUNT"),
    reconciliationToken,
    previousReconciliationToken,
    reconciliationAccount: required(environment, "YIJIAN_VIDEO_RECONCILIATION_ACCOUNT"),
  });
}

export function authorizeVideoInternalRequest(input: {
  kind: VideoInternalAccessKind;
  token: string | null;
  account: string | null;
}, environment: NodeJS.ProcessEnv = process.env): string | null {
  if (!input.token || !input.account) return null;
  let configuration: VideoInternalAccessConfiguration;
  try {
    configuration = getVideoInternalAccessConfiguration(environment);
  } catch {
    return null;
  }
  const expectedTokens = input.kind === "review"
    ? [configuration.reviewToken, configuration.previousReviewToken]
    : [configuration.reconciliationToken, configuration.previousReconciliationToken];
  const expectedAccount = input.kind === "review" ? configuration.reviewAccount : configuration.reconciliationAccount;
  return input.account === expectedAccount
    && expectedTokens.filter((token): token is string => token !== null).some((token) => constantTimeEquals(token, input.token))
    ? expectedAccount
    : null;
}
