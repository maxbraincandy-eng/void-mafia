/**
 * Build RTCConfiguration from environment variables.
 *
 * Required for basic connectivity: STUN (works for most networks).
 * For reliable production use behind strict NAT/firewalls, add TURN:
 *
 *   VITE_TURN_URL=turn:your-turn-server.com:3478
 *   VITE_TURN_USERNAME=your-username
 *   VITE_TURN_CREDENTIAL=your-credential
 */
export function getRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: import.meta.env.VITE_STUN_URL ?? 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME ?? '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
    });
  }

  return { iceServers };
}
