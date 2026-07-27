export type InternalBetaCapability = "long-term-memory";

type BetaEnvironment = Record<string, string | undefined>;

export type InternalBetaAccessDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "deployment_tier_not_internal_beta"
    | "data_scope_not_isolated"
    | "feature_disabled"
    | "test_account_not_allowed";
};

const CAPABILITY_CONFIG: Record<
  InternalBetaCapability,
  { enabledKey: string; allowlistKey: string }
> = {
  "long-term-memory": {
    enabledKey: "MEMORYAI_LONG_TERM_MEMORY_BETA_ENABLED",
    allowlistKey: "MEMORYAI_LONG_TERM_MEMORY_BETA_TEST_USER_IDS",
  },
};

function parseAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function resolveInternalBetaAccess(
  capability: InternalBetaCapability,
  externalUserId: string,
  environment: BetaEnvironment = process.env
): InternalBetaAccessDecision {
  if (environment.MEMORYAI_DEPLOYMENT_TIER !== "internal-beta") {
    return { allowed: false, reason: "deployment_tier_not_internal_beta" };
  }
  if (environment.MEMORYAI_BETA_DATA_SCOPE !== "isolated-test") {
    return { allowed: false, reason: "data_scope_not_isolated" };
  }

  const config = CAPABILITY_CONFIG[capability];
  if (environment[config.enabledKey] !== "true") {
    return { allowed: false, reason: "feature_disabled" };
  }
  if (!parseAllowlist(environment[config.allowlistKey]).has(externalUserId.trim())) {
    return { allowed: false, reason: "test_account_not_allowed" };
  }
  return { allowed: true, reason: "allowed" };
}

export function canAccessInternalBeta(
  capability: InternalBetaCapability,
  externalUserId: string
): boolean {
  return resolveInternalBetaAccess(capability, externalUserId).allowed;
}
