#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
output=${PRODUCTION_CANDIDATE_EVIDENCE_DIR:-"$root/artifacts/production-candidate"}
source_commit=$(git -C "$root" rev-parse HEAD)
source_tree=$(git -C "$root" rev-parse 'HEAD^{tree}')

test -z "$(git -C "$root" status --porcelain)"

mkdir -p "$output"
exec docker build \
  --pull=false \
  --build-arg "PRODUCTION_CANDIDATE_SOURCE_COMMIT=$source_commit" \
  --build-arg "PRODUCTION_CANDIDATE_SOURCE_TREE=$source_tree" \
  --target production-candidate-evidence-export \
  --output "type=local,dest=$output" \
  "$root"
