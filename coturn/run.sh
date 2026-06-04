#!/bin/sh
set -e

# Railway injects $PORT — the internal port the TCP proxy forwards to.
PORT="${PORT:-3478}"

# External IP: what clients see (the Railway TCP proxy's outbound IP).
# If TURN_EXTERNAL_IP is set explicitly, use it; otherwise detect it.
if [ -n "$TURN_EXTERNAL_IP" ]; then
  EXTERNAL_IP="$TURN_EXTERNAL_IP"
else
  EXTERNAL_IP="$(curl -s --max-time 10 https://api.ipify.org 2>/dev/null)"
fi

# Internal IP: container's private address
INTERNAL_IP="$(hostname -i | awk '{print $1}')"

echo "[coturn] port=${PORT}  external=${EXTERNAL_IP}  internal=${INTERNAL_IP}"

exec turnserver \
  --no-udp \
  --tcp \
  --listening-port="${PORT}" \
  --listening-ip="0.0.0.0" \
  --external-ip="${EXTERNAL_IP}/${INTERNAL_IP}" \
  --relay-ip="${INTERNAL_IP}" \
  --user="${TURN_USERNAME}:${TURN_CREDENTIAL}" \
  --realm="void-mafia" \
  --log-file=stdout \
  --no-stdout-log \
  --no-cli \
  --min-port=49152 \
  --max-port=65535 \
  --no-multicast-peers
