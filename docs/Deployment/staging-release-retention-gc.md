# Staging immutable release retention GC

This is the only automatic release-retention mechanism for Staging. It is an
operator-side release tool: it runs from the sealed, clean source checkout and
uses SSH only to inspect or, during an approved Staging promotion, remove an
eligible directory beneath `/home/ubuntu/memoryai-staging/releases/`.

It never writes or removes `.incoming`, `artifacts`, `run`, `logs`, `shared`,
`backups`, `operations`, `.promotion`, media storage, database storage, or any
Production path. It does not modify PM2, Nginx, systemd, the application,
traffic, or a release that is already serving.

## Rules

- The default command is `dry-run`; it writes a JSON audit file but removes
  nothing.
- It is idle at or above 10 GiB free.
- Below 10 GiB, it evaluates only full-SHA directories under the exact
  Staging `releases/` root and selects the smallest safe set that restores at
  least 12 GiB.
- The block estimate is based on `device + inode + nlink + st_blocks`. A block
  counts only when every hard link is inside the exact selected set.
- Every relevant mount is indexed once per audit with a NUL-delimited inode
  scan. The index checks each `(device,inode,nlink)` against every discovered
  link location; malformed, truncated, timed-out, or externally linked entries
  fail closed. `apply` obtains its own GC lock, then repeats the full index and
  requires the current/rollback, PM2 references, lock state, and inode-index
  digest to match the approved dry-run before any release directory is removed.
- A candidate must have a verified checksum bundle and `release-manifest.json`
  that binds its immutable package to the exact Git commit. A clean source
  checkout is required to build that manifest.
- The v1 immutable Web event journal is parsed as a transaction state machine,
  not searched for SHA text. Its complete-file SHA-256 is captured as the
  legacy integrity anchor; unknown schemas, malformed rows, unexpected hash
  fields, invalid state transitions, or unfinished transactions stop GC.
  Historical `promoted`, `failed`, `rolled_back`, and `reconciled` records are
  retained as evidence but do not pin their old releases. Only an active
  transaction, an active promotion lock, or an explicit non-expired retention
  pin protects a release through the journal layer.
- A dead pre-runner rollback-lock record is never edited or removed. During an
  approved `apply`, the runner first writes one exclusive, fsynced retention
  reconciliation record that binds the legacy lock SHA-256, journal SHA-256,
  and observed current/rollback. A live PID, malformed lock, or changed
  evidence stops before deletion.
- Current, rollback, all PM2 references (including the Worker), systemd and
  Nginx references, promotion-journal references, locks, open file descriptors,
  mountpoints, external symlinks, external hard links, secrets, and persistent
  data markers all make a candidate ineligible. A failed or incomplete check
  blocks deletion.

## Formal Staging promotion sequence

The release executor runs these steps in order. `apply` is intentionally not
an npm convenience command: it requires both the formal pipeline id and the
`STAGING_IMMUTABLE_PROMOTION=1` execution contract.

```bash
# 1. Read-only retention evidence. This is always safe.
npm run staging:release-gc -- \
  --ssh-target memoryai-prod \
  --remote-root /home/ubuntu/memoryai-staging \
  --release-sha <candidate-source-sha> \
  --audit-output <approved-local-audit.json>

# 2. Only the approved immutable Staging promotion runner may use apply.
#    It remains a no-op while space is at or above 10 GiB.
STAGING_IMMUTABLE_PROMOTION=1 node scripts/ops/staging-release-retention-gc.cjs apply \
  --pipeline-id staging-immutable-promotion \
  --ssh-target memoryai-prod \
  --remote-root /home/ubuntu/memoryai-staging \
  --release-sha <candidate-source-sha> \
  --audit-output <approved-local-audit.json>

# 3. The original hard capacity gate still decides whether upload/unpack may begin.
npm run preflight:staging-web-capacity -- \
  --ssh-target memoryai-prod \
  --remote-root /home/ubuntu/memoryai-staging \
  --rollback-sha <verified-rollback-sha> \
  --candidate-artifact <exact-artifact.tar.gz> \
  --candidate-unpacked <exact-unpacked-release-directory> \
  --retention-gc-audit <approved-local-audit.json>

# 4. Promote only after the normal immutable checks succeed, then record a
#    read-only retention audit again.
npm run staging:release-gc -- \
  --ssh-target memoryai-prod \
  --remote-root /home/ubuntu/memoryai-staging \
  --audit-output <post-promotion-local-audit.json>
```

The `--retention-gc-audit` capacity-gate hook is dry-run unless the formal
executor additionally supplies `--retention-gc-apply` and its execution
contract. This keeps standalone capacity checks and local development unable
to delete a release by accident.
