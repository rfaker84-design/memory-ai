# Staging Web immutable runner

Status: **versioned execution candidate — Staging Web only**

This runner is the only Web promotion path in this repository. It is distinct
from the Worker helper and never accepts a source checkout, a remote build,
or a Worker archive. It never touches Production, database schema/data,
application APIs, Nginx traffic, chat flow, or PM2 Worker processes.

## Immutable Linux artifact

`.github/workflows/staging-web-immutable-artifact.yml` is a Linux BuildKit-only
workflow. It is either manually dispatched with a full source commit or
triggered on `main` only when `.github/staging-web-artifact-request.json`
changes. The versioned request is schema checked and limited to the Web
component in Staging. The workflow checks out the supplied full source commit
into a clean `source` directory, confirms its exact SHA and tree, and builds
only a downloadable artifact. The workflow has `contents: read` permission and
contains no Staging/Production host credential, SSH, PM2, or promotion step.

The BuildKit recipe pins Node `20.20.2`, npm `10.8.2`, and
`node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293`.
It sets `NEXT_PUBLIC_SOUNDSCAPE_ENABLED=true` before `next build`, executes the
soundscape test suite, and refuses to produce evidence unless the compiled
client chunks contain the soundscape preference key with the public environment
reference removed. The manifest records this feature-flag proof and chunk
hashes, plus the exact versioned runner commit that created the artifact.

The uploaded artifact includes exactly one deployable standalone archive and
its SHA-256 sidecar. The archive contains only:

- `runtime/`, including a release-local manifest launcher and identity manifest;
- `release-manifest.json`, `manifest.json`, `provenance.intoto.json`,
  `sbom.spdx.json`, and `SHA256SUMS`.

`SHA256SUMS` covers every regular archive file except itself. Archive links and
special files are rejected by the executor; the BuildKit recipe dereferences
runtime links before evidence generation. No source directory is delivered.

## Execute input

The installed runner exposes these explicit commands:

```sh
node scripts/ops/staging-web-immutable-promotion.cjs dry-run --input <record.json>
node scripts/ops/staging-web-immutable-promotion.cjs execute --input <record.json>
node scripts/ops/staging-web-immutable-promotion.cjs reconcile --input <record.json>
```

`execute` runs only on Linux and accepts all of the following exact inputs:

- an archive already stored below `<root>/.incoming/.../*.tar.gz`, plus its
  SHA-256;
- SHA-256 values for `release-manifest.json`, `manifest.json`, provenance,
  SBOM, and `SHA256SUMS` in that archive;
- expected candidate source SHA, current SHA, and rollback SHA;
- `component: "web"` and a non-serving candidate loopback port.

It rejects source directories, other archive locations, Worker artifacts,
symlinks/special archive members, incomplete evidence, and artifacts whose
manifest, runtime digest, provenance, SBOM, checksums, or baked feature flag do
not match. A candidate release is retained after every failure; the runner
never deletes `releases/` or `.incoming/`.

## Execute transaction

Under an exclusive `wx` lock, the runner rereads current/rollback and PM2 before
any journal write. State drift stops with no promotion journal record. It then:

1. fsync-appends `prepared` and subsequent JSONL events;
2. validates the actual archive SHA, archive layout, checksums, and evidence;
3. extracts to a retained candidate directory and uses actual archive and
   unpacked bytes for the capacity requirement: at least 8 GiB and the
   existing retained-release budget plus the archive;
4. starts a separate candidate with the release-local PM2 manifest launcher;
5. requires candidate PM2/manifest/checksum status plus `/api/health` and
   `/api/health/database` HTTP 200;
6. changes `current` and `rollback` through individually atomic renames under
   the same exclusive lock, verifies the pair, and restores both selections if
   either rename fails;
7. reloads the serving PM2 process from the new release-local manifest.

On success, `rollback` becomes the previous `current`. If any post-cutover
action or health check fails, the runner restores the old current and rollback,
reloads the old PM2 manifest, verifies it, and preserves the candidate and all
journal evidence. It does not clean files to pass capacity.

## One-time 68 history reconciliation

`reconcile` has a narrower immutable contract. It accepts only the Owner
authorization `STAGING_WEB_RECONCILIATION_AUTHORIZED_2026-08-27` and the exact
lineage `219750eebd5bed2ef5243282be45ac0ca5220035 →
91a844e33d18c2aa1444054b706106dd755c9895 →
68f52a752d88c0370cc8218d6afe105a0d0545ff`.

Before creating anything it requires current `68f52a…`, rollback `91a844…`,
valid installed manifests and `SHA256SUMS` for all three releases, the legacy
journal to state `previous=91a844…` and stale `rollback=219750…`, and an
unchanged online `memoryai-staging` manifest launcher at port 3100. Any drift
stops before an added record.

When every check holds, it copies the old journal text and SHA-256 into exactly
one exclusive new reconciliation record. That record states that the real
previous current/rollback for 68 was `91a844…`, that `219750…` is no longer the
effective rollback, names the one-time `promote-68f52a7.sh` discrepancy and
Owner authorization, and preserves all old journal files. It never changes
`current`, `rollback`, old journal files, releases, or incoming artifacts.
