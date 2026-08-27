# Staging Web immutable runner

Status: **CANDIDATE ONLY — DRY-RUN ONLY — NO REMOTE PROMOTION AUTHORITY**

`scripts/ops/staging-web-immutable-promotion.cjs` is a Web-only transaction
state machine. Its CLI exposes `dry-run` only. It deliberately has no SSH,
tar construction, source-checkout startup, direct symlink replacement, PM2
command, or database operation. An Owner-approved installation of the
versioned executor must supply the narrow operation adapter used by the state
machine; the existing Worker promotion helper is prohibited for this purpose.

## Required build and delivery inputs

The only accepted build is the existing `Production candidate evidence` GitHub
Actions workflow, invoked with the exact 40-character candidate source commit.
It produces the Action artifact `production-candidate-<source_sha>` containing
the Linux Node 20.20.2/npm 10.8.2 BuildKit evidence bundle:

- `manifest.json`, whose source commit and runtime digest equal the candidate;
- `sbom.spdx.json` and `provenance.intoto.json`, whose runtime subject equals
  `manifest.json`;
- `SHA256SUMS`, successfully checked before delivery; and
- the associated immutable standalone runtime selected by that manifest.

The authorized Web executor receives that Action artifact as an immutable
evidence bundle, verifies `SHA256SUMS`, and materializes its runtime only at
`/home/ubuntu/memoryai-staging/releases/<candidate_sha>/runtime`. It must not
rebuild it, construct a replacement tarball, start from a remote source tree,
or write through `current` or `rollback`. The artifact transport record must
include the SHA-256 of the delivered bundle and the three evidence-file hashes
used in the dry-run input.

Before materialization, the executor must run the existing Web capacity gate
with the actual candidate artifact and actual unpacked bytes. It blocks unless
free space is at least `max(8 GiB, 2 * candidate_unpacked_bytes + 5 GiB)`.

## Transaction contract

The operation adapter is required to do all of the following under the named
exclusive lock `memoryai-staging-web-immutable-promotion`:

1. Append a `prepared` record to the append-only promotion journal.
2. Verify artifact, manifest, SBOM, provenance, and `SHA256SUMS`; materialize
   the candidate in the SHA-named immutable release directory.
3. Start the isolated candidate using the versioned
   `staging-web-pm2-manifest.config.cjs`. That PM2 file starts only the
   release-local `run-standalone-from-manifest.cjs` and requires the release
   local `standalone-manifest.json`.
4. Verify candidate PM2 cwd, manifest, checksums, zero unstable restarts,
   `/api/health` 200, and `/api/health/database` 200.
5. Atomically replace both symlink selections as one transaction:
   `current -> <candidate>` and `rollback -> <previous current>`, then reload
   the serving PM2 app through the same manifest launcher and repeat the health
   checks.
6. Append `promoted`, or on any post-cutover failure atomically restore
   `current -> <previous current>` and `rollback -> <rollback before>`, reload
   the previous PM2 manifest, prove health, and append `rolled_back`.

Candidate evidence is retained on every failure. The runner never deletes a
release, does not touch Production, database, API behavior, or Worker PM2.

## Dry-run input and test evidence

```sh
node scripts/ops/staging-web-immutable-promotion.cjs dry-run --input <operator-record.json>
```

The record must contain exact candidate/current/rollback SHA release paths,
checksum and manifest attestations, delivered artifact SHA-256, evidence-file
SHA-256 values, actual capacity data, PM2 cwd/status, health attestations, and
the current promotion-journal history. The command writes nothing. A history
disagreement returns `reconciliation_required` with exit status 10; malformed
or missing inputs exit 64.

`scripts/ops/staging-web-immutable-promotion.test.cjs` includes fault injection
for invalid artifact evidence and post-cutover health failure. It proves that
the latter restores the previous current and the pre-existing rollback and that
the CLI performs zero remote writes.

## Observed 68 release-history reconciliation — plan only

Read-only inspection on 2026-08-27 established:

- `current` is `68f52a752d88c0370cc8218d6afe105a0d0545ff` and `rollback` is
  `91a844e33d18c2aa1444054b706106dd755c9895`.
- The 68 journal
  `/home/ubuntu/memoryai-staging/.promotion/68f52a752d88c0370cc8218d6afe105a0d0545ff.json`
  has SHA-256
  `b1bae82689f42a72cae5b9cee579cc6dbec48f08e30e7c6a65c01dc343abce4e`.
  It records `previous=91a844…` but stale `rollback=219750eebd…`.
- The 91 release checksum verification passes; its runtime release-manifest
  SHA-256 is `17434ab109fd40c9ac0739624130428ca82de32775381b03f7c35f49ecbfd972`.
- The 219750 release checksum verification passes; both release-manifest
  copies have SHA-256
  `6465e208de3126015c87d0d70601cb073305c4b1e94f71352b2142b924323ed0`.
  The 91 journal identifies 219750 as 91's earlier rollback. Git confirms
  `219750… -> 91a844… -> 68f52a…` parent ancestry.
- No retained `.incoming` artifact exists for 91 or 219750, so this evidence
  proves their installed release trees and manifests, not original artifact
  delivery hashes.

Therefore the actual 68 rollback must remain **91a844…**. After separate Owner
authorization, the one-time correction may write only:

1. Temporary lock:
   `/home/ubuntu/memoryai-staging/.promotion/locks/staging-web-history-reconciliation.lock`
   (removed when complete).
2. New append-only record:
   `/home/ubuntu/memoryai-staging/.promotion/reconciliations/68f52a752d88c0370cc8218d6afe105a0d0545ff-rollback-reconciliation-v1.json`.

That new record must repeat the observed `current=68f52a…`,
`actualRollback=91a844…`, legacy journal SHA above, stale
`journalRollback=219750eebd…`, the two verified release-manifest hashes, the
Owner authorization identifier, and `decision="retain_actual_rollback"`.
It must not write `current`, `rollback`, any existing journal, release tree, or
incoming artifact. The next dry-run may mark reconciliation verified only after
the new record is read back and its checksum is captured.
