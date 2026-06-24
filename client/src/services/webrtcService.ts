/**
 * WebRTC session manager. One instance per voice channel session.
 *
 * Responsibilities:
 *  - request microphone/camera via getUserMedia
 *  - create RTCPeerConnection per peer
 *  - handle offer/answer/ICE exchange
 *  - attach remote tracks to <audio> elements
 *  - detect local speaking via AnalyserNode
 *  - clean up everything on destroy()
 */

import { getRTCConfig } from '@/lib/rtcConfig';

const isDev = import.meta.env.DEV;

export function log(...args: unknown[]): void {
  if (isDev) console.log('[WebRTC]', ...args);
}

// Always log — used for ICE failures and errors regardless of build mode
function logWarn(...args: unknown[]): void {
  console.warn('[WebRTC]', ...args);
}
function logErr(...args: unknown[]): void {
  console.error('[WebRTC]', ...args);
}

// ── Types ──────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'disconnected'
  | 'requesting'
  | 'connecting'
  | 'connected'
  | 'failed';

export interface PeerState {
  socketId: string;
  name: string;
  isSpeaking: boolean;
}

export type WebRTCEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'peer-added'; peer: PeerState }
  | { type: 'peer-removed'; socketId: string }
  | { type: 'speaking'; socketId: string | 'local'; isSpeaking: boolean }
  | { type: 'stream-update'; socketId: string; stream: MediaStream | null }
  | { type: 'error'; message: string }
  | { type: 'local-track-ended' };

type Listener = (event: WebRTCEvent) => void;

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeRTCConfig(config?: RTCConfiguration): RTCConfiguration {
  const fallback = getRTCConfig();

  if (!config) return fallback;

  const hasIceServers =
    Array.isArray(config.iceServers) && config.iceServers.length > 0;

  return {
    ...fallback,
    ...config,
    iceServers: hasIceServers ? config.iceServers : fallback.iceServers,
    iceTransportPolicy:
      config.iceTransportPolicy ?? fallback.iceTransportPolicy ?? 'all',
  };
}

// ── Service class ──────────────────────────────────────────────────────

export class WebRTCSession {
  private localStream: MediaStream | null = null;
  private listenOnly = false;
  private pcs = new Map<string, RTCPeerConnection>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private remoteStreams = new Map<string, MediaStream>();
  private peers = new Map<string, PeerState>();
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<Listener>();
  private _visibilityHandler: (() => void) | null = null;
  // Tracks video senders per peer so re-enable can use replaceTrack() without renegotiation
  private videoSenders = new Map<string, RTCRtpSender>();

  /**
   * ICE candidates arriving before setRemoteDescription() are queued here
   * and flushed immediately after setRemoteDescription() completes.
   * Without this buffering, candidates are silently dropped on mobile ↔ WiFi
   * where signaling round-trips can reorder offer/answer vs ICE candidate timing.
   */
  private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();

  /**
   * ICE config comes from rtcConfig.ts.
   * This is where STUN/TURN is actually used by RTCPeerConnection.
   */
  private iceConfig: RTCConfiguration = normalizeRTCConfig();

  // Speaking detection
  private audioCtx: AudioContext | null = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private localSpeakingCooldown = false;
  private remoteSpeakingCooldowns = new Map<string, boolean>();
  // Silent looping audio to hold browser audio focus in background
  private keepaliveAudio: HTMLAudioElement | null = null;

  /**
   * Override ICE config with servers provided by the server.
   * If server sends empty/bad config, keep fallback STUN/TURN config.
   */
  setIceConfig(config: RTCConfiguration): void {
    this.iceConfig = normalizeRTCConfig(config);
    log('ICE config updated:', this.iceConfig);
  }

