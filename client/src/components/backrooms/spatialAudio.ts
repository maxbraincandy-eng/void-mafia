// ── Backrooms spatial audio ──────────────────────────────────────────
// Turns flat WebRTC voice into positional horror audio: quieter with distance,
// panned left/right, low-pass "muffled" through walls, and wetter with hallway
// reverb the further/more-occluded a speaker is.
//
// Primary path routes each peer's remote MediaStream through a Web Audio graph.
// If that isn't supported (older Safari where createMediaStreamSource on a
// remote stream fails), it transparently falls back to attenuating the peer's
// <audio> element volume — so voice is NEVER silent, just less spatial.

import type { WebRTCSession } from '@/services/webrtcService';

const MAX_DIST = 34;  // beyond this a voice is inaudible
const REF_DIST = 3;   // within this it's at full volume

export interface SpatialListener { x: number; z: number; yaw: number; }
export interface SpatialPeer { socketId: string; x: number; z: number; occ: number; }

interface Chain {
  source: MediaStreamAudioSourceNode;
  lowpass: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  send: GainNode;
  streamId: string;
}

export class BackroomsSpatial {
  private ctx: AudioContext | null = null;
  private convolver: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private chains = new Map<string, Chain>();
  private session: WebRTCSession;
  private webAudioOk = true;

  constructor(session: WebRTCSession) {
    this.session = session;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) { this.webAudioOk = false; return; }
      const ctx: AudioContext = new Ctx();
      this.ctx = ctx;
      this.convolver = ctx.createConvolver();
      this.convolver.buffer = this.makeImpulse(1.9, 2.4);
      this.wet = ctx.createGain(); this.wet.gain.value = 0.85;
      this.convolver.connect(this.wet).connect(ctx.destination);
      // Whenever the context flips running↔suspended, re-route: the spatial
      // Web-Audio graph is only the audio source while the context is actually
      // RUNNING. If it's suspended (e.g. autoplay policy — the world auto-joins
      // voice without a user gesture), we keep the peers' plain <audio> elements
      // UNMUTED so voice is still heard (flat, non-spatial) instead of silent.
      ctx.addEventListener?.('statechange', () => this.applyElementRouting());
    } catch { this.webAudioOk = false; }
  }

  /** Try to resume the context (call from a user gesture); re-route after. */
  resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume?.().then(() => this.applyElementRouting()).catch(() => {});
    else this.applyElementRouting();
  }

  /** Mute peer <audio> elements only while the Web-Audio graph is live. */
  private applyElementRouting() {
    const running = this.ctx?.state === 'running';
    for (const id of this.chains.keys()) this.session.setPeerElementMuted(id, running);
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private ensureChain(socketId: string): boolean {
    if (!this.webAudioOk || !this.ctx || !this.convolver) return false;
    const stream = this.session.getRemoteStream(socketId);
    if (!stream || stream.getAudioTracks().length === 0) return false;
    const existing = this.chains.get(socketId);
    if (existing && existing.streamId === stream.id) return true;
    if (existing) this.teardownChain(socketId);
    try {
      const source = this.ctx.createMediaStreamSource(stream);
      const lowpass = this.ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 20000;
      const panner = this.ctx.createStereoPanner();
      const gain = this.ctx.createGain(); gain.gain.value = 0;
      const send = this.ctx.createGain(); send.gain.value = 0;
      source.connect(lowpass); lowpass.connect(panner); panner.connect(gain);
      gain.connect(this.ctx.destination);
      gain.connect(send); send.connect(this.convolver);
      this.chains.set(socketId, { source, lowpass, panner, gain, send, streamId: stream.id });
      // Only silence the plain <audio> element once the graph is actually
      // running; while the context is suspended the element stays audible so
      // voice is never lost (see applyElementRouting / the statechange handler).
      this.session.setPeerElementMuted(socketId, this.ctx.state === 'running');
      return true;
    } catch {
      this.webAudioOk = false; // remote-stream Web Audio unsupported → element fallback
      return false;
    }
  }

  private teardownChain(socketId: string) {
    const c = this.chains.get(socketId); if (!c) return;
    try { c.source.disconnect(); c.lowpass.disconnect(); c.panner.disconnect(); c.gain.disconnect(); c.send.disconnect(); } catch { /* ignore */ }
    this.chains.delete(socketId);
    this.session.setPeerElementMuted(socketId, false);
  }

  update(listener: SpatialListener, peers: SpatialPeer[]) {
    const cosY = Math.cos(listener.yaw), sinY = Math.sin(listener.yaw);
    for (const p of peers) {
      const dx = p.x - listener.x, dz = p.z - listener.z;
      const dist = Math.hypot(dx, dz);
      let vol = dist <= REF_DIST ? 1 : Math.max(0, 1 - (dist - REF_DIST) / (MAX_DIST - REF_DIST));
      vol = vol * vol;                     // perceptual rolloff
      vol *= (1 - p.occ * 0.55);           // walls also drop level

      if (this.ensureChain(p.socketId)) {
        const c = this.chains.get(p.socketId)!;
        // pan = lateral component of the direction in the listener's frame
        const pan = dist > 0.001 ? (dx * cosY - dz * sinY) / dist : 0;
        c.panner.pan.value = Math.max(-1, Math.min(1, pan));
        c.gain.gain.value = vol;
        const distMuffle = 1 - Math.min(1, dist / MAX_DIST) * 0.4;
        const cutoff = 600 + (18000 - 600) * (1 - p.occ) * distMuffle;
        c.lowpass.frequency.value = Math.max(300, cutoff);
        c.send.gain.value = Math.min(0.6, (dist / MAX_DIST) * 0.4 + p.occ * 0.25);
      } else {
        this.session.setPeerElementMuted(p.socketId, false);
        this.session.setPeerVolume(p.socketId, vol);
      }
    }
    const ids = new Set(peers.map(p => p.socketId));
    for (const id of [...this.chains.keys()]) if (!ids.has(id)) this.teardownChain(id);
  }

  dispose() {
    for (const id of [...this.chains.keys()]) this.teardownChain(id);
    try { this.wet?.disconnect(); this.convolver?.disconnect(); } catch { /* ignore */ }
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
  }
}
