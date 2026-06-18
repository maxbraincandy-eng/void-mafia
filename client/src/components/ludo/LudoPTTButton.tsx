import { useEffect, useRef, useCallback } from 'react';
import { useLudoVoice } from '@/hooks/useLudoVoice';

interface Props {
  matchId: string;
  myName: string;
}

export function LudoPTTButton({ matchId, myName }: Props) {
  const { isTalking, status, joined, startTalk, stopTalk, leave, joinVoice } = useLudoVoice();
  const talkingRef = useRef(false);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (talkingRef.current) return;
    talkingRef.current = true;
    startTalk(matchId, myName);
  }, [matchId, myName, startTalk]);

  const handleStop = useCallback(() => {
    if (!talkingRef.current) return;
    talkingRef.current = false;
    stopTalk(matchId);
  }, [matchId, stopTalk]);

  // Space key PTT — only active when joined
  useEffect(() => {
    if (!joined) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !talkingRef.current) {
        e.preventDefault();
        talkingRef.current = true;
        startTalk(matchId, myName);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && talkingRef.current) {
        e.preventDefault();
        talkingRef.current = false;
        stopTalk(matchId);
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [matchId, myName, joined, startTalk, stopTalk]);

  // Stop on blur / tab hide
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
  if (!joined && !isConnecting) {
    return (
      <button
        onPointerDown={(e) => { e.preventDefault(); joinVoice(matchId, myName); }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider select-none touch-none transition-all active:scale-95"
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
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase tracking-wider"
        style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }}>
        <span>⌛</span>
        <span>Connecting…</span>
      </div>
    );
  }

  // ── Joined: normal PTT button ──
  const label = isTalking ? '🟢 LIVE' : '📻 HOLD';

  return (
    <button
      onMouseDown={handleStart}
      onMouseUp={handleStop}
      onMouseLeave={handleStop}
      onTouchStart={handleStart}
      onTouchEnd={handleStop}
      onTouchCancel={handleStop}
      onPointerCancel={handleStop}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20,
        fontFamily: 'monospace', fontSize: 10, fontWeight: 700,
        letterSpacing: 1, textTransform: 'uppercase',
        background: isTalking
          ? 'linear-gradient(135deg,rgba(0,200,80,0.25),rgba(0,255,100,0.15))'
          : 'linear-gradient(135deg,rgba(155,0,255,0.18),rgba(0,245,255,0.10))',
        border: `1px solid ${isTalking ? 'rgba(0,255,100,0.7)' : 'rgba(155,0,255,0.4)'}`,
        color: isTalking ? '#00ff64' : 'rgba(255,255,255,0.6)',
        boxShadow: isTalking ? '0 0 14px rgba(0,255,100,0.5)' : 'none',
        cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        transition: 'all 0.15s',
      }}
    >
      {label}
      {isTalking && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: '#00ff64',
          boxShadow: '0 0 6px #00ff64', flexShrink: 0,
          animation: 'pulse 0.8s ease-in-out infinite',
        }} />
      )}
    </button>
  );
}
