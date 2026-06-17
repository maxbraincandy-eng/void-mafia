import { useEffect, useRef, useCallback } from 'react';
import { useLudoVoice } from '@/hooks/useLudoVoice';

interface Props {
  matchId: string;
  myName: string;
}

export function LudoPTTButton({ matchId, myName }: Props) {
  const { isTalking, status, startTalk, stopTalk, leave } = useLudoVoice();
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

  // Space key PTT
  useEffect(() => {
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
  }, [matchId, myName, startTalk, stopTalk]);

  // Stop on blur / tab hide
  useEffect(() => {
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
  }, [matchId, stopTalk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { talkingRef.current = false; leave(); };
  }, [leave]);

  const isConnecting = status === 'requesting' || status === 'connecting';
  const isFailed = status === 'failed';
  const label = isTalking ? '🟢 LIVE' : isConnecting ? '…' : '📻 HOLD';

  const border = isTalking
    ? 'rgba(0,255,100,0.7)'
    : isFailed ? 'rgba(255,80,80,0.5)'
    : 'rgba(0,245,255,0.3)';

  const bg = isTalking
    ? 'linear-gradient(135deg,rgba(0,200,80,0.25),rgba(0,255,100,0.15))'
    : 'linear-gradient(135deg,rgba(0,245,255,0.1),rgba(192,132,252,0.08))';

  const color = isTalking ? '#00ff64' : isFailed ? '#ff5050' : 'rgba(0,245,255,0.7)';

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
        display:'flex', alignItems:'center', gap:6,
        padding:'6px 12px', borderRadius:20,
        fontFamily:'monospace', fontSize:10, fontWeight:700,
        letterSpacing:1, textTransform:'uppercase',
        background:bg, border:`1px solid ${border}`, color,
        boxShadow: isTalking ? `0 0 14px rgba(0,255,100,0.5)` : 'none',
        cursor:'pointer', userSelect:'none', touchAction:'none',
        transition:'all 0.15s',
      }}
    >
      {label}
      {isTalking && (
        <span style={{ width:6,height:6,borderRadius:'50%',background:'#00ff64',
                        boxShadow:'0 0 6px #00ff64', flexShrink:0,
                        animation:'pulse 0.8s ease-in-out infinite' }} />
      )}
    </button>
  );
}
