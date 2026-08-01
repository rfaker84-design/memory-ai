# Production candidate local build evidence

This document records an unqualified local validation on 2026-08-01. It is not
a Linux build, a container build, an artifact manifest, an SBOM, or a release
approval.

- Host toolchain: Node.js `v24.18.0`, npm `11.16.0`.
- Candidate build contract: Node.js `v20.20.2`, npm `10.8.2`.
- Docker CLI lookup: failed because `docker` is not installed or on `PATH`.
- Direct Docker Registry connection: timed out while connecting to
  `registry-1.docker.io:443`.

Consequently no candidate runtime, `manifest.json`, SPDX SBOM, provenance
statement, or artifact checksum was generated locally. The only approved path
to create those materials is the pinned Linux Docker BuildKit export described
in `production-candidate-build.md`; it must run from a clean committed tree.
