export type AccountDeletionRetentionPolicy = {
  contentDays: number;
  providerDays: number;
  backupDays: number;
};

const DEFAULT_POLICY: AccountDeletionRetentionPolicy = { contentDays: 7, providerDays: 30, backupDays: 90 };

type Environment = Readonly<Record<string, string | undefined>>;

function boundedDays(environment: Environment, name: string, fallback: number, maximum: number): number {
  const raw = environment[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`ACCOUNT_DELETION_POLICY_INVALID_${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`ACCOUNT_DELETION_POLICY_INVALID_${name}`);
  return value;
}

/**
 * Configuration may shorten a retention deadline but never extend the agreed
 * 7/30/90-day maxima. Financial and legal-hold retention are deliberately not
 * part of this customer-content policy.
 */
export function accountDeletionRetentionPolicy(environment: Environment = process.env): AccountDeletionRetentionPolicy {
  const policy = {
    contentDays: boundedDays(environment, "ACCOUNT_DELETION_CONTENT_RETENTION_DAYS", DEFAULT_POLICY.contentDays, DEFAULT_POLICY.contentDays),
    providerDays: boundedDays(environment, "ACCOUNT_DELETION_PROVIDER_RETENTION_DAYS", DEFAULT_POLICY.providerDays, DEFAULT_POLICY.providerDays),
    backupDays: boundedDays(environment, "ACCOUNT_DELETION_BACKUP_RETENTION_DAYS", DEFAULT_POLICY.backupDays, DEFAULT_POLICY.backupDays),
  };
  if (policy.providerDays < policy.contentDays || policy.backupDays < policy.providerDays) throw new Error("ACCOUNT_DELETION_POLICY_ORDER_INVALID");
  return policy;
}
