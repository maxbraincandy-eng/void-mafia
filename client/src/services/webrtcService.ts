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

export type ConnectionState = 'disconnected' | 'requesting' | 'connecting' | 'connected' | 'failed';

export interface PeerState {
  socketId: string;
  name: string;
  isSpeaking: boolean;
}

export type WebRTCEvent =
  | { type: 'state';       state: ConnectionState }
  | { type: 'peer-added';  peer: PeerState }
  | { type: 'peer-removed'; socketId: string }
  | { type: 'speaking';    socketId: string | 'local'; isSpeaking: boolean }
  | { type: 'error';       message: string };

type Listener = (event: WebRTCEvent) => void;

// ── Service class ──────────────────────────────────────────────────────

export class WebRTCSession {
  private localStream: MediaStream | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private audioEls = new Map<string, HTMLAudioElement>();
  private peers = new Map<string, PeerState>();
  private state: ConnectionState = 'disconnected';
  private listeners = new Set<Listener>();

  // Speaking detection
  private audioCtx: AudioContext | null = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private localSpeakingCooldown = false;
  private remoteSpeakingCooldowns = new Map<string, boolean>();

  // ── Pub/sub ────────────────────────────────────────────────────────

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: WebRTCEvent): void {
    for (const l of this.listeners) l(event);
  }

  // ── Accessors ──────────────────────────────────────────────────────

  getState(): ConnectionState { return this.state; }
  getLocalStream(): MediaStream | null { return this.localStream; }
  getPeers(): PeerState[] { return [...this.peers.values()]; }

  // ── Media ──────────────────────────────────────────────────────────

  async requestMedia(wantAudio: boolean, wantVideo: boolean): Promise<void> {
    this.setState('requesting');

    if (!navigator?.mediaDevices?.getUserMedia) {
      const msg = window.isSecureContext === false
        ? 'Microphone and camera require HTTPS.'
        : 'Your browser does not support media devices.';
      this.setState('failed');
      this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }

    log('requesting media — audio:', wantAudio, 'video:', wantVideo);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: wantAudio,
        video: wantVideo,
      });
      this.localStream = stream;
      log('local stream ready, tracks:', stream.getTracks().map(t => t.kind));
      this.startSpeakingDetection();
      this.setState('connecting');
    } catch (e: any) {
      this.setState('failed');
      let msg = 'Could not access microphone.';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Microphone access denied. Allow it in your browser settings, then try again.';
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        msg = 'No microphone found. Please connect one and try again.';
      } else if (e.name === 'NotReadableError') {
        msg = 'Microphone is in use by another application.';
      }
      this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }
  }

  // ── Peer connections ───────────────────────────────────────────────

  createPeerConnection(
    peerId: string,
    peerName: string,
    onIceCandidate: (c: RTCIceCandidateInit) => void,
  ): RTCPeerConnection {
    if (this.pcs.has(peerId)) {
      log('PC already exists for', peerId, '— closing old');
      this.closePeer(peerId);
    }

    const pc = new RTCPeerConnection(getRTCConfig());
    this.pcs.set(peerId, pc);

    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, { socketId: peerId, name: peerName, isSpeaking: false });
      this.emit({ type: 'peer-added', peer: this.peers.get(peerId)! });
    }

    log('created PC for', peerId, peerName);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
        log('  added', track.kind, 'track');
      }
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        log('ICE candidate →', peerId);
        onIceCandidate(ev.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      log('ICE state [', peerId, ']', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') pc.restartIce();
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        this.setState('connected');
      }
    };

    pc.onconnectionstatechange = () => {
      log('conn state [', peerId, ']', pc.connectionState);
    };

    pc.ontrack = (ev) => {
      log('remote track from', peerId, ':', ev.track.kind);
      const [stream] = ev.streams;
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
    log('handling offer from', peerId);
    this.createPeerConnection(peerId, peerName, onIceCandidate);
    const pc = this.pcs.get(peerId)!;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    log('answer created for', peerId);
    return answer;
  }

  async handleAnswer(peerId: string, sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.pcs.get(peerId);
    if (!pc) { log('no PC for answer from', peerId); return; }
    if (pc.signalingState === 'stable') { log('already stable — skipping answer'); return; }
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    log('answer applied from', peerId);
  }

  async addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
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
    this.emit({ type: 'peer-removed', socketId });
    log('peer removed:', socketId);
  }

  // ── Audio/video controls ───────────────────────────────────────────

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    log('muted:', muted);
  }

  /** Enable/disable the existing video track (only works if camera was already added). */
  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
    log('camera:', enabled ? 'on' : 'off');
  }

  hasCameraTrack(): boolean {
    return (this.localStream?.getVideoTracks().length ?? 0) > 0;
  }

  /**
   * Request camera permission and add the video track to the local stream
   * and all existing peer connections. Call this when user first enables camera.
   */
  async addCamera(): Promise<void> {
    if (!this.localStream) throw new Error('Not in voice.');
    if (this.hasCameraTrack()) { this.setCameraEnabled(true); return; }

    log('requesting camera permission...');
    let videoStream: MediaStream;
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e: any) {
      let msg = 'Could not access camera.';
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        msg = 'Camera access denied. Allow it in your browser settings, then try again.';
      } else if (e.name === 'NotFoundError') {
        msg = 'No camera found. Please connect one and try again.';
      }
      this.emit({ type: 'error', message: msg });
      throw new Error(msg);
    }

    const videoTrack = videoStream.getVideoTracks()[0];
    if (!videoTrack) return;

    // Add to local stream
    this.localStream.addTrack(videoTrack);
    log('camera track added to local stream');

    // Add to all existing peer connections and renegotiate
    for (const [peerId, pc] of this.pcs.entries()) {
      pc.addTrack(videoTrack, this.localStream);
      log('camera track added to peer connection', peerId);
    }
  }

  /** Stop and remove the camera track from local stream and peer connections. */
  removeCamera(): void {
    if (!this.localStream) return;
    const tracks = this.localStream.getVideoTracks();
    for (const track of tracks) {
      track.stop();
      this.localStream.removeTrack(track);
    }
    log('camera track removed');
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  destroy(): void {
    log('destroying WebRTC session');
    this.stopSpeakingDetection();

    for (const sid of [...this.pcs.keys()]) this.closePeer(sid);
    this.pcs.clear();
    this.peers.clear();
    this.audioEls.clear();

    this.localStream?.getTracks().forEach(t => { t.stop(); log('stopped track:', t.kind); });
    this.localStream = null;

    this.setState('disconnected');
    this.listeners.clear();
  }

  // ── Private ────────────────────────────────────────────────────────

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.emit({ type: 'state', state: s });
    log('state →', s);
  }

  private closePeer(socketId: string): void {
    const pc = this.pcs.get(socketId);
    if (pc) { try { pc.close(); } catch {} this.pcs.delete(socketId); }

    const audio = this.audioEls.get(socketId);
    if (audio) {
      audio.srcObject = null;
      try { document.body.removeChild(audio); } catch {}
      this.audioEls.delete(socketId);
    }
  }

  private attachRemoteAudio(peerId: string, stream: MediaStream): void {
    let audio = this.audioEls.get(peerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      this.audioEls.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(e => log('audio.play() blocked:', e.message));
    this.startRemoteSpeakingDetection(peerId, stream);
  }

  // ── Speaking detection ─────────────────────────────────────────────

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
          this.emit({ type: 'speaking', socketId: 'local', isSpeaking });
        }
      }, 100);
    } catch {}
  }

  private startRemoteSpeakingDetection(peerId: string, stream: MediaStream): void {
    if (!this.audioCtx) return;
    try {
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const timer = setInterval(() => {
        if (!this.peers.has(peerId)) { clearInterval(timer); return; }
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const isSpeaking = avg > 8;
        const prev = this.remoteSpeakingCooldowns.get(peerId) ?? false;

        if (isSpeaking !== prev) {
          this.remoteSpeakingCooldowns.set(peerId, isSpeaking);
          const peer = this.peers.get(peerId);
          if (peer) {
            peer.isSpeaking = isSpeaking;
            this.emit({ type: 'speaking', socketId: peerId, isSpeaking });
          }
        }
      }, 100);
    } catch {}
  }

  private stopSpeakingDetection(): void {
    if (this.speakingTimer) { clearInterval(this.speakingTimer); this.speakingTimer = null; }
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
  }
}
