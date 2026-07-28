# Sprint22 staging runtime contract

This contract is for an isolated, production-built staging runtime only. It is
not a production deployment instruction and it does not authorize copying,
connecting to, or restoring production data.

## Required process and domain boundary

Run a completed Next production build with these exact identities:

```text
NODE_ENV=production
DEPLOYMENT_ENV=staging
AUTH_ALLOWED_ORIGIN=https://app.staging.yijianmemory.cn
```

The corresponding API origin is `https://api.staging.yijianmemory.cn`. TLS must
be trusted by Android and CORS must return the exact App Origin, credentials,
and `X-MemoryAI-Staging-Access`; wildcard CORS is forbidden.

## Required isolated data boundary

```text
DATABASE_URL=postgresql://<staging-user>:<secret>@<staging-host>:5432/memoryai_staging
STAGING_DATABASE_ISOLATION=isolated
STAGING_DATABASE_NAME=memoryai_staging
STAGING_DATA_SOURCE=empty
STAGING_MEDIA_ROOT=/var/lib/memoryai-staging/media
```

The database name must match `STAGING_DATABASE_NAME`, include `staging`, and be
separately provisioned. `STAGING_DATA_SOURCE=empty` is an explicit operator
attestation: no production dump, replica, credentials, storage bucket, or data
copy may be used. The media root must be an isolated absolute path containing
`staging`; its files are never written to Tencent COS.

## Required isolated test capabilities

```text
LLM_PROVIDER=mock
TTS_PROVIDER=mock
STAGING_ACCESS_TOKEN=<48-plus-byte-rotating-secret>
STAGING_MEDIA_SIGNING_SECRET=<32-plus-byte-secret>
STAGING_FIXED_SMS_CODE=<six-digits>
STAGING_FIXED_SMS_PHONES=+8613800013800,+8613900013900
```

The two phone numbers are the whole fixed-SMS allowlist. The server stores only
the HMAC challenge digest and never returns the fixed code. The Debug APK takes
the rotating `STAGING_ACCESS_TOKEN` at build time and sends it as
`X-MemoryAI-Staging-Access`; Release rejects the value and scans for its marker.

The remaining existing server-side auth/proxy secrets remain mandatory:
`AUTH_VERIFICATION_PEPPER`, `SESSION_SECRET`, `REFUND_REVIEW_ACCESS_TOKEN`,
`AUTH_TRUST_NGINX_PROXY=true`, and `AUTH_PROXY_LOOPBACK_ONLY=true`.

## Pre-start and startup

From a workspace with all secrets injected by a staging secret manager:

```powershell
npm run build
npm run verify:staging-runtime
npm run start:staging
```

`start:staging` uses `next start`, never `next dev`. Next instrumentation repeats
the same contract at runtime before serving requests. Any missing, production-
shaped, or staging-only-on-production variable fails closed.

No values from this document are real credentials. Do not commit a `.env` file.
