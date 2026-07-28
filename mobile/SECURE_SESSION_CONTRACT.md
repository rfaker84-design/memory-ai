# Mobile Secure Session Contract

## Scope

This is the contract for the Capacitor Android/iOS host talking to a
non-production Next.js API. It does not deploy or change a production domain,
cookie, API credential, payment flow, or native remote `server.url`.

The WebView always starts from `dist` copied into the APK. Capacitor's
`server.hostname` only selects the local WebView origin; it is not a remote
content URL.

## Canonical origins

| Build channel | Packaged App origin | Permitted API origin | Remote `server.url` |
| --- | --- | --- | --- |
| Debug | `https://app.staging.yijianmemory.cn` | `https://api.staging.yijianmemory.cn` | forbidden |
| Release | `https://app.yijianmemory.cn` | none injected | forbidden |

The two Debug hosts are schemefully same-site because they share the
`yijianmemory.cn` registrable domain and HTTPS scheme. The API value is exact:
it cannot be HTTP, an IP/LAN address, another hostname, a port, a path, a
query, or a fragment. Release rejects both `VITE_MOBILE_API_BASE_URL` and the
Debug test-video variable during bundling.

## Session and CORS contract

1. The existing API continues to issue the host-only
   `__Host-memoryai_session` cookie with `Secure`, `HttpOnly`, `SameSite=Lax`
   and `Path=/`; it deliberately has no `Domain` attribute.
2. The mobile client uses `fetch(..., { credentials: "include" })`. It does
   not persist, inspect, or synthesize session state in Web Storage.
3. The API accepts the one configured `AUTH_ALLOWED_ORIGIN` only. For Debug
   validation it must be exactly `https://app.staging.yijianmemory.cn`.
4. API CORS returns that exact Origin, never `*`, together with
   `Access-Control-Allow-Credentials: true`, `Vary: Origin`, and the methods
   and headers required by the existing JSON/idempotency-key calls.
5. A preflight or actual browser request from any other Origin returns a
   fail-closed `403 ORIGIN_NOT_ALLOWED` (or `503 AUTH_UNAVAILABLE` when the
   allowlist is absent/invalid), with no credential CORS headers.

The `SameSite=Lax` attribute is not weakened: sibling HTTPS subdomains are
same-site for cookie policy, while CORS still protects the cross-origin WebView
request. JavaScript cannot read the HttpOnly cookie; Android's WebView cookie
jar naturally returns it to `api.staging.yijianmemory.cn` after verification.

## External staging gate (no production change requested)

Before the device E2E can run, the staging owner must provide these isolated
non-production conditions:

1. DNS that resolves `app.staging.yijianmemory.cn` and
   `api.staging.yijianmemory.cn` from the Android emulator/device.
2. A publicly trusted TLS certificate whose SAN covers both names, TLS 1.2+
   enabled, and an HTTPS reverse proxy that preserves the request Host.
3. Staging API configuration `AUTH_ALLOWED_ORIGIN=https://app.staging.yijianmemory.cn`.
   It must use only non-production SMS, database, media, and provider
   credentials; no production redirect or secret is permitted.
4. The proxy/API must return the exact credential CORS headers for the App
   Origin, including `Content-Type` and `Idempotency-Key` in the allowed
   request headers. `Access-Control-Allow-Origin: *` is not valid here.
5. A fixed non-production SMS code/user and a disposable authenticated test
   account. The API must expose the already-formal login, memory creation, and
   chat routes; no local preview data or synthetic session is acceptable.

## Device acceptance procedure

1. Build with `MOBILE_APP_ORIGIN_HOST=app.staging.yijianmemory.cn` and
   `VITE_MOBILE_API_BASE_URL=https://api.staging.yijianmemory.cn` using
   `npm run android:debug`.
2. Verify login's `POST /api/auth/verify-code` response contains the unchanged
   `Set-Cookie` attributes above. Do not copy the cookie into app storage.
3. Close and reopen the APK, then call `GET /api/auth/session`. The WebView
   cookie jar, not JavaScript, must authenticate the request.
4. Create one memory and send one chat message. Capture API access logs with
   Origin, CORS response headers, and redacted cookie-presence evidence.
5. Re-run with a disallowed Origin and confirm the CORS preflight fails.

Until the DNS/TLS/API gate exists, these are contract tests and a local APK
verification only; they are not a claim of real backend E2E completion.
