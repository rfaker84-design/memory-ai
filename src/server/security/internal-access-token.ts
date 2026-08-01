import { timingSafeEqual } from "node:crypto";

const MAXIMUM_PREVIOUS_TOKEN_OVERLAP_MS = 15 * 60 * 1000;

function exactEquals(expected: string, candidate: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Validates one server-only control token and, for a deliberately short
 * retirement window, one previous value. Invalid rotation configuration is
 * indistinguishable from an unauthorized request.
 */
export function hasValidInternalAccessToken(input: {
  candidate: string | null;
  currentName: string;
  minimumBytes: number;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
}): boolean {
  if (!input.candidate) return false;
  const environment = input.environment ?? process.env;
  const current = environment[input.currentName];
  if (!current || current !== current.trim() || Buffer.byteLength(current, "utf8") < input.minimumBytes) return false;

  const previous = environment[`${input.currentName}_PREVIOUS`];
  const validUntil = environment[`${input.currentName}_PREVIOUS_VALID_UNTIL`];
  if (!previous && !validUntil) return exactEquals(current, input.candidate);
  const now = (input.now ?? new Date()).getTime();
  const expiry = Date.parse(validUntil ?? "");
  if (!previous || !validUntil || previous !== previous.trim()
    || Buffer.byteLength(previous, "utf8") < input.minimumBytes
    || previous === current
    || !Number.isFinite(expiry)
    || expiry <= now
    || expiry - now > MAXIMUM_PREVIOUS_TOKEN_OVERLAP_MS) return false;
  return exactEquals(current, input.candidate) || exactEquals(previous, input.candidate);
}
