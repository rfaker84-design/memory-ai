# Capacity Baseline Runbook

This runbook prepares the required capacity, concurrency, upload, generation
latency, and cost baseline without treating source checks as live evidence.
It does not authorize a Staging run and never authorizes production traffic.

## Safety boundary

Every future runner must parse its input with
`scripts/ops/capacity-baseline-contract.ts` before opening a connection. The
plan is rejected unless all of the following are true:

- target is an isolated endpoint, or a separately approved Staging endpoint;
- production hostnames are always rejected;
- all identities, images, and messages are synthetic;
- `providerSubmit` is exactly `false`;
- a Staging plan includes its distinct approved change identifier;
- requests, concurrency, and image byte size are bounded.

`npm run run:capacity-baseline -- '<plan-json>'` is deliberately stricter than
the generic plan contract: it accepts only an isolated loopback target and
reads only `GET /api/health`. It refuses every Staging plan, even one with an
approval ID. Its aggregate-only output is suitable for a local readiness and
concurrency baseline. The local regression mounts the actual health handler on
an ephemeral loopback socket; it is not an upload, generation-latency, cost,
Staging, or production run.

A capacity baseline must not start a video worker, call Vidu, consume credits,
or reuse any customer account, TA, media object, session, or job. A real
first-presence Provider run remains governed by its separate product gate.

## Required recorded measurements

For each approved non-production run, preserve a redacted manifest containing:

- candidate SHA, target environment, operator, approved change identifier,
  start/end timestamps, workload size, and synthetic-input SHA;
- request totals by status, timeout count, P50/P95/P99 latency, and maximum
  concurrent in-flight requests;
- media upload byte size, accepted/rejected counts, and zero residual objects
  for intentionally oversized fixtures;
- video queue, quality-review, and `submission_uncertain` aggregates, with
  Provider submit count fixed at zero;
- database connection peak and post-run connection-zero check;
- measured cost inputs and the proposed free-chat daily limit calculation.

Do not record phone numbers, cookies, sessions, user/TA IDs, object keys,
Provider task IDs, request bodies, or secrets.

## Stop conditions

Stop immediately if a plan parser rejection occurs, an unexpected target is
resolved, a real identity is detected, a Provider submit counter is nonzero,
credits change, a 5xx/error budget is exceeded, a database connection leaks,
or a request may have modified a non-synthetic record. Preserve the redacted
facts, stop the runner, and use the protected reconciliation paths only; never
retry an uncertain Provider request.

## Evidence boundary

An isolated run demonstrates only its recorded isolated target. A Staging run
requires separate authorization and proves only that named release. Neither is
production evidence. Production capacity, budgets, deployment, migration, or
traffic changes remain `PRODUCTION_RELEASE_NO_GO` until explicitly approved.
