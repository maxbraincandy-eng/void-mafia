export function getRTCConfig(): RTCConfiguration {
  return {
    iceServers: [
      // STUN სერვერები
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      
      // TURN სერვერები (აუცილებელია მობილური ინტერნეტისთვის)
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:global.relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      }
    ],
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 0,
  };
}
