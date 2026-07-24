import { useEffect, useRef, useState, useCallback } from 'react';
import type { WpSource } from '@/types/watchParty';

/**
 * SyncedPlayer — plays one WpSource and keeps its playhead locked to the
 * server's authoritative state.
 *
 * The server sends { playing, positionSec, rate, serverTime }; the store stamps
 * `receivedAt` (performance.now) on arrival. The target playhead is extrapolated
 * from that, and a correction loop nudges the underlying player whenever it
 * drifts past a threshold. The host additionally gets a control bar that emits
 * play / pause / seek / rate back to the server.
 *
 * Fully controllable providers: youtube, direct video (mp4/hls), vimeo.
 * twitch / tiktok / embed render as a plain iframe (display only, no sync).
 */

interface PlayerAdapter {
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  getTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
  destroy: () => void;
}

interface Props {
  source: WpSource | null;
  playing: boolean;
  positionSec: number;
  receivedAt: number;
  rate: number;
  isHost: boolean;
  onPlay: (pos: number) => void;
  onPause: (pos: number) => void;
  onSeek: (pos: number) => void;
  onRate: (r: number) => void;
}

// ── External script loaders (singletons) ──────────────────────────────
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>(resolve => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

let vimeoApiPromise: Promise<void> | null = null;
function loadVimeoApi(): Promise<void> {
  if ((window as any).Vimeo?.Player) return Promise.resolve();
  if (vimeoApiPromise) return vimeoApiPromise;
  vimeoApiPromise = new Promise<void>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('vimeo api failed'));
    document.head.appendChild(tag);
  });
  return vimeoApiPromise;
}

