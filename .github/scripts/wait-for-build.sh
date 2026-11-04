#!/usr/bin/env bash
#
# Verify both halves of the production release:
#   1. the API reports the expected server build;
#   2. the public HTML references the exact JS/CSS bundles built in this checkout,
#      and those assets are actually downloadable.
#
#   wait-for-build.sh <expected-build> <attempts>
set -euo pipefail

EXPECTED="${1:?expected build string required}"
ATTEMPTS="${2:-30}"
BASE_URL="https://voidmafia.one"

# Vite emits content-hashed entry assets. Comparing these names is a reliable
# client-release fingerprint; checking only /api/version can pass while users
# are still being served an older frontend.
EXPECTED_JS=$(grep -oE 'src="/assets/[^"]+\.js"' client/dist/index.html | head -1 | cut -d '"' -f 2)
EXPECTED_CSS=$(grep -oE 'href="/assets/[^"]+\.css"' client/dist/index.html | head -1 | cut -d '"' -f 2)

if [ -z "$EXPECTED_JS" ] || [ -z "$EXPECTED_CSS" ]; then
  echo "::error::Could not find the built client entry JS/CSS in client/dist/index.html"
  exit 1
fi

echo "expecting server build: $EXPECTED"
echo "expecting client JS: $EXPECTED_JS"
echo "expecting client CSS: $EXPECTED_CSS"

for i in $(seq 1 "$ATTEMPTS"); do
  LIVE_BUILD=$(curl -fsS --max-time 10 "$BASE_URL/api/version" 2>/dev/null \
    | grep -oE "2026-[0-9]{2}-[0-9]{2}-v[0-9]+" | head -1 || true)
  LIVE_HTML=$(curl -fsS --max-time 15 "$BASE_URL/" 2>/dev/null || true)

  SERVER_OK=false
  CLIENT_OK=false
  if [ "$LIVE_BUILD" = "$EXPECTED" ]; then SERVER_OK=true; fi
  if [ "$SERVER_OK" = true ] \
    && printf '%s' "$LIVE_HTML" | grep -Fq "$EXPECTED_JS" \
    && printf '%s' "$LIVE_HTML" | grep -Fq "$EXPECTED_CSS" \
    && curl -fsS --max-time 15 "$BASE_URL$EXPECTED_JS" -o /dev/null \
    && curl -fsS --max-time 15 "$BASE_URL$EXPECTED_CSS" -o /dev/null; then
    CLIENT_OK=true
  fi

  echo "  attempt $i/$ATTEMPTS: server=${LIVE_BUILD:-<no answer>} (expected $EXPECTED), client=${CLIENT_OK}"
  if [ "$SERVER_OK" = true ] && [ "$CLIENT_OK" = true ]; then
    echo "✓ live server and client assets match this checkout"
    exit 0
  fi
  sleep 20
done

echo "✗ live deployment does not match this checkout (server=$LIVE_BUILD, client assets missing or stale)"
exit 1
