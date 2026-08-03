# Aggregate Operations Alert Contract

`/api/internal/operations/alerts` is a pull-only, aggregate-only endpoint for
the deployment-owned monitoring collector. It does not send webhooks, does not
return users, TA IDs, object keys, payment IDs, or Provider task IDs, and must
never be made browser-accessible.

## Required deployment configuration

- `OPERATIONS_METRICS_ACCESS_TOKEN`: a distinct server-only random value of at
  least 32 UTF-8 bytes. It is supplied only as
  `x-operations-metrics-token`; never place it in a URL, browser bundle, log,
  or dashboard link.
- `OPERATIONS_ALERT_THRESHOLDS_JSON`: the complete exact object documented in
  `.env.example`. Every value is a non-negative integer. A missing key, unknown
  key, fractional value, or malformed JSON returns a 503 rather than silently
  running without an alert threshold.

The collector must poll over a private path, alert when this endpoint returns a
5xx response, and retain only aggregate results plus collection timestamps.
Credential rotation is an environment operation: set a new token in the
collector and application, verify a successful protected pull, then revoke the
old value. Do not place either value in source control.

The candidate includes `scripts/ops/collect-operations-alerts.ts` for that
collector role. It requires the same server-only token plus
`OPERATIONS_ALERTS_URL`, which must be the exact private alerts path with no
query string. It accepts HTTPS, or loopback HTTP only for a same-host collector.
Run it with `npx tsx scripts/ops/collect-operations-alerts.ts` from the release
directory. Its JSON output is aggregate-only; exit `0` means no critical alert,
`2` means at least one critical alert, and `1` means the protected pull or its
configuration failed. A deployment-owned scheduler or monitoring system must
turn those results into an on-call notification. No webhook or notification
target is embedded in the application.

## Alert semantics

`VIDEO_SUBMISSION_UNCERTAIN` and `ACCOUNT_DELETION_FAILED` are critical. A
threshold of zero means "alert when any record exists", not "disable this
alert". `VIDEO_COMMITTED_CREDITS_HIGH` is a warning based on the durable
sum of `actual_credits` on committed Vidu jobs in the last 24 hours. It is
usage monitoring, not a Provider balance: balance, invoices and billing
reconciliation still require the Provider account and its external evidence.
The remaining backlog and latency conditions are warnings. Values are
observed aggregate counts, credits or seconds; they are not queues to mutate and must
not trigger an automated Provider re-submit, user deletion, payment decision,
or worker start.

## Response and incident handling

Successful pulls contain only an observation timestamp and ordered alert
objects (`code`, `severity`, `observed`, `threshold`). The endpoint rejects
query strings, has `Cache-Control: private, no-store`, and returns 401 for an
absent or incorrect token.

On a critical alert, the on-call operator must preserve the aggregate response
and relevant protected server logs, stop unsafe automation through the existing
kill switch where applicable, and investigate via the protected reconciliation
flows. A Vidu `submission_uncertain` result is specifically **not** authority to
submit another Provider request. Incident ownership, external paging delivery,
and production drill approval remain deployment/Owner responsibilities.
