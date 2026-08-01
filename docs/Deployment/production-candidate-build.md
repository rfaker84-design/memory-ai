# Production candidate build contract

The only Linux build identity for this candidate is Node.js `20.20.2` with npm
`10.8.2`. `.nvmrc`, `package.json`, and the Dockerfile enforce that identity.
The Docker base is the Docker Official Image index
`node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293`.

Build and export the evidence on a Linux host with Docker BuildKit:

```sh
scripts/ops/export-production-candidate-evidence.sh
```

The repository also provides a manually dispatched GitHub Actions workflow at
`.github/workflows/production-candidate-evidence.yml`. It accepts only an exact
40-character source commit, checks that the checkout resolves to that commit and
is clean, then runs the same Linux BuildKit export and verifies `SHA256SUMS`
before uploading the bundle. It has read-only repository permission and contains
no Staging, production, PM2, Nginx, database, or deployment operation.

The export directory contains an immutable `manifest.json` of every file in
`.next/standalone-rc`, SPDX SBOM (`sbom.spdx.json`), SLSA-compatible provenance
(`provenance.intoto.json`), and `SHA256SUMS` covering all three. The evidence
generator refuses a dirty source tree, a missing standalone runtime, or a Node
or npm version other than the contract. The export script latches the clean git
commit and tree before the Docker build, so the Docker context need not include
`.git`. It never reads environment files.

`Dockerfile` target `runner` remains the application runtime target. The
evidence targets are export-only and do not alter application startup,
migrations, Staging, or production configuration.
