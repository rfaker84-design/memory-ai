/**
 * The 49 yuan / 30 day / 100 reply card is quarantined legacy commerce.
 * It is never available in a production runtime. Non-production test access
 * requires both this exact flag and an explicitly listed account identifier.
 */

const ACCOUNT_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;

export function legacyChatCommerceTestAccounts(
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const raw = environment.LEGACY_CHAT_COMMERCE_TEST_ACCOUNTS;
  if (!raw || raw !== raw.trim()) return [];
  const accounts = raw.split(",");
  if (
    accounts.length === 0
    || accounts.some((account) => !ACCOUNT_PATTERN.test(account))
  ) {
    return [];
  }
  return [...new Set(accounts)];
}

export function isLegacyChatCommerceTestEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.NODE_ENV !== "production"
    && environment.LEGACY_CHAT_COMMERCE_TEST_MODE === "true"
    && legacyChatCommerceTestAccounts(environment).length > 0;
}

export function isLegacyChatCommerceTestAccount(
  externalUserId: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return isLegacyChatCommerceTestEnvironment(environment)
    && legacyChatCommerceTestAccounts(environment).includes(externalUserId);
}
