export function getRTCConfig(): RTCConfiguration {
  const stunUrl =
    import.meta.env.VITE_STUN_URL || 'stun:stun.l.google.com:19302';

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [
    { urls: stunUrl },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Your own TURN server from Railway/VPS env
  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push(
      {
        urls: `${turnUrl}?transport=udp`,
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: `${turnUrl}?transport=tcp`,
        username: turnUsername,
        credential: turnCredential,
      }
    );
  }

  // Temporary public TURN fallback for testing only.
  // Do not rely on this for production forever.
  iceServers.push(
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    }
  );

  return {
    iceServers,
    iceTransportPolicy: 'all',
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
}
