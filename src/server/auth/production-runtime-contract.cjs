const MINIMUM_VIDEO_TOKEN_BYTES = 48;

function failure(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function required(environment, name) {
  const raw = environment[name];
  const value = raw && raw.trim();
  if (!value || raw !== value) throw failure(`${name}_NOT_CONFIGURED`);
  return value;
}

function requiredSecret(environment, name, minimumBytes) {
  const value = required(environment, name);
  if (Buffer.byteLength(value, "utf8") < minimumBytes) throw failure(`${name}_NOT_CONFIGURED`);
  return value;
}

function requirePostgresUrl(environment) {
  const value = required(environment, "DATABASE_URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("invalid protocol");
  } catch {
    throw failure("DATABASE_URL_INVALID");
  }
}

function requireHttpsOrigin(environment) {
  const value = required(environment, "AUTH_ALLOWED_ORIGIN");
  try {
    const origin = new URL(value);
    if (origin.protocol !== "https:" || origin.origin !== value.replace(/\/$/, "") || origin.username || origin.password) {
      throw new Error("invalid origin");
    }
  } catch {
    throw failure("AUTH_ALLOWED_ORIGIN_INVALID");
  }
}

function requireExact(environment, name, expected, code = `${name}_INVALID`) {
  if (required(environment, name) !== expected) throw failure(code);
}

function requireEnabled(environment, name, code) {
  if (environment[name] !== "true") throw failure(code);
}

function requireConfiguredExact(environment, name, expected, code) {
  if (environment[name] !== expected) throw failure(code);
}

function requireSessionRotationContract(environment) {
  const maximumOverlapMilliseconds = (7 * 24 * 60 * 60 + 30) * 1000;
  const currentId = environment.SESSION_SECRET_KID && environment.SESSION_SECRET_KID.trim() || "current";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(currentId)) throw failure("SESSION_SECRET_KID_INVALID");
  const previous = environment.SESSION_SECRET_PREVIOUS;
  const previousId = environment.SESSION_SECRET_PREVIOUS_KID;
  const validUntil = environment.SESSION_SECRET_PREVIOUS_VALID_UNTIL;
  if (!previous && !previousId && !validUntil) return;
  if (!previous || !previousId || !validUntil
    || previous !== previous.trim()
    || Buffer.byteLength(previous, "utf8") < 32
    || !/^[A-Za-z0-9_-]{1,32}$/.test(previousId)
    || previousId === currentId
    || previous === environment.SESSION_SECRET
    || !Number.isFinite(Date.parse(validUntil))
    || Date.parse(validUntil) <= Date.now()
    || Date.parse(validUntil) - Date.now() > maximumOverlapMilliseconds) {
    throw failure("SESSION_SECRET_PREVIOUS_CONFIGURATION_INVALID");
  }
}

function requireVerificationPepperRotationContract(environment) {
  const currentId = environment.AUTH_VERIFICATION_PEPPER_KID && environment.AUTH_VERIFICATION_PEPPER_KID.trim() || "current";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(currentId)) throw failure("AUTH_VERIFICATION_PEPPER_KID_INVALID");
  const previous = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS;
  const previousId = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_KID;
  const validUntil = environment.AUTH_VERIFICATION_PEPPER_PREVIOUS_VALID_UNTIL;
  if (!previous && !previousId && !validUntil) return;
  const expiry = Date.parse(validUntil || "");
  const overlap = expiry - Date.now();
  if (!previous || !previousId || !validUntil
    || previous !== previous.trim()
    || Buffer.byteLength(previous, "utf8") < 32
    || previous === environment.AUTH_VERIFICATION_PEPPER
    || !/^[A-Za-z0-9_-]{1,32}$/.test(previousId)
    || previousId === currentId
    || !Number.isFinite(expiry)
    || overlap < (7 * 24 * 60 * 60 + 30) * 1000
    || overlap > 180 * 24 * 60 * 60 * 1000) {
    throw failure("AUTH_VERIFICATION_PEPPER_PREVIOUS_CONFIGURATION_INVALID");
  }
}

