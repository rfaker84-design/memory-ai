/**
 * Deliberately fail closed until the existing server exposes an authenticated
 * device-token registration endpoint. Permission prompts and native token
 * acquisition must not imply that a token has been registered server-side.
 */
export async function registerPushToken(): Promise<never> {
  throw new Error("PUSH_REGISTRATION_ENDPOINT_NOT_CONFIGURED");
}