  // ── Pub/sub ─────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: WebRTCEvent): void {
    for (const l of this.listeners) l(event);
  }

  // ── Accessors ───────────────────────────────────────────────────────

  getState(): ConnectionState {
    return this.state;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getPeers(): PeerState[] {
    return [...this.peers.values()];
  }

  getRemoteStream(socketId: string): MediaStream | null {
    return this.remoteStreams.get(socketId) ?? null;
  }

  getRemoteStreams(): Record<string, MediaStream> {
    return Object.fromEntries(this.remoteStreams.entries());
  }

  /**
   * Returns whether the session appears healthy.
   * Used by the visibility-change recovery logic to decide if a full refresh is needed.
   */
  checkHealth(): { ok: boolean; reason?: string } {
    if (!this.localStream) return { ok: false, reason: 'no-local-stream' };

    for (const [peerId, pc] of this.pcs.entries()) {
      const ice = pc.iceConnectionState;
      const conn = pc.connectionState;
      if (ice === 'failed' || ice === 'disconnected' || conn === 'failed' || conn === 'disconnected') {
        return { ok: false, reason: `peer-${peerId}-${ice}/${conn}` };
      }
    }

    // No peers yet — session is healthy (still connecting or just joined)
    return { ok: true };
  }

  // ── Media ───────────────────────────────────────────────────────────

  /** Skip getUserMedia entirely — receive audio/video without a local mic/camera. */
  setListenOnlyMode(): void {
    this.listenOnly = true;
    this.setState('connecting');
  }

  isListenOnly(): boolean {
    return this.listenOnly;
  }

  /**
   * Upgrade a listen-only session to full-duplex (speaker + listener).
   * Call this from a user-gesture handler (e.g. PTT press) so getUserMedia
   * is allowed on mobile browsers. Renegotiates every existing peer connection.
   */
  async upgradeToSpeaker(
    onRenegotiate: (peerId: string, offer: RTCSessionDescriptionInit) => void,
  ): Promise<void> {
    if (!this.listenOnly) return;

    // Must be called from user gesture — getUserMedia needs it on iOS Safari
    await this.requestMedia(true, false, false);
    this.listenOnly = false;

    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (!audioTrack) return;

    // Start muted — PTT controls actual unmuting
    audioTrack.enabled = false;

    for (const [peerId, pc] of this.pcs.entries()) {
      // Find the recvonly audio transceiver added in listen-only mode
      const transceivers = pc.getTransceivers();
      const audioTxr = transceivers.find(
        (t) => t.receiver.track?.kind === 'audio',
      );

      if (audioTxr) {
        audioTxr.direction = 'sendrecv';
        try { await audioTxr.sender.replaceTrack(audioTrack); } catch (e: any) {
          log('replaceTrack during upgrade failed for', peerId, ':', e.message);
        }
      } else {
        pc.addTrack(audioTrack, this.localStream!);
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        onRenegotiate(peerId, offer);
      } catch (e: any) {
        log('upgrade renegotiation failed for', peerId, ':', e.message);
      }
    }

    this.startSpeakingDetection();
  }

  async requestMedia(
    wantAudio: boolean,
    wantVideo: boolean,
    silent = false,
  ): Promise<void> {
    this.setState('requesting');

    if (!navigator?.mediaDevices?.getUserMedia) {
      const msg =
        window.isSecureContext === false
          ? 'Microphone and camera require HTTPS.'
          : 'Your browser does not support media devices.';

      this.setState('failed');
      if (!silent) this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }

    log('requesting media — audio:', wantAudio, 'video:', wantVideo);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: wantAudio,
        video: wantVideo,
      });

      this.localStream = stream;
      log(
        'local stream ready, tracks:',
        stream.getTracks().map((t) => t.kind),
      );

      this.startSpeakingDetection();
      this.startAudioKeepalive();
      this.registerMediaSession();
      this.monitorLocalTracks();
      this.setState('connecting');
    } catch (e: any) {
      this.setState('failed');

      let msg = 'Could not access microphone.';

      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg =
          'Microphone access denied. Allow it in your browser settings, then try again.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'No microphone found. Please connect one and try again.';
      } else if (e.name === 'NotReadableError') {
        msg = 'Microphone is in use by another application.';
      }

      if (!silent) this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }
  }

  // ── Peer connections ────────────────────────────────────────────────

  createPeerConnection(
    peerId: string,
    peerName: string,
    onIceCandidate: (c: RTCIceCandidateInit) => void,
  ): RTCPeerConnection {
    if (this.pcs.has(peerId)) {
      log('PC already exists for', peerId, '— closing old');
      this.closePeer(peerId);
    }

    const pc = new RTCPeerConnection(normalizeRTCConfig(this.iceConfig));
    this.pcs.set(peerId, pc);

    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, {
        socketId: peerId,
        name: peerName,
        isSpeaking: false,
      });

      this.emit({
        type: 'peer-added',
        peer: this.peers.get(peerId)!,
      });
    }

    logWarn('created PC for', peerId, peerName,
      '| servers:', (this.iceConfig.iceServers as any[])?.length ?? 0,
      '| policy:', this.iceConfig.iceTransportPolicy ?? 'all',
    );

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        if (track.readyState !== 'ended') {
          const sender = pc.addTrack(track, this.localStream);
          // Track video senders immediately so replaceTrack works for future toggles
          if (track.kind === 'video') {
            this.videoSenders.set(peerId, sender);
          }
          log('  added', track.kind, 'track');
        }
      }
    } else if (this.listenOnly) {
      // No local stream — add recvonly audio transceiver so the SDP offer
      // includes an audio section that tells the remote peer to send us audio.
      pc.addTransceiver('audio', { direction: 'recvonly' });
      log('  added recvonly audio transceiver (listen-only)');
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        log('ICE candidate →', peerId, ev.candidate.type, ev.candidate.protocol);
        onIceCandidate(ev.candidate.toJSON());
      }
    };

    pc.onicecandidateerror = (ev) => {
      // errorCode 701/702 = server unreachable, 401 = auth failure, 300 = STUN binding error
      logWarn(`ICE candidate error [${peerId}] code=${ev.errorCode} url=${ev.url} text="${ev.errorText}"`);
    };

    pc.onicegatheringstatechange = () => {
      log('ICE gathering [', peerId, ']', pc.iceGatheringState);
      if (pc.iceGatheringState === 'complete') {
        // Log all gathered local candidate types so we can see host/srflx/relay
        pc.getStats().then(stats => {
          const types: string[] = [];
          stats.forEach(r => {
            if (r.type === 'local-candidate') {
              types.push(`${r.candidateType}/${r.protocol ?? '?'}`);
            }
          });
          logWarn(`ICE gathering complete [${peerId}] gathered: [${types.join(', ') || 'none'}]`);
        }).catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      log('ICE state [', peerId, ']', pc.iceConnectionState);

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.setState('connected');
        // Log the selected candidate pair type (relay/srflx/host) for diagnostics
        pc.getStats().then(stats => {
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
              const local = stats.get(report.localCandidateId);
              const remote = stats.get(report.remoteCandidateId);
              log('Selected ICE pair:', local?.candidateType, '→', remote?.candidateType, '|', local?.protocol);
            }
          });
        }).catch(() => {});
        return;
      }

      if (pc.iceConnectionState === 'checking') {
        this.setState('connecting');
        return;
      }

      if (pc.iceConnectionState === 'failed') {
        logErr('ICE FAILED for', peerId, '— gathering state:', pc.iceGatheringState, '| signaling:', pc.signalingState);
        this.setState('failed');
        this.emit({
          type: 'error',
          message: 'Voice connection failed. Try Reset Voice.',
        });

        try {
          pc.restartIce();
        } catch (e: any) {
          log('restartIce failed for', peerId, ':', e?.message ?? e);
        }

        return;
      }

      if (pc.iceConnectionState === 'disconnected') {
        log('ICE disconnected for', peerId, '— waiting/restarting');
        this.emit({
          type: 'error',
          message: 'Voice connection interrupted. If it does not recover, tap Reset Voice.',
        });

        try {
          pc.restartIce();
        } catch (e: any) {
          log('restartIce after disconnect failed for', peerId, ':', e?.message ?? e);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      log('conn state [', peerId, ']', pc.connectionState);

      if (pc.connectionState === 'connected') {
        this.setState('connected');
        return;
      }

      if (pc.connectionState === 'connecting') {
        this.setState('connecting');
        return;
      }

      if (pc.connectionState === 'failed') {
        logErr('CONNECTION FAILED for', peerId, '| ICE state:', pc.iceConnectionState, '| gathering:', pc.iceGatheringState);

        this.setState('failed');
        this.emit({
          type: 'error',
          message: 'Voice connection failed. Tap Reset Voice and try again.',
        });

        try {
          pc.close();
        } catch {}

        this.pcs.delete(peerId);
      }
    };

    pc.ontrack = (ev) => {
      log('remote track from', peerId, ':', ev.track.kind);

      // Use a persistent per-peer stream instead of ev.streams[0].
      // ev.streams can be empty on iOS Safari during renegotiation, so we
      // always build the stream ourselves from individual tracks.
      let stream = this.remoteStreams.get(peerId);

      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }

      if (!stream.getTrackById(ev.track.id)) {
        stream.addTrack(ev.track);
        log('added', ev.track.kind, 'track to peer stream', peerId);
      }

      this.emit({
        type: 'stream-update',
        socketId: peerId,
        stream,
      });

      this.attachRemoteAudio(peerId, stream);
    };

    return pc;
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    const pc = this.pcs.get(peerId);
    if (!pc) throw new Error('No PC for ' + peerId);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    log('offer created for', peerId);
    return offer;
  }

  async handleOffer(
    peerId: string,
    peerName: string,
    sdp: RTCSessionDescriptionInit,
    onIceCandidate: (c: RTCIceCandidateInit) => void,
  ): Promise<RTCSessionDescriptionInit> {
    const isRenegotiation = this.pcs.has(peerId);

    log(
      'handling offer from',
      peerId,
      isRenegotiation ? '(renegotiation)' : '(new)',
    );

    let pc: RTCPeerConnection;

    if (isRenegotiation) {
      // Reuse existing PC — just refresh the ICE candidate handler.
      pc = this.pcs.get(peerId)!;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          log(
            'ICE candidate (renegotiation) →',
            peerId,
            ev.candidate.type,
            ev.candidate.protocol,
          );

          onIceCandidate(ev.candidate.toJSON());
        }
      };

      log('reusing existing PC for renegotiation with', peerId);
    } else {
      // First connection: create a new peer connection.
      this.createPeerConnection(peerId, peerName, onIceCandidate);
      pc = this.pcs.get(peerId)!;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    // Flush any ICE candidates that arrived before remote description was set
    await this.flushIceCandidateQueue(peerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    log(
      'answer created for',
      peerId,
      isRenegotiation ? '(renegotiation done)' : '(initial)',
    );

    return answer;
  }

  async handleAnswer(
    peerId: string,
    sdp: RTCSessionDescriptionInit,
  ): Promise<void> {
    const pc = this.pcs.get(peerId);

    if (!pc) {
      log('no PC for answer from', peerId);
      return;
    }

    if (pc.signalingState === 'stable') {
      log('already stable — skipping answer');
      return;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    // Flush any ICE candidates that arrived before the answer was applied
    await this.flushIceCandidateQueue(peerId);
    log('answer applied from', peerId);
  }

  async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.pcs.get(peerId);
    if (!pc) return;

    // Buffer the candidate if remote description hasn't been set yet.
    // This is the main fix for mobile ↔ WiFi ICE failures: candidates can
    // arrive via signaling before the answer/offer has been applied, and
    // calling addIceCandidate on a PC with no remoteDescription silently fails.
    if (!pc.remoteDescription) {
      const queue = this.iceCandidateQueues.get(peerId) ?? [];
      queue.push(candidate);
      this.iceCandidateQueues.set(peerId, queue);
      log('ICE candidate queued for', peerId, '— waiting for remote description (queue size:', queue.length, ')');
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      log('ICE candidate added from', peerId, (candidate as any).type ?? '?');
    } catch (e: any) {
      log('ICE candidate error from', peerId, ':', e.message);
    }
  }

  private async flushIceCandidateQueue(peerId: string): Promise<void> {
    const queue = this.iceCandidateQueues.get(peerId);
    if (!queue || queue.length === 0) return;
    this.iceCandidateQueues.delete(peerId);

    const pc = this.pcs.get(peerId);
    if (!pc) return;

    log('flushing', queue.length, 'queued ICE candidate(s) for', peerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        log('flushed ICE candidate for', peerId, (candidate as any).type ?? '?');
      } catch (e: any) {
        log('flushed ICE candidate error for', peerId, ':', e.message);
      }
    }
  }

  removePeer(socketId: string): void {
    this.closePeer(socketId);
    this.peers.delete(socketId);
    this.remoteSpeakingCooldowns.delete(socketId);
    this.remoteStreams.delete(socketId);
    this.iceCandidateQueues.delete(socketId);
    this.videoSenders.delete(socketId);

    this.emit({
      type: 'peer-removed',
      socketId,
    });

    log('peer removed:', socketId);
  }

  // ── Audio/video controls ────────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });

    log('muted:', muted);
  }

  /**
   * Mute all remote audio except the given socketId.
   * Pass null to unmute everyone (normal phase).
   */
  setSpeakerOnly(speakerSocketId: string | null): void {
    for (const [sid, audio] of this.audioEls.entries()) {
      audio.muted = speakerSocketId !== null && sid !== speakerSocketId;
    }
    log('setSpeakerOnly:', speakerSocketId);
  }

  /** Enable/disable the existing video track. */
  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });

    log('camera:', enabled ? 'on' : 'off');
  }

  hasCameraTrack(): boolean {
    return (this.localStream?.getVideoTracks().some(t => t.readyState !== 'ended') ?? false);
  }

  /**
   * Request camera permission and add the video track to the local stream
   * and all existing peer connections.
   *
   * Re-enable path: if a video sender already exists for a peer (preserved from
   * a previous removeCamera call), we use replaceTrack(newTrack) — no SDP
   * renegotiation needed, so there's no PC state race condition on quick toggles.
   */
  async addCamera(
    onRenegotiate?: (
      peerId: string,
      offer: RTCSessionDescriptionInit,
    ) => void,
  ): Promise<void> {
    if (!this.localStream) throw new Error('Not in voice.');

    // Clean up any stale ended video tracks
    for (const track of this.localStream.getVideoTracks()) {
      if (track.readyState === 'ended') {
        this.localStream.removeTrack(track);
        log('removed stale ended camera track');
      }
    }

    if (this.hasCameraTrack()) {
      this.setCameraEnabled(true);
      return;
    }

    log('requesting camera permission...');

    let videoStream: MediaStream;

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e: any) {
      let msg = 'Could not access camera.';

      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg =
          'Camera access denied. Allow it in your browser settings, then try again.';
      } else if (e.name === 'NotFoundError') {
        msg = 'No camera found. Please connect one and try again.';
      }

      this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }

    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) return;

    this.localStream.addTrack(videoTrack);
    log('camera track added to local stream');

    for (const [peerId, pc] of this.pcs.entries()) {
      const existingSender = this.videoSenders.get(peerId);

      if (existingSender) {
        // Re-enable: swap new track into existing sender — no renegotiation needed.
        // The remote peer already has the transceiver; it just starts receiving frames again.
        try {
          await existingSender.replaceTrack(videoTrack);
          log('camera re-enabled for peer', peerId, '(replaceTrack, no renegotiation)');
        } catch (e: any) {
          log('replaceTrack re-enable failed for', peerId, ':', e.message, '— falling back to addTrack');
          // Fallback: sender is from a closed/replaced PC; treat as first-time enable
          this.videoSenders.delete(peerId);
          try {
            const sender = pc.addTrack(videoTrack, this.localStream!);
            this.videoSenders.set(peerId, sender);
            if (onRenegotiate) {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              onRenegotiate(peerId, offer);
              log('renegotiation offer sent to', peerId, '(fallback)');
            }
          } catch (e2: any) {
            log('addTrack fallback also failed for', peerId, ':', e2.message);
          }
        }
      } else {
        // First time enabling camera for this peer: add track and renegotiate.
        const sender = pc.addTrack(videoTrack, this.localStream);
        this.videoSenders.set(peerId, sender);
        log('camera track added to peer connection', peerId);

        if (onRenegotiate) {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            onRenegotiate(peerId, offer);
            log('renegotiation offer sent to', peerId);
          } catch (e: any) {
            log('renegotiation offer failed for', peerId, ':', e.message);
          }
        }
      }
    }
  }

  /**
   * Stop the camera track and null out the video senders.
   * Uses replaceTrack(null) instead of removeTrack so the sender stays alive —
   * this avoids needing SDP renegotiation and prevents the PC state race
   * condition that breaks quick camera off→on cycles.
   */
  async removeCamera(): Promise<void> {
    if (!this.localStream) return;

    const tracks = this.localStream.getVideoTracks();

    for (const track of tracks) {
      for (const [peerId, pc] of this.pcs.entries()) {
        const sender = pc.getSenders().find((s) => s.track === track);
        if (sender) {
          this.videoSenders.set(peerId, sender);
          try {
            await sender.replaceTrack(null);
            log('camera sender preserved (nulled) for peer', peerId);
          } catch (e: any) {
            log('replaceTrack(null) failed for', peerId, ':', e.message);
          }
        }
      }

      track.stop();
      this.localStream.removeTrack(track);
    }

    log('camera stopped — senders preserved for re-enable');
  }

  // ── Background audio keepalive ───────────────────────────────────────

  private startAudioKeepalive(): void {
    if (this.keepaliveAudio) return;
    // Tiny silent WAV (44-byte header, 0 data bytes) looped to hold browser audio focus.
    // Without this, Android Chrome suspends audio and mutes the mic after ~5s in background.
    const audio = document.createElement('audio');
    audio.loop = true;
    audio.volume = 0.001;
    // 1-second silent WAV at 8kHz, 8-bit, mono
    audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    audio.style.display = 'none';
    document.body.appendChild(audio);
    audio.play().catch(() => {});
    this.keepaliveAudio = audio;
  }

  private registerMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Void Mafia',
        artist: 'Voice Chat Active',
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
  }

  private monitorLocalTracks(): void {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        log('local audio track ended (OS killed in background)');
        this.emit({ type: 'local-track-ended' });
      });
      track.addEventListener('mute', () => {
        log('local audio track muted by OS');
      });
      track.addEventListener('unmute', () => {
        log('local audio track unmuted by OS');
      });
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  destroy(): void {
    log('destroying WebRTC session');

    this.stopSpeakingDetection();

    for (const sid of [...this.pcs.keys()]) {
      this.closePeer(sid);
    }

    this.pcs.clear();
    this.peers.clear();
    this.remoteSpeakingCooldowns.clear();
    this.remoteStreams.clear();
    this.iceCandidateQueues.clear();
    this.videoSenders.clear();

    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    for (const audio of this.audioEls.values()) {
      audio.srcObject = null;
      try { audio.remove(); } catch {}
    }
    this.audioEls.clear();

    if (this.keepaliveAudio) {
      this.keepaliveAudio.pause();
      try { this.keepaliveAudio.remove(); } catch {}
      this.keepaliveAudio = null;
    }

    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch {}
    }

    this.localStream?.getTracks().forEach((t) => {
      t.stop();
      log('stopped track:', t.kind);
    });

    this.localStream = null;

    this.setState('disconnected');
    this.listeners.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────

  private setState(s: ConnectionState): void {
    if (this.state === s) return;

    this.state = s;

    this.emit({
      type: 'state',
      state: s,
    });

    log('state →', s);
  }

  private closePeer(socketId: string): void {
    // Clear stale sender so addCamera() doesn't try replaceTrack on a closed PC
    this.videoSenders.delete(socketId);

    const pc = this.pcs.get(socketId);

    if (pc) {
      try {
        pc.close();
      } catch {}

      this.pcs.delete(socketId);
    }

    const audio = this.audioEls.get(socketId);

    if (audio) {
      audio.srcObject = null;

      try {
        audio.remove();
      } catch {}

      this.audioEls.delete(socketId);
    }
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream): void {
    let audio = this.audioEls.get(peerId);

    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.muted = false;
      audio.volume = 1.0;
      audio.style.display = 'none';

      document.body.appendChild(audio);
      this.audioEls.set(peerId, audio);

      // Resume if the OS pauses the element in background (iOS Safari behaviour)
      audio.addEventListener('pause', () => {
        if (!audio!.ended) audio!.play().catch(() => {});
      });
    }

    audio.srcObject = stream;

    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((e) => {
        log('remote audio autoplay blocked for', peerId, e?.message ?? e);

        const retry = () => {
          audio!.play().catch((err) => {
            log('remote audio retry failed for', peerId, err?.message ?? err);
          });
        };

        document.addEventListener('click', retry, { once: true });
        document.addEventListener('touchstart', retry, { once: true });
      });
    }

    // Register a single shared visibility handler the first time we attach audio
    if (!this._visibilityHandler) {
      this._visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          // Resume AudioContext (suspended by OS in background)
          if (this.audioCtx?.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
          }
          // Resume all remote audio elements
          for (const el of this.audioEls.values()) {
            if (el.paused && !el.ended) el.play().catch(() => {});
          }
          // Resume keepalive
          if (this.keepaliveAudio?.paused) {
            this.keepaliveAudio.play().catch(() => {});
          }
          // Check if local mic track was killed in background
          const audioTrack = this.localStream?.getAudioTracks()[0];
          if (audioTrack && audioTrack.readyState === 'ended') {
            log('local audio track ended in background — emitting local-track-ended');
            this.emit({ type: 'local-track-ended' });
          }
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }

    this.startRemoteSpeakingDetection(peerId, stream);
  }

  // ── Speaking detection ──────────────────────────────────────────────

  private startSpeakingDetection(): void {
    if (!this.localStream) return;

    try {
      this.audioCtx = new AudioContext();

      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;

      const source = this.audioCtx.createMediaStreamSource(this.localStream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      this.speakingTimer = setInterval(() => {
        analyser.getByteFrequencyData(data);

        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const isSpeaking = avg > 8;

        if (isSpeaking !== this.localSpeakingCooldown) {
          this.localSpeakingCooldown = isSpeaking;

          this.emit({
            type: 'speaking',
            socketId: 'local',
            isSpeaking,
          });
        }
      }, 100);
    } catch (e: any) {
      log('local speaking detection failed:', e?.message ?? e);
    }
  }

  private startRemoteSpeakingDetection(
    peerId: string,
    stream: MediaStream,
  ): void {
    if (!this.audioCtx) return;

    try {
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;

      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const timer = setInterval(() => {
        if (!this.peers.has(peerId)) {
          clearInterval(timer);
          return;
        }

        analyser.getByteFrequencyData(data);

        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const isSpeaking = avg > 8;
        const prev = this.remoteSpeakingCooldowns.get(peerId) ?? false;

        if (isSpeaking !== prev) {
          this.remoteSpeakingCooldowns.set(peerId, isSpeaking);

          const peer = this.peers.get(peerId);

          if (peer) {
            peer.isSpeaking = isSpeaking;

            this.emit({
              type: 'speaking',
              socketId: peerId,
              isSpeaking,
            });
          }
        }
      }, 100);
    } catch (e: any) {
      log('remote speaking detection failed for', peerId, e?.message ?? e);
    }
  }

  private stopSpeakingDetection(): void {
    if (this.speakingTimer) {
      clearInterval(this.speakingTimer);
      this.speakingTimer = null;
    }

    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }
}
