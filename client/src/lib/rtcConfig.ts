/**
 * Build RTCConfiguration.
 * * გამოიყენება მყარი (Hardcoded) კონფიგურაცია, რათა თავიდან ავიცილოთ
 * გარემოს ცვლადებთან (ENV variables) დაკავშირებული ბილდ-შეცდომები.
 */
export function getRTCConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    // STUN სერვერები NAT-ის აღმოსაჩენად
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    
    // TURN სერვერი მობილური ქსელებისთვის (მაგთი/სილქნეტი/ჯეოსელი)
    {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazurkiglesi'
    }
  ];

  return {
    iceServers,
    // 'all' ნიშნავს, რომ ბრაუზერი სცდის P2P-ს, ხოლო თუ არ გამოვიდა - გადაერთვება TURN-ზე
    iceTransportPolicy: 'all',
    // 0 არის უფრო უსაფრთხო მობილური ქსელებისთვის
    iceCandidatePoolSize: 0,
  } as RTCConfiguration;
}
