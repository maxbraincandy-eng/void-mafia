/**
 * Client-side initial ICE configuration.
 *
 * This config is used BEFORE the server returns ICE servers via voice:join.
 * The server-provided config (with private Metered TURN credentials) replaces
 * this immediately after voice:join succeeds in useVoiceChat.ts.
 *
 * VITE env vars (set in Railway client service if needed):
 *   VITE_STUN_URL        — override primary STUN (optional)
 *   VITE_TURN_URL        — private TURN URLs, comma-separated (optional)
 *   VITE_TURN_USERNAME   — TURN username (optional)
 *   VITE_TURN_CREDENTIAL — TURN credential (optional)
 *   VITE_FORCE_TURN_RELAY=true — relay-only diagnostic mode
 *
 * NOTE: In production, TURN credentials are delivered by the server via voice:join
 * and applied via setIceConfig().  The VITE_ vars are only a secondary path for
 * cases where the server ICE endpoint is unavailable.
 */

export function getRTCConfig(): RTCConfiguration {
  const stunUrl =
    import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302';

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;
  const forceTurnRelay = import.meta.env.VITE_FORCE_TURN_RELAY === 'true';

  const iceServers: RTCIceServer[] = [
    { urls: [stunUrl, 'stun:stun1.l.google.com:19302'] },
  ];

  // Private TURN from VITE_ env vars (secondary path — server path is primary)
  if (turnUrl && turnUsername && turnCredential) {
    const rawParts = turnUrl.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (rawParts.every((u: string) => u.startsWith('turn:') || u.startsWith('turns:'))) {
      iceServers.push({ urls: rawParts, username: turnUsername, credential: turnCredential });
    } else {
      // Bare hostname → generate 4 Metered variants
      const host = rawParts[0]!;
      iceServers.push({
        urls: [
          `turn:${host}:80`,
          `turn:${host}:80?transport=tcp`,
          `turn:${host}:443?transport=tcp`,
          `turns:${host}:443?transport=tcp`,
        ],
        username: turnUsername,
        credential: turnCredential,
      });
    }
  } else {
    // Public fallback only — unreliable for mobile ↔ WiFi in production.
    // The server's TURN credentials (set via Railway TURN_URL etc.) take priority.
    iceServers.push(
      { urls: 'turn:openrelay.metered.ca:80',              username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  return {
    iceServers,
    iceTransportPolicy: forceTurnRelay ? 'relay' : 'all',
    iceCandidatePoolSize: 10,
  };
}

export function attachRTCLogs(
  pc: RTCPeerConnection,
  label = 'peer'
): void {
  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC:${label}] ICE state:`, pc.iceConnectionState);
  };

  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC:${label}] connection state:`, pc.connectionState);
  };

  pc.onicegatheringstatechange = () => {
    console.log(`[WebRTC:${label}] ICE gathering:`, pc.iceGatheringState);
  };

  pc.onsignalingstatechange = () => {
    console.log(`[WebRTC:${label}] signaling state:`, pc.signalingState);
  };
}
