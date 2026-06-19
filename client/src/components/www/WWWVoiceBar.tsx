import type { useWWWVoice } from '@/hooks/useWWWVoice';

interface Props {
  voice: ReturnType<typeof useWWWVoice>;
  matchId: string;
  myRole: string;
}

export function WWWVoiceBar({ voice, matchId, myRole }: Props) {
  const isSpectator = myRole === 'spectator';
  const canSpeak = !isSpectator;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5"
      style={{
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid rgba(0,245,255,0.12)',
        minHeight: 36,
      }}
    >
      {/* Status indicator */}
      {voice.joined ? (
        <span
          className="flex items-center gap-1 font-mono text-[10px]"
          style={{ color: '#00f5ff' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#00f5ff', boxShadow: '0 0 4px #00f5ff' }}
          />
          ხმა დაკავშირებულია
        </span>
      ) : isSpectator ? (
        <span className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          მხოლოდ უსმენ
        </span>
      ) : (
        <button
          onClick={() => voice.joinVoice(matchId)}
          className="font-mono text-[10px] px-2 py-0.5 rounded transition-all active:scale-95"
          style={{
            background: 'rgba(0,245,255,0.08)',
            border: '1px solid rgba(0,245,255,0.2)',
            color: 'rgba(0,245,255,0.6)',
          }}
        >
          + Voice
        </button>
      )}

      {/* PTT button */}
      {voice.joined && canSpeak && (
        <button
          onPointerDown={() => voice.startTalk(matchId)}
          onPointerUp={() => voice.stopTalk(matchId)}
          onPointerLeave={() => voice.stopTalk(matchId)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider select-none transition-all active:scale-95"
          style={{
            background: voice.isTalking
              ? 'rgba(0,245,255,0.25)'
              : 'rgba(0,245,255,0.06)',
            border: voice.isTalking
              ? '1px solid rgba(0,245,255,0.7)'
              : '1px solid rgba(0,245,255,0.2)',
            color: voice.isTalking ? '#00f5ff' : 'rgba(0,245,255,0.4)',
            boxShadow: voice.isTalking ? '0 0 8px rgba(0,245,255,0.3)' : 'none',
          }}
        >
          {voice.isTalking ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: '#00f5ff' }}
              />
              ვლაპარაკობ
            </>
          ) : (
            <>🎤 PTT</>
          )}
        </button>
      )}

      {/* Peers count */}
      {voice.joined && voice.peers.length > 0 && (
        <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {voice.peers.length} peer{voice.peers.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
