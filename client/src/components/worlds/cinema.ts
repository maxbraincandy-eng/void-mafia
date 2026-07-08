// ── Premium Worlds — shared cinema (YouTube on the 3D screen) ─────────
// A YouTube IFrame-API player laid over the screen's projected viewport rect
// (see engine.getScreenRect) so the video appears to play on the 3D screen.
// Synced across everyone via the server's per-world TV state.
import type { ScreenRect } from './engine';

export interface TVState { videoId: string; title: string; startedAt: number; position: number; isPlaying: boolean; byName: string; }

function loadYTApi(): Promise<void> {
  return new Promise(resolve => {
    const w = window as any;
    if (w.YT?.Player) { resolve(); return; }
    if (!document.getElementById('vm-yt-iframe-api')) {
      const s = document.createElement('script'); s.id = 'vm-yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    const iv = setInterval(() => { if (w.YT?.Player) { clearInterval(iv); resolve(); } }, 100);
    setTimeout(() => { clearInterval(iv); resolve(); }, 8000);
  });
}

export class WorldCinema {
  private container: HTMLDivElement;
  private player: any = null;
  private ready = false;
  private pending: TVState | null = null;
  private curVid = '';
  private active = false;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.container.style.pointerEvents = 'none';
    loadYTApi().then(() => {
      const w = window as any; if (!w.YT?.Player) return;
      const div = document.createElement('div'); this.container.appendChild(div);
      this.player = new w.YT.Player(div, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, disablekb: 1 },
        events: { onReady: () => { this.ready = true; if (this.pending) { const p = this.pending; this.pending = null; this.setState(p); } } },
      });
    });
  }

  setState(tv: TVState | null) {
    if (!tv) { this.active = false; this.curVid = ''; try { this.player?.stopVideo?.(); } catch { /* ignore */ } return; }
    this.active = true;
    if (!this.ready) { this.pending = tv; return; }
    const pos = tv.isPlaying ? (Date.now() - tv.startedAt) / 1000 : tv.position;
    try {
      if (this.curVid !== tv.videoId) { this.curVid = tv.videoId; this.player.loadVideoById({ videoId: tv.videoId, startSeconds: Math.max(0, pos) }); }
      else { const cur = this.player.getCurrentTime?.() ?? 0; if (Math.abs(cur - pos) > 2.5) this.player.seekTo?.(Math.max(0, pos), true); }
      if (tv.isPlaying) this.player.playVideo?.(); else this.player.pauseVideo?.();
    } catch { /* ignore */ }
  }

  resume() { try { if (this.active) this.player?.playVideo?.(); } catch { /* ignore */ } }

  // Distance-attenuated volume (0..100) so the TV is only audible near it.
  private curVol = -1;
  setVolume(v: number) {
    const vol = Math.max(0, Math.min(100, Math.round(v)));
    if (Math.abs(vol - this.curVol) < 3) return;   // avoid spamming the iframe
    this.curVol = vol;
    try { if (vol <= 0) this.player?.mute?.(); else { this.player?.unMute?.(); this.player?.setVolume?.(vol); } } catch { /* ignore */ }
  }

  // Position the video over the screen's projected rect; move offscreen (but
  // keep it alive/playing for audio) when the screen isn't in view.
  layout(rect: ScreenRect | null) {
    if (!this.active) { this.container.style.transform = 'translate(-99999px,0)'; return; }
    if (!rect) { this.container.style.transform = 'translate(-99999px,0)'; return; }
    this.container.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    this.container.style.width = Math.round(rect.width) + 'px';
    this.container.style.height = Math.round(rect.height) + 'px';
  }

  dispose() { try { this.player?.destroy?.(); } catch { /* ignore */ } }
}

// Extract a YouTube video id from a URL or bare id.
export function ytVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
