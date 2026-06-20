import { useState, useEffect, useRef, useCallback } from 'react';
import { useCheckersVoice } from '@/hooks/useCheckersVoice';
import { useT } from '@/store/langStore';

interface Props {
  matchId: string;
}

export function CheckersPTTButton({ matchId }: Props) {
  const t = useT();
  const { isTalking, joined, status, startTalk, stopTalk, leave, joinVoice } = useCheckersVoice();
  const talkingRef = useRef(false);
  const [locked, setLocked] = useState(false);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (talkingRef.current || locked) return;
    talkingRef.current = true;
    startTalk(matchId);
  }, [matchId, startTalk, locked]);

  const handleStop = useCallback(() => {
    if (!talkingRef.current || locked) return;
    talkingRef.current = false;
    stopTalk(matchId);
  }, [matchId, stopTalk, locked]);

  const handleToggleLock = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (locked) {
      setLocked(false);
      talkingRef.current = false;
      stopTalk(matchId);
    } else {
      setLocked(true);
      talkingRef.current = true;
      startTalk(matchId);
    }
  }, [locked, matchId, startTalk, stopTalk]);

  // Keyboard: Space to PTT
  useEffect(() => {
    if (!joined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !talkingRef.current && !locked) {
        e.preventDefault();
        talkingRef.current = true;
        startTalk(matchId);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && talkingRef.current && !locked) {
        e.preventDefault();
        talkingRef.current = false;
        stopTalk(matchId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [matchId, joined, startTalk, stopTalk, locked]);

  // Stop on window blur / tab hide (only if not locked)
  useEffect(() => {
    if (!joined) return;
    const stop = () => {
      if (talkingRef.current && !locked) { talkingRef.current = false; stopTalk(matchId); }
    };
    const onVis = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [matchId, joined, stopTalk, locked]);

  // Cleanup on unmount — also release lock
  useEffect(() => {
    return () => { talkingRef.current = false; setLocked(false); leave(); };
  }, [leave]);

  const isConnecting = status === 'requesting' || status === 'connecting';
  const isFailed     = status === 'failed';

  // ── Not yet joined: show "Connect Voice" ──
  if (!joined && !isConnecting) {
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); joinVoice(matchId); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
        style={{
          background: 'linear-gradient(135deg, rgba(0,245,255,0.1), rgba(155,0,255,0.07))',
          border: isFailed ? '1px solid rgba(255,80,80,0.4)' : '1px solid rgba(0,245,255,0.28)',
          color: isFailed ? '#ff5050' : 'rgba(0,245,255,0.75)',
        }}
      >
        <span style={{ fontSize: 12 }}>🎤</span>
        <span>{isFailed ? '⚠ Retry' : 'Join Voice'}</span>
      </button>
    );
  }

  // ── Connecting state ──
  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider"
        style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
        <span>⌛</span>
        <span>Connecting…</span>
      </div>
    );
  }

  // ── Joined: PTT + Toggle buttons ──
  const pttActive   = isTalking && !locked;
  const pttBg       = pttActive
    ? 'linear-gradient(135deg, rgba(0,200,80,0.28), rgba(0,255,100,0.16))'
    : 'linear-gradient(135deg, rgba(155,0,255,0.18), rgba(0,245,255,0.10))';
  const pttBorder   = pttActive ? 'rgba(0,255,100,0.7)' : 'rgba(155,0,255,0.4)';
  const pttColor    = pttActive ? '#00ff64' : 'rgba(255,255,255,0.6)';

  const lockBg     = locked
    ? 'linear-gradient(135deg, rgba(0,200,80,0.28), rgba(0,255,100,0.16))'
    : 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))';
  const lockBorder = locked ? 'rgba(0,255,100,0.7)' : 'rgba(255,255,255,0.15)';
  const lockColor  = locked ? '#00ff64' : 'rgba(255,255,255,0.4)';

  return (
    <div className="flex items-center gap-2">
      {/* PTT — hold to talk */}
      <button
        onMouseDown={handleStart}
        onMouseUp={handleStop}
        onMouseLeave={handleStop}
        onTouchStart={handleStart}
        onTouchEnd={handleStop}
        onTouchCancel={handleStop}
        onPointerCancel={handleStop}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
        style={{
          background: pttBg,
          border: `1px solid ${pttBorder}`,
          color: pttColor,
          boxShadow: pttActive ? `0 0 12px rgba(0,255,100,0.5)` : 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12 }}>📻</span>
        <span>{pttActive ? t.games.checkers.live : t.games.checkers.holdToTalk}</span>
        {pttActive && (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#00ff64', boxShadow: '0 0 6px #00ff64', animation: 'pulse 1s infinite' }} />
        )}
      </button>

      {/* Toggle — click once to lock mic on, click again to release */}
      <button
        onMouseDown={handleToggleLock}
        onTouchStart={handleToggleLock}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[12px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
        style={{
          background: lockBg,
          border: `1px solid ${lockBorder}`,
          color: lockColor,
          boxShadow: locked ? `0 0 12px rgba(0,255,100,0.5)` : 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 12 }}>{locked ? '🔴' : '🔓'}</span>
        <span>{locked ? 'Live' : 'Lock'}</span>
        {locked && (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#00ff64', boxShadow: '0 0 6px #00ff64', animation: 'pulse 1s infinite' }} />
        )}
      </button>
    </div>
  );
}
