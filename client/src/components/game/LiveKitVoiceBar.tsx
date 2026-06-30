/**
 * LiveKitVoiceBar — minimal mic UI driven by the LiveKit game hook.
 *
 * This is the LiveKit voice path. GamePage mounts it only when the server
 * reports LiveKit is configured (LIVEKIT_* env present), so it never runs
 * alongside the legacy WebRTC mesh when LiveKit is off. The hook auto-joins the
 * voice room (gameRoomId === livekitRoomId), auto-mutes on death, leaves on exit.
 */
import { useLivekitVoice } from '@/hooks/useLivekitVoice';

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'ხმა გათიშულია',
  connecting:   'უკავშირდება…',
  connected:    'ხმა ჩართულია',
  reconnecting: 'ხელახლა კავშირი…',
};

export function LiveKitVoiceBar() {
  const voice = useLivekitVoice();

  const dot =
    voice.status === 'connected' ? '#22d36b'
    : voice.status === 'reconnecting' || voice.status === 'connecting' ? '#f5c542'
    : 'rgba(255,255,255,0.3)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(155,0,255,0.25)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
        🎧 {STATUS_LABEL[voice.status] ?? voice.status}
        {voice.connected && ` · ${voice.participants}`}
      </span>
      <div style={{ flex: 1 }} />
      {voice.audioBlocked && voice.connected && (
        <button
          onClick={voice.unlockAudio}
          style={{ fontFamily: 'monospace', fontSize: 13, padding: '6px 12px', borderRadius: 10, border: '1px solid rgba(245,197,66,0.5)', background: 'rgba(245,197,66,0.18)', color: '#f5c542' }}
        >
          🔊 ხმის ჩართვა
        </button>
      )}
      {voice.dead ? (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff6b6b' }} title="მკვდარი ხართ — მხოლოდ მოსმენა">🔇 listen-only</span>
      ) : (
        <button
          onClick={voice.toggleMic}
          disabled={!voice.connected}
          style={{
            fontFamily: 'monospace', fontSize: 13, padding: '6px 12px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: voice.micEnabled ? 'rgba(34,211,107,0.18)' : 'rgba(255,255,255,0.05)',
            color: voice.micEnabled ? '#22d36b' : 'rgba(255,255,255,0.6)',
            opacity: voice.connected ? 1 : 0.4,
          }}
        >
          {voice.micEnabled ? '🎙 ჩართული' : '🔇 ჩუმად'}
        </button>
      )}
      {voice.error && (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff6b6b' }}>{voice.error}</span>
      )}
    </div>
  );
}