function requireInternalControlTokenRotation(environment, name) {
  const current = requiredSecret(environment, name, MINIMUM_VIDEO_TOKEN_BYTES);
  const previous = environment[`${name}_PREVIOUS`];
  const validUntil = environment[`${name}_PREVIOUS_VALID_UNTIL`];
  if (!previous && !validUntil) return;
  const expiry = Date.parse(validUntil || "");
  if (!previous || !validUntil
    || previous !== previous.trim()
    || Buffer.byteLength(previous, "utf8") < MINIMUM_VIDEO_TOKEN_BYTES
    || previous === current
    || !Number.isFinite(expiry)
    || expiry <= Date.now()
    || expiry - Date.now() > 15 * 60 * 1000) {
    throw failure(`${name}_PREVIOUS_CONFIGURATION_INVALID`);
  }
}

function requireVideoInternalAccess(environment) {
  requireExact(environment, "YIJIAN_VIDEO_REVIEW_INTERNAL_ENABLED", "true");
  requireExact(environment, "YIJIAN_VIDEO_RECONCILIATION_INTERNAL_ENABLED", "true");
  const review = requiredSecret(environment, "VIDEO_REVIEW_ACCESS_TOKEN", MINIMUM_VIDEO_TOKEN_BYTES);
  const reconciliation = requiredSecret(environment, "VIDEO_RECONCILIATION_ACCESS_TOKEN", MINIMUM_VIDEO_TOKEN_BYTES);
  if (new Set(review).size < 16 || new Set(reconciliation).size < 16) {
    throw failure("VIDEO_REVIEW_ACCESS_TOKEN_NOT_CONFIGURED");
  }
  if (review === reconciliation) throw failure("VIDEO_INTERNAL_ACCESS_TOKENS_NOT_DISTINCT");
  required(environment, "YIJIAN_VIDEO_REVIEW_ACCOUNT");
  required(environment, "YIJIAN_VIDEO_RECONCILIATION_ACCOUNT");
}

function requireReportReviewAccess(environment) {
  requireExact(environment, "YIJIAN_REPORT_REVIEW_INTERNAL_ENABLED", "true");
  requireInternalControlTokenRotation(environment, "REPORT_REVIEW_ACCESS_TOKEN");
  required(environment, "REPORT_REVIEW_ACCOUNT");
}

function requireStagingContract(environment) {
  requireExact(environment, "AUTH_ALLOWED_ORIGIN", "https://app.staging.yijianmemory.cn");
  requireExact(environment, "STAGING_DATABASE_ISOLATION", "isolated");
  requireExact(environment, "STAGING_DATA_SOURCE", "empty");
  requireExact(environment, "LLM_PROVIDER", "mock");
  requireExact(environment, "TTS_PROVIDER", "mock");
  if (!/^\d{6}$/.test(required(environment, "STAGING_FIXED_SMS_CODE"))) {
    throw failure("STAGING_FIXED_SMS_CODE_INVALID");
  }
  const databaseName = required(environment, "STAGING_DATABASE_NAME");
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(databaseName) || !databaseName.toLowerCase().includes("staging")) {
    throw failure("STAGING_DATABASE_NAME_INVALID");
  }
  const databaseUrl = required(environment, "DATABASE_URL");
  try {
    const parsed = new URL(databaseUrl);
    if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || decodeURIComponent(parsed.pathname.slice(1)) !== databaseName) {
      throw new Error("invalid database");
    }
  } catch {
    throw failure("STAGING_DATABASE_URL_INVALID");
  }
  const phones = required(environment, "STAGING_FIXED_SMS_PHONES").split(",");
  if (phones.length !== 2 || new Set(phones).size !== 2 || phones.some((phone) => !/^\+861[3-9]\d{9}$/.test(phone))) {
    throw failure("STAGING_FIXED_SMS_PHONES_INVALID");
  }
  if (!required(environment, "STAGING_MEDIA_ROOT").includes("staging")) {
    throw failure("STAGING_MEDIA_ROOT_INVALID");
  }
  requiredSecret(environment, "STAGING_ACCESS_TOKEN", 48);
  requiredSecret(environment, "STAGING_MEDIA_SIGNING_SECRET", 32);
  const previousMediaSecret = environment.STAGING_MEDIA_SIGNING_SECRET_PREVIOUS;
  const previousMediaValidUntil = environment.STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_VALID_UNTIL;
  if (previousMediaSecret || previousMediaValidUntil) {
    const expiry = Date.parse(previousMediaValidUntil || "");
    if (!previousMediaSecret || !previousMediaValidUntil
      || previousMediaSecret !== previousMediaSecret.trim()
      || Buffer.byteLength(previousMediaSecret, "utf8") < 32
      || previousMediaSecret === environment.STAGING_MEDIA_SIGNING_SECRET
      || !Number.isFinite(expiry)
      || expiry <= Date.now()
      || expiry - Date.now() > 900_000) {
      throw failure("STAGING_MEDIA_SIGNING_SECRET_PREVIOUS_INVALID");
    }
  }
}

