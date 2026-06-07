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
  | { type: 'error'; message: string };

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

  // ── Media ───────────────────────────────────────────────────────────

  /** Skip getUserMedia entirely — receive audio/video without a local mic/camera. */
  setListenOnlyMode(): void {
    this.listenOnly = true;
    this.setState('connecting');
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

    log('created PC for', peerId, peerName, 'with ICE config:', this.iceConfig);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
        log('  added', track.kind, 'track');
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
      log(
        'ICE candidate error [',
        peerId,
        ']',
        ev.errorCode,
        ev.errorText,
        ev.url,
      );
    };

    pc.oniceconnectionstatechange = () => {
      log('ICE state [', peerId, ']', pc.iceConnectionState);

      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.setState('connected');
        return;
      }

      if (pc.iceConnectionState === 'checking') {
        this.setState('connecting');
        return;
      }

      if (pc.iceConnectionState === 'failed') {
        log('ICE failed for', peerId, '— restarting ICE');
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
        log('Connection failed for', peerId, '— closing and cleaning up');

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
    log('answer applied from', peerId);
  }

  async addIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit,
  ): Promise<void> {
    const pc = this.pcs.get(peerId);
    if (!pc) return;

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      log('ICE candidate added from', peerId);
    } catch (e: any) {
      log('ICE candidate error:', e.message);
    }
  }

  removePeer(socketId: string): void {
    this.closePeer(socketId);
    this.peers.delete(socketId);
    this.remoteSpeakingCooldowns.delete(socketId);
    this.remoteStreams.delete(socketId);

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

  /** Enable/disable the existing video track. */
  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });

    log('camera:', enabled ? 'on' : 'off');
  }

  hasCameraTrack(): boolean {
    return (this.localStream?.getVideoTracks().length ?? 0) > 0;
  }

  /**
   * Request camera permission and add the video track to the local stream
   * and all existing peer connections.
   */
  async addCamera(
    onRenegotiate?: (
      peerId: string,
      offer: RTCSessionDescriptionInit,
    ) => void,
  ): Promise<void> {
    if (!this.localStream) throw new Error('Not in voice.');

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
      pc.addTrack(videoTrack, this.localStream);
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

  /** Stop and remove the camera track from local stream and peer connections. */
  async removeCamera(
    onRenegotiate?: (
      peerId: string,
      offer: RTCSessionDescriptionInit,
    ) => void,
  ): Promise<void> {
    if (!this.localStream) return;

    const tracks = this.localStream.getVideoTracks();

    for (const track of tracks) {
      track.stop();
      this.localStream.removeTrack(track);

      for (const pc of this.pcs.values()) {
        const sender = pc.getSenders().find((s) => s.track === track);
        if (sender) pc.removeTrack(sender);
      }
    }

    log('camera track removed');

    if (onRenegotiate) {
      for (const [peerId, pc] of this.pcs.entries()) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          onRenegotiate(peerId, offer);
        } catch (e: any) {
          log('renegotiation (remove camera) failed for', peerId, ':', e.message);
        }
      }
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

    for (const audio of this.audioEls.values()) {
      audio.srcObject = null;

      try {
        audio.remove();
      } catch {}
    }

    this.audioEls.clear();

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

          document.removeEventListener('click', retry);
          document.removeEventListener('touchstart', retry);
        };

        document.addEventListener('click', retry, { once: true });
        document.addEventListener('touchstart', retry, { once: true });
      });
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
