export const ACCOUNT_DELETION_TASK_KINDS = [
  "revoke_sessions",
  "content_online",
  "cos_provider",
  "backup_retention",
  "financial_archive",
  "audit_receipt",
] as const;

export type AccountDeletionTaskKind = (typeof ACCOUNT_DELETION_TASK_KINDS)[number];

const allScope = ["all"];
const scopesByTask: Record<Exclude<AccountDeletionTaskKind, "revoke_sessions" | "audit_receipt">, readonly string[]> = {
  content_online: ["content_online", "content", "chat", "memories", "media", "photos", "video", ...allScope],
  cos_provider: ["cos_provider", "provider", "media", "photos", "video", ...allScope],
  backup_retention: ["backup_retention", "backup", "content", "media", "photos", "video", ...allScope],
  financial_archive: ["financial_archive", "financial", "refund_dispute", "refund", "chargeback", "payment", ...allScope],
};

const knownScopes = new Set([
  ...allScope,
  ...Object.values(scopesByTask).flat(),
]);

/**
 * A deletion request revokes every Session immediately, even under a legal
 * hold. Other work is held only when its explicit scope covers that task.
 * Unknown scopes fail closed so an ambiguous legal hold cannot silently
 * authorize deletion; a compliance operator must correct it before expiry.
 */
export function legalHoldBlocksTask(kind: AccountDeletionTaskKind, scopes: readonly string[] | null | undefined): boolean {
  if (kind === "revoke_sessions") return false;
  if (!scopes?.length || scopes.some((scope) => !knownScopes.has(scope))) return true;
  if (kind === "audit_receipt") return true;
  return scopes.some((scope) => scopesByTask[kind].includes(scope));
}

function quotedScopes(scopes: readonly string[]): string {
  return `ARRAY[${scopes.map((scope) => `'${scope}'`).join(", ")}]::text[]`;
}

/** A static SQL predicate equivalent to legalHoldBlocksTask for worker claims. */
export function legalHoldClaimPredicate(taskAlias = "t", requestAlias = "r"): string {
  const unknownScope = `EXISTS (SELECT 1 FROM unnest(${requestAlias}.legal_hold_scope) AS hold_scope(value) WHERE hold_scope.value NOT IN (${[...knownScopes].map((scope) => `'${scope}'`).join(", ")}))`;
  const scopedTask = Object.entries(scopesByTask)
    .map(([kind, scopes]) => `(${taskAlias}.kind='${kind}' AND ${requestAlias}.legal_hold_scope && ${quotedScopes(scopes)})`)
    .join(" OR ");
  return `NOT (${requestAlias}.legal_hold AND (${requestAlias}.legal_hold_scope IS NULL OR cardinality(${requestAlias}.legal_hold_scope)=0 OR ${unknownScope} OR ${taskAlias}.kind='audit_receipt' OR ${scopedTask}))`;
}
