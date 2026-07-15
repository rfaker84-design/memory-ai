import { NextResponse } from "next/server";

export const AUTH_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
} as const;

export function applyAuthNoStore<T extends Response>(response: T): T {
  for (const [name, value] of Object.entries(AUTH_NO_STORE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function authJson(body: unknown, init?: ResponseInit): NextResponse {
  return applyAuthNoStore(NextResponse.json(body, init));
}
