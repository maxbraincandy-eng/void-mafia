export function getRTCConfig(): RTCConfiguration {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // ეს არის უფასო საჯარო TURN სერვერი, რომელიც ყველგან მუშაობს
      {
        urls: 'turn:global.relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      }
    ],
    iceTransportPolicy: 'relay',
  };
}
