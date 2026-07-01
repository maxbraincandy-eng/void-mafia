/**
 * LiveKitVoiceBar — minimal mic UI for LiveKit voice.
 *
 * `LiveKitVoiceBar` is the game wrapper (binds useLivekitVoice). The Virtual
 * Space renders `LiveKitVoiceBarView` directly with its own room binding. Both
 * are mounted only when the server reports LiveKit configured, so they never
 * run alongside the legacy WebRTC mesh when LiveKit is off.
 */
import { useLivekitVoice, type LivekitVoice } from '@/hooks/useLivekitVoice';

const STATUS_LABEL: Record<string, string> = {
  disconnected: 'ხმა გათიშულია',
  connecting:   'უკავშირდება…',
  connected:    'ხმა ჩართულია',
  reconnecting: 'ხელახლა კავშირი…',
};

/** Game wrapper — binds the Mafia game voice. */
export function LiveKitVoiceBar() {
  return <LiveKitVoiceBarView voice={useLivekitVoice()} />;
}

/** Presentational bar — render with any LiveKit voice binding. */
export function LiveKitVoiceBarView({ voice }: { voice: LivekitVoice & { cameraOn?: boolean; toggleCamera?: () => void } }) {
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
      {voice.toggleCamera && (
        <button
          onClick={voice.toggleCamera}
          disabled={!voice.connected}
          title={voice.cameraOn ? 'კამერა გამორთვა' : 'კამერა ჩართვა'}
          style={{
            fontFamily: 'monospace', fontSize: 13, padding: '6px 10px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)',
            background: voice.cameraOn ? 'rgba(0,229,255,0.18)' : 'rgba(255,255,255,0.05)',
            color: voice.cameraOn ? '#00e5ff' : 'rgba(255,255,255,0.6)',
            opacity: voice.connected ? 1 : 0.4,
          }}
        >
          {voice.cameraOn ? '📹' : '📷'}
        </button>
      )}
      {voice.dead ? (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff6b6b' }} title="მკვდარი ხართ — მხოლოდ მოსმენა">🔇 listen-only</span>
      ) : voice.forceMuted ? (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c542' }} title={voice.forceMuteReason ?? 'დადუმებული'}>🔒 დადუმებული</span>
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
