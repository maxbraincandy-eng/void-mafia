# Void Mafia — WebRTC TURN Voice Fix

## Problem

Voice works sometimes on Wi-Fi, but when one player uses mobile internet and another uses Wi-Fi, they often cannot hear each other.

This is a WebRTC NAT/CGNAT issue.

STUN alone is not enough. We need STUN + TURN.

## Goal

Fix WebRTC voice connection by adding proper ICE server configuration with STUN and TURN.

## Requirements

1. Find every place where `RTCPeerConnection` is created.
2. Do not create peer connections with empty/default ICE config.
3. Centralize ICE server config in one helper file.
4. Use environment variables for TURN config.
5. Add STUN fallback.
6. Add TURN UDP and TCP.
7. Log ICE connection state for debugging.
8. Add clean error message if ICE fails.
9. Make Reset Voice button reconnect with fresh peer connections.
10. Do not break:
   - normal voice
   - auto voice join
   - spectators listen-only
   - dead players muted
   - Mafia/Yakuza private radio
   - room voice permissions
   - WebRTC signaling
   - gameplay

## ICE Server Config

Use these env variables:

```env
VITE_STUN_URL=stun:stun.l.google.com:19302
VITE_TURN_URL=turn:turn.voidmafia.one:3478
VITE_TURN_USERNAME=voidmafia
VITE_TURN_CREDENTIAL=CHANGE_THIS_PASSWORD
