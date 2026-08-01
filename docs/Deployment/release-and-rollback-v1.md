# Retired source-checkout release and rollback guide

Status: **RETIRED — do not execute**

This historical guide described rebuilding and switching a source checkout on
the server. That is not a permitted release or rollback mechanism.

The approved release unit is one immutable Linux standalone artifact whose
manifest, SBOM, provenance, source commit, and SHA-256 checksums were exported
through the pinned BuildKit path in
[`production-candidate-build.md`](./production-candidate-build.md). PM2 must
run only the manifest launcher from the selected artifact directory.

Application rollback may select the previously verified compatible artifact
after its manifest and runtime contract are checked. It must not rebuild from
source, mutate the artifact in place, or perform destructive database rollback.
Additive schema remains in place unless a separately approved database recovery
plan and restore drill authorize a different action.

No production action is authorized by this document. Production change still
requires the release gate's read-only preflight, backup evidence, maintenance
window, and explicit Owner approval.
