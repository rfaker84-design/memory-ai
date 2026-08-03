#!/usr/bin/env bash
set -euo pipefail

echo "LEGACY_PRODUCTION_PREFLIGHT_RETIRED: direct production probing is forbidden." >&2
echo "Use the immutable-artifact runbook after R-01 evidence, explicit Owner preflight authorization, and a declared target." >&2
exit 64
