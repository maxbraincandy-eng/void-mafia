#!/usr/bin/env bash
#
# Wait until the running server reports the build we just pushed.
#
# Extracted from the workflow because it is now run twice — once to find out
# whether a redeploy is needed, and once to decide whether the job passes — and
# a polling loop pasted into two steps is two places for the timeout to drift.
#
#   wait-for-build.sh <expected-build> <attempts>
set -euo pipefail

EXPECTED="${1:?expected build string required}"
ATTEMPTS="${2:-30}"

echo "expecting build: $EXPECTED"
for i in $(seq 1 "$ATTEMPTS"); do
  LIVE=$(curl -s --max-time 10 https://voidmafia.one/api/version \
    | grep -oE "2026-[0-9]{2}-[0-9]{2}-v[0-9]+" || true)
  echo "  attempt $i/$ATTEMPTS: live=${LIVE:-<no answer>}"
  if [ "$LIVE" = "$EXPECTED" ]; then
    echo "✓ live build matches"
    exit 0
  fi
  sleep 20
done

echo "✗ live build never became $EXPECTED"
exit 1
