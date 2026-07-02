/**
 * NightMusic — host-configured YouTube track that plays ONLY for idle players
 * (plain citizens, the dead, spectators) during the night phase.
 *
 * - Hidden 1×1 IFrame player (audio only), YouTube IFrame API loaded lazily.
 * - Mobile autoplay: the player pre-initializes MUTED while the game runs
 *   (muted autoplay is always allowed), then unmutes at night. If unmuting is
 *   blocked, a one-tap "🎵 შეეხე მუსიკის ჩასართავად" prompt appears.
 * - Eligibility is decided client-side from the player's OWN role — nothing
 *   about who hears music is ever sent over the wire.
 * - A music failure must never break the game: every player call is guarded.
 */
import { useEffect, useRef, useState } from 'react';
import type { Phase, RoleKey } from '@/types/index';

const NIGHT_PHASES = new Set<Phase>(['night', 'planning_night', 'don_check', 'mafia_kill', 'sheriff_check']);
const VOLUME = 50;

declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeAPI(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

interface Props {
  phase: Phase;
  enabled: boolean;
  videoId: string | null;
  myRole: RoleKey | null;
  amAlive: boolean;
  amSpectator: boolean;
}

export function NightMusic({ phase, enabled, videoId, myRole, amAlive, amSpectator }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const activeVideoRef = useRef<string | null>(null); // track locked at night start
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mutedRef = useRef(false);
  const unlockedRef = useRef(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audible, setAudible] = useState(false);
  mutedRef.current = muted;

  const isNight = NIGHT_PHASES.has(phase);
  const inGame = phase !== 'lobby' && phase !== 'game_over';
  // Idle players only: plain citizens, the dead, spectators. Never role-actors.
  const eligible = enabled && !!videoId && (amSpectator || !amAlive || myRole === 'citizen');

  // Pre-initialize the (muted) player once the game runs — this happens after
  // real user gestures (Ready/Start taps), which unlocks mobile playback.
  useEffect(() => {
    if (!eligible || !inGame || playerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const YT = await loadYouTubeAPI();
        if (cancelled || playerRef.current || !hostRef.current) return;
        const mount = document.createElement('div');
        hostRef.current.appendChild(mount);
        playerRef.current = new YT.Player(mount, {
          width: 1, height: 1, videoId: videoId!,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              readyRef.current = true;
              try {
                const p = playerRef.current;
                p.mute();
                // Muted warm-up play to fully unlock the element on mobile.
                p.playVideo();
                setTimeout(() => {
                  try { if (!activeVideoRef.current) p.pauseVideo(); } catch { /* ignore */ }
                }, 700);
              } catch { /* ignore */ }
            },
            onStateChange: (e: any) => {
              try {
                const p = playerRef.current;
                if (e.data === YT.PlayerState.ENDED && activeVideoRef.current) {
                  p.seekTo(0); p.playVideo(); // loop for the whole night
                }
              } catch { /* ignore */ }
            },
            onError: (e: any) => { console.warn('[NightMusic] video error', e?.data); },
          },
        });
      } catch (e) {
        console.warn('[NightMusic] init failed', e);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, inGame]);

  // Night start → play & unmute; night end (or disable) → fade out & stop.
  useEffect(() => {
    const p = playerRef.current;
    if (isNight && eligible && videoId) {
      activeVideoRef.current = videoId; // lock the track for this night
      setAudible(false);
      try {
        if (!p || !readyRef.current) { setNeedsTap(true); return; }
        if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; }
        p.loadVideoById(activeVideoRef.current);
        p.setVolume(VOLUME);
        if (!mutedRef.current) p.unMute();
        p.playVideo();
        // Verify shortly after: if not audibly playing, offer tap-to-play.
        if (verifyTimer.current) clearTimeout(verifyTimer.current);
        verifyTimer.current = setTimeout(() => {
          try {
            const playing = p.getPlayerState?.() === 1;
            const silent = p.isMuted?.() && !mutedRef.current;
            if (!playing || silent) setNeedsTap(true);
            else setAudible(true);
          } catch { /* ignore */ }
        }, 1500);
      } catch {
        setNeedsTap(true);
      }
    } else {
      // Night over / feature disabled mid-night → short fade out, then stop.
      setNeedsTap(false);
      setAudible(false);
      const wasActive = activeVideoRef.current;
      activeVideoRef.current = null;
      if (verifyTimer.current) { clearTimeout(verifyTimer.current); verifyTimer.current = null; }
      if (p && readyRef.current && wasActive) {
        try {
          let vol = VOLUME;
          if (fadeTimer.current) clearInterval(fadeTimer.current);
          fadeTimer.current = setInterval(() => {
            try {
              vol -= 10;
              if (vol <= 0) {
                if (fadeTimer.current) clearInterval(fadeTimer.current);
                fadeTimer.current = null;
                p.pauseVideo(); p.mute(); p.setVolume(VOLUME);
              } else {
                p.setVolume(vol);
              }
            } catch {
              if (fadeTimer.current) clearInterval(fadeTimer.current);
              fadeTimer.current = null;
            }
          }, 200);
        } catch { /* ignore */ }
      }
    }
  // videoId deliberately NOT a dependency: a link changed mid-night keeps the
  // old track until this night ends; the new one applies next night.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNight, eligible]);

  // Gesture-capture unlock: the first REAL tap anywhere in the game runs a
  // brief unmuted-at-zero-volume play inside the gesture handler. That marks
  // this iframe as user-activated on iOS/Android, so the night-start unmute
  // then succeeds silently — no "tap to play" prompt in practice.
  useEffect(() => {
    if (!eligible || !inGame) return;
    const unlock = () => {
      const p = playerRef.current;
      if (!p || !readyRef.current || unlockedRef.current) return;
      try {
        unlockedRef.current = true;
        const nightNow = !!activeVideoRef.current;
        p.setVolume(nightNow ? VOLUME : 0);
        if (!mutedRef.current) p.unMute();
        p.playVideo();
        if (!nightNow) {
          setTimeout(() => {
            try {
              if (!activeVideoRef.current) { p.pauseVideo(); p.setVolume(VOLUME); }
              else p.setVolume(VOLUME);
            } catch { /* ignore */ }
          }, 250);
        } else {
          setNeedsTap(false);
          setAudible(true);
        }
      } catch { unlockedRef.current = false; }
    };
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('touchend', unlock, true);
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('touchend', unlock, true);
    };
  }, [eligible, inGame]);

  // Full cleanup on unmount (leaving the game screen).
  useEffect(() => () => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
    if (verifyTimer.current) clearTimeout(verifyTimer.current);
    try { playerRef.current?.destroy(); } catch { /* ignore */ }
    playerRef.current = null;
    readyRef.current = false;
  }, []);

  const tapToPlay = () => {
    try {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      p.loadVideoById(activeVideoRef.current ?? videoId);
      p.setVolume(VOLUME);
      p.unMute();
      p.playVideo();
      setMuted(false);
      setNeedsTap(false);
      setAudible(true);
    } catch { /* ignore */ }
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      if (muted) p.unMute(); else p.mute();
      setMuted(!muted);
    } catch { /* ignore */ }
  };

  if (!eligible) return null;

  return (
    <>
      {/* Hidden audio-only player */}
      <div ref={hostRef} aria-hidden
        style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }} />

      {/* Tap-to-play prompt (autoplay blocked) */}
      {isNight && needsTap && (
        <button
          onClick={tapToPlay}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-full font-mono text-[12px] font-bold animate-pulse active:scale-95 transition-transform"
          style={{ background: 'rgba(30,10,60,0.95)', border: '1px solid rgba(192,132,252,0.55)', color: '#c084fc', boxShadow: '0 0 20px rgba(155,0,255,0.35)' }}
        >
          🎵 შეეხე მუსიკის ჩასართავად
        </button>
      )}

      {/* Local mute toggle while music plays */}
      {isNight && !needsTap && audible && (
        <button
          onClick={toggleMute}
          className="fixed bottom-24 left-3 z-[90] px-3 py-2 rounded-full font-mono text-[11px] active:scale-95 transition-transform"
          style={{ background: 'rgba(10,6,26,0.9)', border: '1px solid rgba(255,255,255,0.14)', color: muted ? 'rgba(255,255,255,0.4)' : 'rgba(192,132,252,0.85)' }}
        >
          {muted ? '🔈 ჩართვა' : '🔇 გათიშვა'}
        </button>
      )}
    </>
  );
}
