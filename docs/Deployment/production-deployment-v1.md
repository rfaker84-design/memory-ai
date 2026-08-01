# Retired production source-checkout deployment guide

Status: **RETIRED — do not execute**

This historical document previously described deploying from a production
source checkout. It is incompatible with the current immutable,
manifest-directed runtime and must not be used for Staging or production.

The only candidate build and evidence path is
[`production-candidate-build.md`](./production-candidate-build.md). It creates
a pinned Linux Docker BuildKit artifact with a runtime manifest, SBOM,
provenance statement, and checksums. A source checkout, a locally rebuilt
runtime, or a PM2 process that does not point to that exact artifact cannot be
called a release candidate.

No production deployment, migration, PM2 change, Nginx change, traffic change,
or rollback is authorized by this document. Those actions require the separate
release gate, current read-only preflight, verified backup, and explicit Owner
approval.