const DRIFT_HARD = 1.0;   // seconds — correct immediately on a fresh server update
const DRIFT_SOFT = 1.6;   // seconds — correct during the periodic drift loop

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`;
}

export function SyncedPlayer(props: Props) {
  const { source, playing, positionSec, receivedAt, rate, isHost } = props;
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adapterRef = useRef<PlayerAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [needGesture, setNeedGesture] = useState(false);
  // Host control-bar state (polled from the adapter)
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const scrubbing = useRef(false);

  const targetPos = useCallback((): number => {
    if (!playing) return positionSec;
    return positionSec + ((performance.now() - receivedAt) / 1000) * rate;
  }, [playing, positionSec, receivedAt, rate]);

  // ── Build / tear down the adapter when the source changes ──────────
  useEffect(() => {
    setReady(false);
    setNeedGesture(false);
    adapterRef.current?.destroy();
    adapterRef.current = null;
    if (!source || !source.synced) return;

    let cancelled = false;
    const startAt = () => targetPos();

    if (source.provider === 'youtube') {
      loadYouTubeApi().then(() => {
        if (cancelled || !mountRef.current) return;
        const host = document.createElement('div');
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(host);
        const YT = (window as any).YT;
        const player = new YT.Player(host, {
          videoId: source.refId,
          playerVars: { controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, start: Math.floor(startAt()) },
          events: {
            onReady: () => {
              if (cancelled) return;
              adapterRef.current = {
                play: () => player.playVideo(),
                pause: () => player.pauseVideo(),
                seek: (t) => player.seekTo(t, true),
                setRate: (r) => { try { player.setPlaybackRate(r); } catch { /* ignore */ } },
                getTime: () => player.getCurrentTime?.() ?? 0,
                getDuration: () => player.getDuration?.() ?? 0,
                isPlaying: () => player.getPlayerState?.() === 1,
                destroy: () => { try { player.destroy(); } catch { /* ignore */ } },
              };
              setReady(true);
            },
          },
        });
      });
    } else if (source.provider === 'vimeo') {
      loadVimeoApi().then(() => {
        if (cancelled || !mountRef.current) return;
        const host = document.createElement('div');
        mountRef.current.innerHTML = '';
        mountRef.current.appendChild(host);
        const Vimeo = (window as any).Vimeo;
        const player = new Vimeo.Player(host, { id: source.refId, controls: false, playsinline: true, responsive: true });
        player.ready().then(() => {
          if (cancelled) return;
          adapterRef.current = {
            play: () => player.play().catch(() => setNeedGesture(true)),
            pause: () => player.pause().catch(() => {}),
            seek: (t) => player.setCurrentTime(t).catch(() => {}),
            setRate: (r) => player.setPlaybackRate(r).catch(() => {}),
            getTime: () => 0, // vimeo time is async; the correction loop reads via cache below
            getDuration: () => 0,
            isPlaying: () => true,
            destroy: () => { try { player.destroy(); } catch { /* ignore */ } },
          };
          // Cache async time/duration for the sync loop + control bar.
          player.getDuration().then((d: number) => setDur(d)).catch(() => {});
          const iv = setInterval(() => {
            player.getCurrentTime().then((t: number) => { (adapterRef.current as any)._t = t; if (!scrubbing.current) setCur(t); }).catch(() => {});
          }, 500);
          (adapterRef.current as any).getTime = () => (adapterRef.current as any)._t ?? 0;
          (adapterRef.current as any)._iv = iv;
          const origDestroy = adapterRef.current.destroy;
          adapterRef.current.destroy = () => { clearInterval(iv); origDestroy(); };
          player.setCurrentTime(startAt()).catch(() => {});
          setReady(true);
        });
      }).catch(() => { /* vimeo failed to load — leave unsynced */ });
    } else if (source.provider === 'video') {
      const v = videoRef.current;
      if (v) {
        v.src = source.refId;
        v.currentTime = startAt();
        adapterRef.current = {
          play: () => v.play().catch(() => setNeedGesture(true)),
          pause: () => v.pause(),
          seek: (t) => { try { v.currentTime = t; } catch { /* ignore */ } },
          setRate: (r) => { v.playbackRate = r; },
          getTime: () => v.currentTime,
          getDuration: () => v.duration || 0,
          isPlaying: () => !v.paused && !v.ended,
          destroy: () => { v.pause(); v.removeAttribute('src'); v.load(); },
        };
        setReady(true);
      }
    }

    return () => { cancelled = true; adapterRef.current?.destroy(); adapterRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.provider, source?.refId, source?.synced]);

  // ── Apply server state on every fresh update ───────────────────────
  useEffect(() => {
    const a = adapterRef.current;
    if (!a || !ready) return;
    a.setRate(rate);
    const t = targetPos();
    if (Math.abs(a.getTime() - t) > DRIFT_HARD) a.seek(t);
    if (playing && !a.isPlaying()) { a.play(); }
    if (!playing && a.isPlaying()) { a.pause(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, positionSec, receivedAt, rate]);

  // ── Periodic drift correction + control-bar polling ────────────────
  useEffect(() => {
    if (!ready) return;
    const iv = setInterval(() => {
      const a = adapterRef.current;
      if (!a) return;
      if (!scrubbing.current) { setCur(a.getTime()); setDur(a.getDuration()); }
      if (playing) {
        const t = targetPos();
        if (Math.abs(a.getTime() - t) > DRIFT_SOFT) a.seek(t);
        if (!a.isPlaying()) { /* blocked autoplay */ setNeedGesture(true); }
      }
    }, 1500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, positionSec, receivedAt, rate]);

  const resumeByGesture = () => {
    setNeedGesture(false);
    const a = adapterRef.current;
    if (a) { a.seek(targetPos()); a.play(); }
  };

  // ── Host controls ──────────────────────────────────────────────────
  const togglePlay = () => {
    const a = adapterRef.current; if (!a) return;
    if (playing) props.onPause(a.getTime());
    else props.onPlay(a.getTime());
  };
  const onScrubStart = () => { scrubbing.current = true; };
  const onScrub = (val: number) => { setCur(val); };
  const onScrubEnd = (val: number) => {
    scrubbing.current = false;
    adapterRef.current?.seek(val);
    props.onSeek(val);
  };
  const resyncEveryone = () => {
    const a = adapterRef.current; if (!a) return;
    props.onSeek(a.getTime());
  };

  // ── Render ─────────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center gap-3 px-6" style={{ background: '#000' }}>
        <div className="text-5xl opacity-70">🎬</div>
        <p className="font-display text-lg text-white/80 font-bold">ჯერ არაფერი უკრავს</p>
        <p className="font-mono text-[12px] text-white/40 max-w-xs">
          {isHost ? 'ჩააგდე ლინკი ქვემოთ — YouTube, ვიდეო-ფაილი, Vimeo…' : 'ჰოსტი მალე ჩართავს ვიდეოს.'}
        </p>
      </div>
    );
  }

  // Unsynced providers → plain embed
  if (!source.synced) {
    return (
      <div className="w-full h-full relative" style={{ background: '#000' }}>
        <UnsyncedEmbed source={source} />
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md font-mono text-[10px] uppercase tracking-wider"
          style={{ background: 'rgba(0,0,0,0.6)', color: '#ffd34d', border: '1px solid rgba(255,211,77,0.3)' }}>
          სინქრონის გარეშე · {source.provider}
        </div>
      </div>
    );
  }

  const RATES = [0.5, 1, 1.25, 1.5, 2];

  return (
    <div className="w-full h-full relative flex flex-col" style={{ background: '#000' }}>
      <div className="flex-1 relative min-h-0">
        {source.provider === 'video'
          ? <video ref={videoRef} playsInline className="w-full h-full" style={{ objectFit: 'contain', background: '#000' }} />
          : <div ref={mountRef} className="w-full h-full [&>*]:w-full [&>*]:h-full" />}

        {needGesture && (
          <button onClick={resumeByGesture}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
            <span className="text-5xl">▶️</span>
            <span className="font-display text-white font-bold">დააჭირე დასაკრავად</span>
            <span className="font-mono text-[11px] text-white/50">ბრაუზერმა ავტომატური დაკვრა შეაჩერა</span>
          </button>
        )}
      </div>

      {/* Host control bar */}
      {isHost && (
        <div className="flex-shrink-0 px-3 py-2 flex items-center gap-3"
          style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.9), rgba(0,0,0,0.6))', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={togglePlay} className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            {playing ? '⏸' : '▶️'}
          </button>
          <span className="font-mono text-[11px] text-white/70 tabular-nums flex-shrink-0">{fmt(cur)}</span>
          <input type="range" min={0} max={Math.max(dur, 1)} step={0.1} value={Math.min(cur, dur || cur)}
            onMouseDown={onScrubStart} onTouchStart={onScrubStart}
            onChange={e => onScrub(Number(e.target.value))}
            onMouseUp={e => onScrubEnd(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={e => onScrubEnd(Number((e.target as HTMLInputElement).value))}
            className="flex-1 accent-red-500 h-1 cursor-pointer" />
          <span className="font-mono text-[11px] text-white/40 tabular-nums flex-shrink-0">{fmt(dur)}</span>
          <select value={rate} onChange={e => props.onRate(Number(e.target.value))}
            className="bg-white/10 text-white/80 font-mono text-[11px] rounded px-1 py-0.5 flex-shrink-0 outline-none">
            {RATES.map(r => <option key={r} value={r} className="bg-neutral-900">{r}×</option>)}
          </select>
          <button onClick={resyncEveryone} title="ყველა ჩემთან სინქრონში"
            className="px-2 h-8 rounded-lg font-mono text-[10px] uppercase tracking-wider flex-shrink-0"
            style={{ background: 'rgba(255,59,71,0.15)', color: '#ff8a92', border: '1px solid rgba(255,59,71,0.3)' }}>
            🔁 სინქ
          </button>
        </div>
      )}
    </div>
  );
}

// ── Unsynced embed (twitch / tiktok / generic) ────────────────────────
function UnsyncedEmbed({ source }: { source: WpSource }) {
  let src = source.raw;
  if (source.provider === 'twitch') {
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'voidmafia.one';
    if (source.refId.startsWith('video:')) src = `https://player.twitch.tv/?video=${source.refId.slice(6)}&parent=${parent}`;
    else src = `https://player.twitch.tv/?channel=${source.refId.slice(8)}&parent=${parent}`;
  } else if (source.provider === 'tiktok') {
    src = `https://www.tiktok.com/embed/v2/${source.refId}`;
  }
  return (
    <iframe
      src={src}
      title={source.title}
      className="w-full h-full"
      style={{ border: 0, background: '#000' }}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}