function assertProductionRuntimeContract(environment = process.env) {
  if (environment.NODE_ENV !== "production") return;

  requirePostgresUrl(environment);
  requiredSecret(environment, "AUTH_VERIFICATION_PEPPER", 32);
  requireVerificationPepperRotationContract(environment);
  requiredSecret(environment, "SESSION_SECRET", 32);
  requireSessionRotationContract(environment);
  requireInternalControlTokenRotation(environment, "REFUND_REVIEW_ACCESS_TOKEN");
  requireEnabled(environment, "AUTH_TRUST_NGINX_PROXY", "AUTH_TRUST_NGINX_PROXY_NOT_CONFIGURED");
  requireEnabled(environment, "AUTH_PROXY_LOOPBACK_ONLY", "AUTH_PROXY_LOOPBACK_CONTRACT_NOT_CONFIGURED");
  requireReportReviewAccess(environment);
  requireVideoInternalAccess(environment);

  const deployment = environment.DEPLOYMENT_ENV && environment.DEPLOYMENT_ENV.trim();
  if (deployment !== "production" && deployment !== "staging") throw failure("DEPLOYMENT_ENV_INVALID");
  if (environment.ACCOUNT_DELETION_ENABLED === "true" || environment.ACCOUNT_DATA_EXPORT_ENABLED === "true") {
    requireExact(environment, "AUTH_SESSION_REVOCATION_ENFORCED", "true", "AUTH_SESSION_REVOCATION_NOT_ENFORCED");
  }
  if (deployment === "staging") return requireStagingContract(environment);

  if (Object.keys(environment).some((name) => name.startsWith("STAGING_") && environment[name] && environment[name].trim())) {
    throw failure("STAGING_CAPABILITY_FORBIDDEN");
  }
  if (environment.STORAGE_PROVIDER && environment.STORAGE_PROVIDER.trim() === "local"
    || environment.MEDIA_STORAGE_PROVIDER && environment.MEDIA_STORAGE_PROVIDER.trim() === "local"
    || environment.VIDEO_ARTIFACT_STORAGE_PROVIDER && environment.VIDEO_ARTIFACT_STORAGE_PROVIDER.trim() === "local-staging") {
    throw failure("STAGING_CAPABILITY_FORBIDDEN");
  }
  requireHttpsOrigin(environment);
  requireConfiguredExact(environment, "LLM_PROVIDER", "deepseek", "DEEPSEEK_PROVIDER_REQUIRED");
  required(environment, "DEEPSEEK_API_KEY");
  required(environment, "DEEPSEEK_MODEL");
  requireConfiguredExact(environment, "TTS_PROVIDER", "tencent", "TENCENT_TTS_PROVIDER_REQUIRED");
  const mediaProvider = environment.MEDIA_STORAGE_PROVIDER && environment.MEDIA_STORAGE_PROVIDER.trim() || "cos";
  if (mediaProvider !== "cos") throw failure("MEDIA_STORAGE_PROVIDER_INVALID");
  for (const name of ["TENCENT_SECRET_ID", "TENCENT_SECRET_KEY", "COS_MEDIA_BUCKET", "COS_MEDIA_REGION"]) required(environment, name);
}

module.exports = { assertProductionRuntimeContract };
