import { useEffect, useRef, useCallback } from 'react';
import { useCheckersVoice } from '@/hooks/useCheckersVoice';
import { useT } from '@/store/langStore';

interface Props {
  matchId: string;
}

export function CheckersPTTButton({ matchId }: Props) {
  const t = useT();
  const { isTalking, joined, status, startTalk, stopTalk, leave, joinVoice } = useCheckersVoice();
  const talkingRef = useRef(false);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (talkingRef.current) return;
    talkingRef.current = true;
    startTalk(matchId);
  }, [matchId, startTalk]);

  const handleStop = useCallback(() => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    stopTalk(matchId);
  }, [matchId, stopTalk]);

  // Keyboard: Space to talk
  useEffect(() => {
    if (!joined) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !talkingRef.current) {
        e.preventDefault();
        talkingRef.current = true;
        startTalk(matchId);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && talkingRef.current) {
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
  }, [matchId, joined, startTalk, stopTalk]);

  // Stop on window blur or tab hide
  useEffect(() => {
    if (!joined) return;
    const stop = () => {
      if (talkingRef.current) { talkingRef.current = false; stopTalk(matchId); }
    };
    const onVis = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [matchId, joined, stopTalk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { talkingRef.current = false; leave(); };
  }, [leave]);

  const isConnecting = status === 'requesting' || status === 'connecting';
  const isFailed     = status === 'failed';

  // ── Not yet joined: show "Connect Voice" button ──
  // onPointerDown fires in user-gesture context → getUserMedia allowed on iOS Safari
  if (!joined && !isConnecting) {
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); joinVoice(matchId); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
        style={{
          background: 'linear-gradient(135deg, rgba(0,245,255,0.1), rgba(155,0,255,0.07))',
          border: isFailed ? '1px solid rgba(255,80,80,0.4)' : '1px solid rgba(0,245,255,0.28)',
          color: isFailed ? '#ff5050' : 'rgba(0,245,255,0.75)',
        }}
      >
        <span style={{ fontSize: 12 }}>🎤</span>
        <span>{isFailed ? '⚠ Retry' : t.games.checkers.holdToTalk?.replace(/hold.*/i, '') || 'Join Voice'}</span>
      </button>
    );
  }

  // ── Connecting state ──
  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider"
        style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
        <span>⌛</span>
        <span>Connecting…</span>
      </div>
    );
  }

  // ── Joined: normal PTT button ──
  let label: string;
  if (isTalking) {
    label = t.games.checkers.live;
  } else {
    label = t.games.checkers.holdToTalk;
  }

  const glowColor  = isTalking ? 'rgba(0,255,100,0.6)'  : 'rgba(155,0,255,0.3)';
  const borderColor = isTalking ? 'rgba(0,255,100,0.7)' : 'rgba(155,0,255,0.4)';
  const bg = isTalking
    ? 'linear-gradient(135deg, rgba(0,200,80,0.28), rgba(0,255,100,0.16))'
    : 'linear-gradient(135deg, rgba(155,0,255,0.18), rgba(0,245,255,0.10))';

  return (
    <button
      onMouseDown={handleStart}
      onMouseUp={handleStop}
      onMouseLeave={handleStop}
      onTouchStart={handleStart}
      onTouchEnd={handleStop}
      onTouchCancel={handleStop}
      onPointerCancel={handleStop}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        color: isTalking ? '#00ff64' : 'rgba(255,255,255,0.6)',
        boxShadow: isTalking ? `0 0 12px ${glowColor}, 0 0 4px ${glowColor}` : 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: 12 }}>📻</span>
      <span>{label}</span>
      {isTalking && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: '#00ff64', boxShadow: '0 0 6px #00ff64', animation: 'pulse 1s infinite' }}
        />
      )}
    </button>
  );
}
