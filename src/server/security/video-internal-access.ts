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
  reviewAccount: string;
  reconciliationToken: string;
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
  if (constantTimeEquals(reviewToken, reconciliationToken)) {
    throw new VideoInternalAccessConfigurationError("VIDEO_INTERNAL_ACCESS_TOKENS_NOT_DISTINCT");
  }
  return Object.freeze({
    reviewToken,
    reviewAccount: required(environment, "YIJIAN_VIDEO_REVIEW_ACCOUNT"),
    reconciliationToken,
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
  const expectedToken = input.kind === "review" ? configuration.reviewToken : configuration.reconciliationToken;
  const expectedAccount = input.kind === "review" ? configuration.reviewAccount : configuration.reconciliationAccount;
  return input.account === expectedAccount && constantTimeEquals(expectedToken, input.token) ? expectedAccount : null;
}
