export const MEMORY_CREATION_IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9._:-]{16,128}$/;

export function isMemoryCreationIdempotencyKey(value: string): boolean {
  return MEMORY_CREATION_IDEMPOTENCY_KEY_PATTERN.test(value);
}
