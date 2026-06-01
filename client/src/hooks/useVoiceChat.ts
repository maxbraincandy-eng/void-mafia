/**
 * useVoiceChat — React hook wrapping the WebRTC session.
 *
 * Voice channels:
 *   'room'  — available to all alive players (and lobby)
 *   'mafia' — only alive Mafia during night
 *
 * Call joinVoice(channel) ONLY on user interaction (e.g. button tap).
 * The browser will then show the microphone/camera permission prompt.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, ConnectionState, PeerState, log } from '@/services/webrtcService';

export type VoiceChannel = 'room' | 'mafia';

export interface VoiceState {
  channel: VoiceChannel | null;
  status: ConnectionState;
  isMuted: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  peers: PeerState[];
  error: string | null;
}

const INITIAL: VoiceState = {
  channel:         null,
  status:          'disconnected',
  isMuted:         false,
  cameraOn:        false,
  isLocalSpeaking: false,
  peers:           [],
  error:           null,
};

export function useVoiceChat() {
  const [state, setState] = useState<VoiceState>(INITIAL);
  const sessionRef = useRef<WebRTCSession | null>(null);

  const patch = useCallback((partial: Partial<VoiceState>) => {
    setState(s => ({ ...s, ...partial }));
  }, []);

  // ── Socket signaling listeners ─────────────────────────────────────

  useEffect(() => {
    function onPeerJoined({ socketId, name, channel }: { socketId: string; name: string; channel: VoiceChannel }) {
      const s = sessionRef.current;
      if (!s) return;
      log('peer-joined', socketId, name, 'ch:', channel);
      // The joining peer will send us an offer — we just add them to the peer list here
      // so the UI can show them immediately; createPeerConnection happens in onOffer
      s.createPeerConnection(socketId, name, (candidate) => {
        (socket as any).emit('voice:ice-candidate', { to: socketId, candidate });
      });
      patch({ peers: s.getPeers() });
    }

    function onPeerLeft({ socketId }: { socketId: string }) {
      log('peer-left', socketId);
      sessionRef.current?.removePeer(socketId);
      patch({ peers: sessionRef.current?.getPeers() ?? [] });
    }

    async function onOffer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
      const s = sessionRef.current;
      if (!s) return;
      log('offer from', from);
      try {
        // We need to know the peer's name. Use existing peer info if available,
        // or fall back to 'Player' (peer-joined fires before offer in normal flow).
        const existingName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Player';
        const answer = await s.handleOffer(from, existingName, sdp, (candidate) => {
          (socket as any).emit('voice:ice-candidate', { to: from, candidate });
        });
        (socket as any).emit('voice:answer', { to: from, sdp: answer }, () => {});
        patch({ peers: s.getPeers() });
      } catch (e: any) {
        log('offer handling failed:', e.message);
      }
    }

    async function onAnswer({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) {
      log('answer from', from);
      try {
        await sessionRef.current?.handleAnswer(from, sdp);
      } catch (e: any) {
        log('answer handling failed:', e.message);
      }
    }

    async function onIceCandidate({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) {
      try {
        await sessionRef.current?.addIceCandidate(from, candidate);
      } catch {}
    }

    (socket as any).on('voice:peer-joined',   onPeerJoined);
    (socket as any).on('voice:peer-left',      onPeerLeft);
    (socket as any).on('voice:offer',          onOffer);
    (socket as any).on('voice:answer',         onAnswer);
    (socket as any).on('voice:ice-candidate',  onIceCandidate);

    return () => {
      (socket as any).off('voice:peer-joined',   onPeerJoined);
      (socket as any).off('voice:peer-left',      onPeerLeft);
      (socket as any).off('voice:offer',          onOffer);
      (socket as any).off('voice:answer',         onAnswer);
      (socket as any).off('voice:ice-candidate',  onIceCandidate);
    };
  }, [patch]);

  // ── Actions ────────────────────────────────────────────────────────

  /** Join a voice channel. Requests mic permission on call — must be triggered by user gesture. */
  const joinVoice = useCallback(async (channel: VoiceChannel, withCamera = false) => {
    if (sessionRef.current) return; // already in voice

    const session = new WebRTCSession();
    sessionRef.current = session;

    // Subscribe to session events
    session.subscribe(event => {
      if (event.type === 'state') {
        patch({ status: event.state, error: null });
      } else if (event.type === 'peer-added') {
        patch({ peers: session.getPeers() });
      } else if (event.type === 'peer-removed') {
        patch({ peers: session.getPeers() });
      } else if (event.type === 'speaking') {
        if (event.socketId === 'local') {
          patch({ isLocalSpeaking: event.isSpeaking });
        } else {
          patch({ peers: session.getPeers() });
        }
      } else if (event.type === 'error') {
        patch({ error: event.message, status: 'failed' });
      }
    });

    // 1. Request mic (triggers browser permission prompt)
    try {
      await session.requestMedia(true, withCamera);
    } catch {
      session.destroy();
      sessionRef.current = null;
      return;
    }

    // 2. Join the server channel
    (socket as any).emit('voice:join', { channel }, async (res: any) => {
      if (!res.ok) {
        const msg = res.error ?? 'Failed to join voice channel.';
        log('voice:join rejected:', msg);
        session.destroy();
        sessionRef.current = null;
        patch({ status: 'failed', error: msg });
        return;
      }

      patch({ channel, cameraOn: withCamera });
      const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;
      log('joined voice, existing peers:', existingPeers.length);

      // 3. Initiate connection to each existing peer
      for (const { socketId: peerId, name } of existingPeers) {
        session.createPeerConnection(peerId, name, (candidate) => {
          (socket as any).emit('voice:ice-candidate', { to: peerId, candidate });
        });
        try {
          const offer = await session.createOffer(peerId);
          (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
          log('offer sent to', peerId);
        } catch (e: any) {
          log('offer creation failed for', peerId, ':', e.message);
        }
      }

      patch({ peers: session.getPeers() });
    });
  }, [patch]);

  const leaveVoice = useCallback(() => {
    (socket as any).emit('voice:leave');
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setState(INITIAL);
    log('left voice');
  }, []);

  const toggleMute = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const nextMuted = !state.isMuted;
    s.setMuted(nextMuted);
    patch({ isMuted: nextMuted });
  }, [state.isMuted, patch]);

  const toggleCamera = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    if (state.cameraOn) {
      // Turn off: remove the track so permission is cleanly released
      s.removeCamera();
      patch({ cameraOn: false });
    } else {
      // Turn on: request camera permission if we don't have the track yet
      try {
        await s.addCamera();
        patch({ cameraOn: true, error: null });
      } catch {
        // error already emitted by webrtcService to the subscriber → patch via event
      }
    }
  }, [state.cameraOn, patch]);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        (socket as any).emit('voice:leave');
        sessionRef.current.destroy();
        sessionRef.current = null;
      }
    };
  }, []);

  /** Current local MediaStream (mic + optional camera), or null if not in voice. */
  const getLocalStream = useCallback(() => sessionRef.current?.getLocalStream() ?? null, []);

  return {
    ...state,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleCamera,
    getLocalStream,
  };
}
