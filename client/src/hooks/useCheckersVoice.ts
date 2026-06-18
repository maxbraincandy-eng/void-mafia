/**
 * useCheckersVoice — WebRTC Push-to-Talk voice for Checkers matches.
 *
 * Isolated from Mafia game-room voice and Community lounge voice.
 * Follows the same module-level singleton pattern as useLoungeVoice.
 *
 * Voice is lazy: the WebRTC session is only created when the player
 * first presses PTT (to avoid a mic-permission prompt on match join).
 * Spectators may join in listen-only mode explicitly.
 *
 * Cleanup is triggered by calling leave() — do this on match end or
 * component unmount to guarantee no ghost mic or audio elements remain.
 */

import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/lib/socket';
import { WebRTCSession, type ConnectionState, type PeerState, log } from '@/services/webrtcService';

export interface CheckersVoiceState {
  matchId: string | null;
  status: ConnectionState;
  joined: boolean;
  isTalking: boolean;
  speakingSocketIds: string[];
  peers: PeerState[];
  error: string | null;
}

const INITIAL: CheckersVoiceState = {
  matchId: null,
  status: 'disconnected',
  joined: false,
  isTalking: false,
  speakingSocketIds: [],
  peers: [],
  error: null,
};

let _session: WebRTCSession | null = null;
let _state: CheckersVoiceState = { ...INITIAL };
const _subscribers = new Set<(s: CheckersVoiceState) => void>();
let _joining = false;
let _wantsToTalk = false;

function _patch(partial: Partial<CheckersVoiceState>) {
  _state = { ..._state, ...partial };
  for (const sub of _subscribers) sub({ ..._state });
}

function _reset() {
  _state = { ...INITIAL };
  _session = null;
  _joining = false;
  _wantsToTalk = false;
  for (const sub of _subscribers) sub({ ..._state });
}

// ── Core session management ────────────────────────────────────────────

async function _createAndJoin(matchId: string, listenOnly: boolean): Promise<void> {
  if (_session) return; // already joined
  _joining = true;

  const session = new WebRTCSession();
  _session = session;

  session.subscribe(event => {
    if (!_session || _session !== session) return; // stale session
    if (event.type === 'state') {
      _patch({ status: event.state });
    } else if (event.type === 'peer-added' || event.type === 'peer-removed') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'stream-update') {
      _patch({ peers: session.getPeers() });
    } else if (event.type === 'error') {
      _patch({ error: event.message });
    }
  });

  if (listenOnly) {
    session.setListenOnlyMode();
  } else {
    try {
      await session.requestMedia(true, false, false);
    } catch {
      session.destroy();
      _session = null;
      _joining = false;
      _patch({ status: 'failed', error: 'Microphone access denied.' });
      return;
    }
    // Start muted — PTT controls when mic is actually live
    session.setMuted(true);
  }

  (socket as any).emit('checkers:voice-join', { matchId }, async (res: any) => {
    _joining = false;
    if (!_session || _session !== session) return; // aborted

    if (!res?.ok) {
      session.destroy();
      _session = null;
      _patch({ status: 'failed', error: res?.error ?? 'Failed to join voice.' });
      return;
    }

    const { peers: existingPeers, iceServers, iceTransportPolicy } = res.data;
    if (iceServers) {
      session.setIceConfig({ iceServers, iceTransportPolicy, iceCandidatePoolSize: 10 } as any);
    }

    _patch({ matchId, joined: true, error: null });

    for (const { socketId, name } of existingPeers as Array<{ socketId: string; name: string }>) {
      session.createPeerConnection(socketId, name, (candidate) => {
        (socket as any).emit('checkers:voice-ice', { to: socketId, candidate });
      });
      try {
        const offer = await session.createOffer(socketId);
        (socket as any).emit('checkers:voice-offer', { to: socketId, sdp: offer });
      } catch (e: any) {
        log('checkers voice offer failed for', socketId, ':', e.message);
      }
    }
    _patch({ peers: session.getPeers() });

    // If user pressed PTT while we were joining full-duplex, start talking now
    if (_wantsToTalk && !listenOnly) {
      session.setMuted(false);
      _patch({ isTalking: true });
      (socket as any).emit('checkers:ptt-start', { matchId });
    }
    // listen-only + _wantsToTalk: user pressed PTT during join — they'll press again after
  });
}

function _leave(): void {
  if (!_session && !_joining) return;
  _wantsToTalk = false;

  const matchId = _state.matchId;
  if (matchId) {
    if (_state.isTalking) {
      (socket as any).emit('checkers:ptt-stop', { matchId });
    }
    (socket as any).emit('checkers:voice-leave', { matchId });
  }

  _session?.destroy();
  _reset();
}

