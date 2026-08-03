# Immutable artifact release and rollback runbook

Status: **PLANNING ONLY — PRODUCTION_RELEASE_NO_GO**

This is the current release procedure for a future approved maintenance
window. It does not authorize a deployment, database write, PM2 change, Nginx
reload, traffic change, or deletion. It replaces neither the BuildKit evidence
contract nor the retired source-checkout guides.

## Release unit and required records

The release operator must provide all of these immutable, redacted records
before a window is scheduled:

1. The exact 40-character source SHA and the BuildKit-exported artifact
   directory selected for release.
2. `manifest.json`, `sbom.spdx.json`, `provenance.intoto.json`, and
   `SHA256SUMS`, with every checksum verified before the artifact is copied to
   a release slot.
3. The currently serving artifact directory, its checked manifest digest, PM2
   application identity, listener PID/cwd, and the last known healthy probe.
4. A current, consistent production backup and its restore-drill evidence.
5. An Owner-approved maintenance-window record, rollback owner, incident
   contact, and explicit production GO.

Missing, mismatched, or unverified input is a release **NO-GO**. A source
checkout, `git pull`, `npm install`, local rebuild, mutable symlink target, or
artifact without a matching manifest is never a release unit.

## Planned maintenance sequence

1. Perform read-only preflight: record production PM2 identity, active
   listener PID/cwd/script, Nginx upstream target, application SHA, schema
   ledger, disk space, connection/lock state, and worker count. Stop on a
   mismatch; do not repair it in the window.
2. Verify the backup evidence is current and that the candidate artifact is
   byte-for-byte consistent with its manifest, SBOM, provenance, and checksum
   bundle. Copy it into a new immutable release directory; never modify the
   active artifact in place.
3. Validate the candidate runtime contract before it can bind a listener.
   Start it in an isolated release slot without traffic. Its readiness probe
   must prove the new PID and candidate cwd, not an existing listener.
4. Run the approved read-only application smoke against the isolated slot.
   No Provider submission, production money movement, or user-content write is
   implied by this runbook.
5. Only after the approved release record permits it, move traffic through one
   reversible upstream selection. Verify the new listener, HTTPS health,
   static assets, authenticated read, request-ID correlation, and configured
   worker state from the selected artifact.
6. Keep the previous verified artifact intact for rollback. Enable workers in
   their separately approved stages; a worker must not start merely because the
   web artifact is healthy.

## Abort and rollback

Abort before traffic moves if preflight, artifact verification, isolated
readiness, or smoke evidence is missing. Remove only the new isolated process
after confirming it is not the active listener; retain its logs and evidence.

After traffic moves, application rollback means selecting the recorded prior
compatible immutable artifact and verifying its manifest/runtime contract,
listener PID/cwd, health, and static assets. It does **not** rebuild source,
edit either artifact, replay a Provider request, or roll back additive schema.
Database restore or destructive schema rollback requires a separate approved
recovery decision and verified restore evidence.

## Closeout and 72-hour observation

Record the final artifact SHA, manifest digest, PM2/listener identity, traffic
selection, worker state, health evidence, rollback readiness, and any incident
or abort. Observe request failures, authentication, video/review queues,
Provider uncertainty, payment/refund outcomes, deletion backlog, capacity, and
cost alerts for 72 hours. A missing telemetry feed is an explicit observation
gap, not a passing result.

This runbook must be used together with
[`production-candidate-build.md`](./production-candidate-build.md). It remains
planning evidence until an Owner-approved production window produces real
environment evidence.
