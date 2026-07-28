/**
 * Deliberately fail closed until the existing server exposes a session-bound,
 * audited deletion workflow. A native client must never delete a local token
 * and present that as account deletion.
 */
export async function requestAccountDeletion(): Promise<never> {
  throw new Error("ACCOUNT_DELETION_ENDPOINT_NOT_CONFIGURED");
}