// ── PTT controls ───────────────────────────────────────────────────────

async function _startTalking(matchId: string): Promise<void> {
  _wantsToTalk = true;

  if (!_session) {
    if (!_joining) {
      // First PTT press with no session at all — create full-duplex session
      await _createAndJoin(matchId, false);
    }
    return;
  }

  if (_joining) return;

  // If auto-joined in listen-only mode, upgrade to full-duplex on first PTT press.
  // Must be called from user gesture (PTT touchstart/mousedown) for iOS Safari getUserMedia.
  if (_session.isListenOnly()) {
    try {
      await _session.upgradeToSpeaker((peerId, offer) => {
        (socket as any).emit('checkers:voice-offer', { to: peerId, sdp: offer });
      });
    } catch {
      _patch({ error: 'Microphone access denied.' });
      return;
    }
  }

  _session.setMuted(false);
  _patch({ isTalking: true });
  (socket as any).emit('checkers:ptt-start', { matchId });
}

function _stopTalking(matchId: string): void {
  _wantsToTalk = false;
  if (!_state.isTalking) return;
  _session?.setMuted(true);
  _patch({ isTalking: false });
  (socket as any).emit('checkers:ptt-stop', { matchId });
}

// ── Socket handlers (registered once at module load) ──────────────────

(socket as any).on('checkers:voice-peer-joined', ({ socketId, name }: { socketId: string; name: string }) => {
  const s = _session;
  if (!s) return;
  s.removePeer(socketId); // clear stale PC if any
  s.createPeerConnection(socketId, name, (candidate) => {
    (socket as any).emit('checkers:voice-ice', { to: socketId, candidate });
  });
  _patch({ peers: s.getPeers() });
});

(socket as any).on('checkers:voice-peer-left', ({ socketId }: { socketId: string }) => {
  _session?.removePeer(socketId);
  _patch({ peers: _session?.getPeers() ?? [], speakingSocketIds: _state.speakingSocketIds.filter(id => id !== socketId) });
});

(socket as any).on('checkers:voice-offer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  const s = _session;
  if (!s) return;
  try {
    const existingName = s.getPeers().find(p => p.socketId === from)?.name ?? 'Player';
    const answer = await s.handleOffer(from, existingName, sdp, (candidate) => {
      (socket as any).emit('checkers:voice-ice', { to: from, candidate });
    });
    (socket as any).emit('checkers:voice-answer', { to: from, sdp: answer });
    _patch({ peers: s.getPeers() });
  } catch (e: any) {
    log('checkers voice offer handling failed:', e.message);
  }
});

(socket as any).on('checkers:voice-answer', async ({ from, sdp }: { from: string; sdp: RTCSessionDescriptionInit }) => {
  try { await _session?.handleAnswer(from, sdp); } catch (e: any) { log('checkers voice answer failed:', e.message); }
});

(socket as any).on('checkers:voice-ice', async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
  try { await _session?.addIceCandidate(from, candidate); } catch {}
});

(socket as any).on('checkers:ptt-state', ({ socketId, speaking }: { socketId: string; speaking: boolean }) => {
  const next = speaking
    ? [...new Set([..._state.speakingSocketIds, socketId])]
    : _state.speakingSocketIds.filter(id => id !== socketId);
  _patch({ speakingSocketIds: next });
});

// Clean up if socket disconnects / reconnects
(socket as any).on('disconnect', () => {
  if (_session) {
    _session.destroy();
    _reset();
  }
});

// ── Hook ──────────────────────────────────────────────────────────────

export function useCheckersVoice() {
  const [state, setLocalState] = useState<CheckersVoiceState>({ ..._state });

  useEffect(() => {
    _subscribers.add(setLocalState);
    setLocalState({ ..._state });
    return () => { _subscribers.delete(setLocalState); };
  }, []);

  const startTalk  = useCallback((matchId: string) => { _startTalking(matchId); }, []);
  const stopTalk   = useCallback((matchId: string) => _stopTalking(matchId), []);
  const joinListen = useCallback((matchId: string) => { _createAndJoin(matchId, true); }, []);
  const joinVoice  = useCallback((matchId: string) => { _createAndJoin(matchId, false); }, []);
  const leave      = useCallback(() => _leave(), []);

  return { ...state, startTalk, stopTalk, joinListen, joinVoice, leave };
}

/** Imperatively leave voice (used from stores/non-React code). */
export function leaveCheckersVoice(): void {
  _leave();
}
