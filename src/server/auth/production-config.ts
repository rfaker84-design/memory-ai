import {
  assertStagingRuntimeConfiguration,
  StagingRuntimeConfigurationError,
} from "../runtime/staging-contract";
import {
  getVideoInternalAccessConfiguration,
  VideoInternalAccessConfigurationError,
} from "../security/video-internal-access";

export class ProductionAuthConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ProductionAuthConfigurationError";
  }
}

function requireValue(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ProductionAuthConfigurationError(`${name}_NOT_CONFIGURED`);
  return value;
}

function requireSecret(environment: NodeJS.ProcessEnv, name: "AUTH_VERIFICATION_PEPPER" | "SESSION_SECRET"): void {
  if (new TextEncoder().encode(requireValue(environment, name)).length < 32) {
    throw new ProductionAuthConfigurationError(`${name}_NOT_CONFIGURED`);
  }
}

function requireRefundReviewAccessToken(environment: NodeJS.ProcessEnv): void {
  const raw = environment.REFUND_REVIEW_ACCESS_TOKEN;
  const value = raw?.trim();
  if (!value || raw !== value || new TextEncoder().encode(value).length < 48) {
    throw new ProductionAuthConfigurationError("REFUND_REVIEW_ACCESS_TOKEN_NOT_CONFIGURED");
  }
}

function requireHttpsOrigin(environment: NodeJS.ProcessEnv): void {
  const value = requireValue(environment, "AUTH_ALLOWED_ORIGIN");
  try {
    const origin = new URL(value);
    if (
      origin.protocol !== "https:"
      || origin.origin !== value.replace(/\/$/, "")
      || origin.username
      || origin.password
    ) {
      throw new Error("invalid origin");
    }
  } catch {
    throw new ProductionAuthConfigurationError("AUTH_ALLOWED_ORIGIN_INVALID");
  }
}

function requirePostgresUrl(environment: NodeJS.ProcessEnv): void {
  const value = requireValue(environment, "DATABASE_URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new ProductionAuthConfigurationError("DATABASE_URL_INVALID");
  }
}

function requireFormalLLM(environment: NodeJS.ProcessEnv): void {
  if (environment.LLM_PROVIDER?.trim() !== "deepseek") {
    throw new ProductionAuthConfigurationError("DEEPSEEK_PROVIDER_REQUIRED");
  }
  if (!environment.DEEPSEEK_API_KEY?.trim()) {
    throw new ProductionAuthConfigurationError("DEEPSEEK_API_KEY_NOT_CONFIGURED");
  }
  if (!environment.DEEPSEEK_MODEL?.trim()) {
    throw new ProductionAuthConfigurationError("DEEPSEEK_MODEL_NOT_CONFIGURED");
  }
}

function requireFormalTTS(environment: NodeJS.ProcessEnv): void {
  if (environment.TTS_PROVIDER?.trim() !== "tencent") {
    throw new ProductionAuthConfigurationError("TENCENT_TTS_PROVIDER_REQUIRED");
  }
}

function requireDeploymentEnvironment(environment: NodeJS.ProcessEnv): "production" | "staging" {
  const deploymentEnvironment = environment.DEPLOYMENT_ENV?.trim();
  if (deploymentEnvironment === "production" || deploymentEnvironment === "staging") {
    return deploymentEnvironment;
  }
  throw new ProductionAuthConfigurationError("DEPLOYMENT_ENV_INVALID");
}

function rejectStagingCapabilities(environment: NodeJS.ProcessEnv): void {
  const stagingVariable = Object.keys(environment).find((name) => name.startsWith("STAGING_") && environment[name]?.trim());
  if (stagingVariable) {
    throw new ProductionAuthConfigurationError("STAGING_CAPABILITY_FORBIDDEN");
  }
  if (
    environment.STORAGE_PROVIDER?.trim() === "local"
    || environment.MEDIA_STORAGE_PROVIDER?.trim() === "local"
  ) {
    throw new ProductionAuthConfigurationError("STAGING_CAPABILITY_FORBIDDEN");
  }
  if (environment.VIDEO_ARTIFACT_STORAGE_PROVIDER?.trim() === "local-staging") {
    throw new ProductionAuthConfigurationError("STAGING_CAPABILITY_FORBIDDEN");
  }
}

/**
 * Prevent a production process from becoming healthy while authentication is
 * unusable. SMS is intentionally capability-scoped so an unavailable SMS
 * provider does not prevent unrelated production routes from starting.
 */
export function assertProductionAuthConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): void {
  if (environment.NODE_ENV !== "production") return;

  requirePostgresUrl(environment);
  requireSecret(environment, "AUTH_VERIFICATION_PEPPER");
  requireSecret(environment, "SESSION_SECRET");
  requireRefundReviewAccessToken(environment);

  if (environment.AUTH_TRUST_NGINX_PROXY !== "true") {
    throw new ProductionAuthConfigurationError("AUTH_TRUST_NGINX_PROXY_NOT_CONFIGURED");
  }
  if (environment.AUTH_PROXY_LOOPBACK_ONLY !== "true") {
    throw new ProductionAuthConfigurationError("AUTH_PROXY_LOOPBACK_CONTRACT_NOT_CONFIGURED");
  }

  const deploymentEnvironment = requireDeploymentEnvironment(environment);
  try {
    getVideoInternalAccessConfiguration(environment);
  } catch (error) {
    if (error instanceof VideoInternalAccessConfigurationError) {
      throw new ProductionAuthConfigurationError(error.code);
    }
    throw error;
  }

  if (deploymentEnvironment === "staging") {
    try {
      assertStagingRuntimeConfiguration(environment);
      return;
    } catch (error) {
      if (error instanceof StagingRuntimeConfigurationError) {
        throw new ProductionAuthConfigurationError(error.code);
      }
      throw error;
    }
  }

  rejectStagingCapabilities(environment);
  requireHttpsOrigin(environment);
  requireFormalLLM(environment);
  requireFormalTTS(environment);
}
