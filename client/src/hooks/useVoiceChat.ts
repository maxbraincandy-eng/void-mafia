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
  remoteStreams: Record<string, MediaStream>;
  error: string | null;
  forceMuted: boolean;
  forceMutedReason: string | null;
  listenOnly: boolean;
}

const INITIAL: VoiceState = {
  channel:          null,
  status:           'disconnected',
  isMuted:          false,
  cameraOn:         false,
  isLocalSpeaking:  false,
  peers:            [],
  remoteStreams:    {},
  error:            null,
  forceMuted:       false,
  forceMutedReason: null,
  listenOnly:       false,
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
      const s = sessionRef.current;
      patch({ peers: s?.getPeers() ?? [], remoteStreams: s?.getRemoteStreams() ?? {} });
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

    function onForceMute({ reason }: { reason: string }) {
      const s = sessionRef.current;
      if (s) s.setMuted(true);
      patch({ isMuted: true, forceMuted: true, forceMutedReason: reason });
    }

    function onForceUnmute() {
      const s = sessionRef.current;
      if (s) s.setMuted(false);
      patch({ isMuted: false, forceMuted: false, forceMutedReason: null });
    }

    function onForceLeave() {
      if (sessionRef.current) {
        (socket as any).emit('voice:leave');
        sessionRef.current.destroy();
        sessionRef.current = null;
        setState(INITIAL);
        log('force-left voice channel');
      }
    }

    (socket as any).on('voice:peer-joined',   onPeerJoined);
    (socket as any).on('voice:peer-left',      onPeerLeft);
    (socket as any).on('voice:offer',          onOffer);
    (socket as any).on('voice:answer',         onAnswer);
    (socket as any).on('voice:ice-candidate',  onIceCandidate);
    (socket as any).on('voice:force-mute',     onForceMute);
    (socket as any).on('voice:force-unmute',   onForceUnmute);
    (socket as any).on('voice:force-leave',    onForceLeave);

    return () => {
      (socket as any).off('voice:peer-joined',   onPeerJoined);
      (socket as any).off('voice:peer-left',      onPeerLeft);
      (socket as any).off('voice:offer',          onOffer);
      (socket as any).off('voice:answer',         onAnswer);
      (socket as any).off('voice:ice-candidate',  onIceCandidate);
      (socket as any).off('voice:force-mute',     onForceMute);
      (socket as any).off('voice:force-unmute',   onForceUnmute);
      (socket as any).off('voice:force-leave',    onForceLeave);
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
        patch({ peers: session.getPeers(), remoteStreams: session.getRemoteStreams() });
      } else if (event.type === 'speaking') {
        if (event.socketId === 'local') {
          patch({ isLocalSpeaking: event.isSpeaking });
        } else {
          patch({ peers: session.getPeers() });
        }
      } else if (event.type === 'stream-update') {
        patch({ remoteStreams: session.getRemoteStreams() });
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

      const transmitAllowed: boolean = res.data.transmitAllowed ?? true;
      patch({ channel, cameraOn: withCamera, forceMuted: !transmitAllowed, forceMutedReason: transmitAllowed ? null : 'Only the current speaker may transmit.' });
      if (!transmitAllowed) session.setMuted(true);
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

  /**
   * Join a voice channel as a listen-only participant.
   * Does NOT request microphone permission — safe to call from useEffect without a user gesture.
   * Spectators and observers use this to hear game discussion without a mic prompt.
   */
  const joinVoiceListenOnly = useCallback(async (channel: VoiceChannel) => {
    if (sessionRef.current) return;

    const session = new WebRTCSession();
    sessionRef.current = session;

    session.subscribe(event => {
      if (event.type === 'state') {
        patch({ status: event.state, error: null });
      } else if (event.type === 'peer-added') {
        patch({ peers: session.getPeers() });
      } else if (event.type === 'peer-removed') {
        patch({ peers: session.getPeers(), remoteStreams: session.getRemoteStreams() });
      } else if (event.type === 'speaking') {
        patch({ peers: session.getPeers() });
      } else if (event.type === 'stream-update') {
        patch({ remoteStreams: session.getRemoteStreams() });
      } else if (event.type === 'error') {
        patch({ error: event.message, status: 'failed' });
      }
    });

    // Skip mic request — listen-only mode
    session.setListenOnlyMode();

    (socket as any).emit('voice:join', { channel }, async (res: any) => {
      if (!res.ok) {
        session.destroy();
        sessionRef.current = null;
        patch({ status: 'failed', error: res.error ?? 'Failed to join voice.' });
        return;
      }

      patch({ channel, listenOnly: true, forceMuted: true, forceMutedReason: 'Listen only' });
      const existingPeers: Array<{ socketId: string; name: string }> = res.data.peers;

      for (const { socketId: peerId, name } of existingPeers) {
        session.createPeerConnection(peerId, name, (candidate) => {
          (socket as any).emit('voice:ice-candidate', { to: peerId, candidate });
        });
        try {
          const offer = await session.createOffer(peerId);
          (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
        } catch (e: any) {
          log('listen-only offer failed for', peerId, ':', e.message);
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
    if (state.forceMuted) return; // server-enforced — cannot override
    const nextMuted = !state.isMuted;
    s.setMuted(nextMuted);
    patch({ isMuted: nextMuted });
  }, [state.isMuted, state.forceMuted, patch]);

  const toggleCamera = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    if (state.cameraOn) {
      // Turn off: remove the track and renegotiate so remote peers drop the video
      await s.removeCamera((peerId, offer) => {
        (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
      });
      patch({ cameraOn: false });
    } else {
      // Turn on: request camera permission if we don't have the track yet.
      // Pass a renegotiation callback so existing peers receive the video track.
      try {
        await s.addCamera((peerId, offer) => {
          (socket as any).emit('voice:offer', { to: peerId, sdp: offer }, () => {});
        });
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
    joinVoiceListenOnly,
    leaveVoice,
    toggleMute,
    toggleCamera,
    getLocalStream,
  };
}
