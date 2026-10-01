#!/usr/bin/env bash
#
# Upload this checkout to one Railway service, in a way a skip cannot stall.
#
#   railway-up.sh <service-id> <label>
#
# 1. A fresh line is appended to the railway.toml files in THIS CHECKOUT (the
#    runner's copy, never the repository), so every upload carries a changed
#    config file. Railway's builder v3 has been answering "no changes detected
#    in watch paths, build will skip" for uploads whose code really changed —
#    with the watch paths cleared — and the one upload that got through was the
#    one that changed railway.toml.
# 2. A skip leaves `railway up` waiting on a build that never starts. It is cut
#    off after 15 minutes instead of running into the job's limit, so the
#    verify / upload-again steps still get their turn.
set -uo pipefail

SERVICE="${1:?service id required}"
LABEL="${2:-service}"
STAMP="# deploy ${GITHUB_SHA:-local} run ${GITHUB_RUN_ID:-0}-${GITHUB_RUN_ATTEMPT:-0} at $(date -u +%s%N)"

for f in railway.toml client/railway.toml; do
  [ -f "$f" ] && echo "$STAMP" >> "$f"
done

echo "uploading $LABEL ($STAMP)"
if timeout 900 railway up --service "$SERVICE"; then
  echo "✓ $LABEL upload finished"
else
  echo "::warning::$LABEL upload did not finish in 15 minutes — most likely a Railway skip; the live check decides"
fi
