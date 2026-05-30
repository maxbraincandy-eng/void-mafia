import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface VoicePeer {
  name: string;
}

export function useVoiceChat() {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [peers, setPeers] = useState<Map<string, VoicePeer>>(new Map());
  const [isConnecting, setIsConnecting] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const getOrCreatePc = useCallback((socketId: string): RTCPeerConnection => {
    if (pcsRef.current.has(socketId)) return pcsRef.current.get(socketId)!;

    const pc = new RTCPeerConnection(ICE_SERVERS);

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      let audio = audiosRef.current.get(socketId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audiosRef.current.set(socketId, audio);
      }
      audio.srcObject = remoteStream;
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        (socket as any).emit('webrtc:ice', { to: socketId, candidate: event.candidate.toJSON() });
      }
    };

    pcsRef.current.set(socketId, pc);
    return pc;
  }, []);

  const closePeer = useCallback((socketId: string) => {
    const pc = pcsRef.current.get(socketId);
    if (pc) { try { pc.close(); } catch {} pcsRef.current.delete(socketId); }
    const audio = audiosRef.current.get(socketId);
    if (audio) { audio.srcObject = null; audiosRef.current.delete(socketId); }
    setPeers(p => { const n = new Map(p); n.delete(socketId); return n; });
  }, []);

  const joinVoice = useCallback(async () => {
    if (isInVoice || isConnecting) return;
    setIsConnecting(true);
    setMicError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setMicError('Microphone access denied. Enable it in browser settings.');
      setIsConnecting(false);
      return;
    }

    localStreamRef.current = stream;

    (socket as any).emit('webrtc:join_voice', async (res: any) => {
      if (!res.ok) {
        stream.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setIsConnecting(false);
        return;
      }

      setIsInVoice(true);
      setIsConnecting(false);

      const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;
      const peerMap = new Map<string, VoicePeer>();
      for (const p of existingPeers) peerMap.set(p.socketId, { name: p.name });
      setPeers(peerMap);

      // Send offer to each existing peer
      for (const { socketId } of existingPeers) {
        const pc = getOrCreatePc(socketId);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          (socket as any).emit('webrtc:offer', { to: socketId, sdp: offer }, () => {});
        } catch {}
      }
    });
  }, [isInVoice, isConnecting, getOrCreatePc]);

  const leaveVoice = useCallback(() => {
    (socket as any).emit('webrtc:leave_voice');
    for (const sid of pcsRef.current.keys()) closePeer(sid);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setIsInVoice(false);
    setIsMuted(false);
    setPeers(new Map());
  }, [closePeer]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !isMuted;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setIsMuted(nextMuted);
  }, [isMuted]);

  useEffect(() => {
    const onPeerJoined = ({ socketId, name }: { socketId: string; name: string }) => {
      setPeers(p => new Map(p).set(socketId, { name }));
      // The new peer will initiate the offer to us
    };

    const onPeerLeft = ({ socketId }: { socketId: string }) => {
      closePeer(socketId);
    };

    const onOffer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      if (!localStreamRef.current) return;
      const pc = getOrCreatePc(from);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        (socket as any).emit('webrtc:answer', { to: from, sdp: answer }, () => {});
      } catch {}
    };

    const onAnswer = async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try { await pc.setRemoteDescription(new RTCSessionDescription(sdp)); } catch {}
    };

    const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    };

    (socket as any).on('webrtc:peer_joined', onPeerJoined);
    (socket as any).on('webrtc:peer_left', onPeerLeft);
    (socket as any).on('webrtc:offer', onOffer);
    (socket as any).on('webrtc:answer', onAnswer);
    (socket as any).on('webrtc:ice', onIce);

    return () => {
      (socket as any).off('webrtc:peer_joined', onPeerJoined);
      (socket as any).off('webrtc:peer_left', onPeerLeft);
      (socket as any).off('webrtc:offer', onOffer);
      (socket as any).off('webrtc:answer', onAnswer);
      (socket as any).off('webrtc:ice', onIce);
    };
  }, [closePeer, getOrCreatePc]);

  // Leave voice on unmount
  useEffect(() => {
    return () => {
      if (isInVoice) {
        (socket as any).emit('webrtc:leave_voice');
        for (const sid of [...pcsRef.current.keys()]) {
          const pc = pcsRef.current.get(sid);
          if (pc) { try { pc.close(); } catch {} }
        }
        pcsRef.current.clear();
        localStreamRef.current?.getTracks().forEach(t => t.stop());
      }
    };
  }, [isInVoice]);

  return { isInVoice, isMuted, peers, isConnecting, micError, joinVoice, leaveVoice, toggleMute };
}
