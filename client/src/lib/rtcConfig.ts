/**
 * Build RTCConfiguration.
 *
 * Mobile 4G/5G users are behind CGNAT — direct P2P fails silently:
 * ICE shows "connected" via srflx but media never flows.
 * Solution: always force TURN relay (iceTransportPolicy: 'relay').
 *
 * Custom TURN via Railway env vars:
 *   VITE_TURN_URL, VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
 */
export function getRTCConfig(): RTCConfiguration {
  const turnServers: RTCIceServer[] = [
    // OpenRelay (Metered) — free public TURN
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:80?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // Metered global relay — secondary
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:443',
        'turn:global.relay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  // Custom TURN via Railway env vars — preferred if set
  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    turnServers.unshift({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME ?? '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
    });
  }

  return {
    iceServers: [
      // STUN only for candidate gathering — not used for actual transport
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      ...turnServers,
    ],
    // Force relay — prevents fake "connected" on CGNAT mobile networks
    // where STUN srflx candidates appear connected but never carry audio
    iceTransportPolicy: 'relay',
    iceCandidatePoolSize: 10,
  };
}
