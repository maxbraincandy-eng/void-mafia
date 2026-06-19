import { useCallback } from 'react';
import type { useWWWVoice } from '@/hooks/useWWWVoice';

interface Props {
  voice: ReturnType<typeof useWWWVoice>;
  matchId: string;
}

export function WWWVoiceBar({ voice, matchId }: Props) {
  const handleMouseDown = useCallback(() => {
    voice.startTalk(matchId);
  }, [voice, matchId]);

  const handleMouseUp = useCallback(() => {
    voice.stopTalk(matchId);
  }, [voice, matchId]);

  const handleJoinVoice = useCallback(() => {
    voice.joinVoice(matchId);
  }, [voice, matchId]);

  return (
    <div
      className="flex-shrink-0 flex items-center gap-3 px-4 py-2 border-b"
      style={{ borderColor: 'rgba(155,0,255,0.15)', background: 'rgba(10,6,28,0.9)' }}
    >
      {/* Status indicator */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {voice.joined && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: voice.isTalking ? '#00ff64' : 'rgba(0,255,100,0.4)',
                boxShadow: voice.isTalking ? '0 0 6px rgba(0,255,100,0.8)' : undefined,
                animation: voice.isTalking ? 'pulse 1s infinite' : undefined,
              }}
            />
            <span className="font-mono text-[10px]" style={{ color: voice.isTalking ? '#00ff64' : 'rgba(255,255,255,0.4)' }}>
              {voice.isTalking ? 'საუბრობს' : 'ხმა დაკავშირებულია'}
            </span>
          </div>
        )}
        {!voice.joined && voice.status !== 'connecting' && voice.status !== 'requesting' && (
          <button
            onClick={handleJoinVoice}
            className="font-mono text-[10px] px-2 py-1 rounded-lg transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
          >
            ხმაში შესვლა
          </button>
        )}
        {(voice.status === 'connecting' || voice.status === 'requesting') && (
          <span className="font-mono text-[10px] text-white/30">კავშირი…</span>
        )}
      </div>

      {/* Push-to-talk button */}
      {voice.joined && (
        <button
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[10px] uppercase tracking-wider select-none transition-all active:scale-95"
          style={{
            background: voice.isTalking
              ? 'rgba(0,255,100,0.2)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${voice.isTalking ? 'rgba(0,255,100,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: voice.isTalking ? '#00ff64' : 'rgba(255,255,255,0.4)',
          }}
        >
          <span>🎤</span>
          <span>დააჭირე</span>
        </button>
      )}
    </div>
  );
}
