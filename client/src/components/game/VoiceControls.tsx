/**
 * VoiceControls — the main voice UI panel.
 *
 * Shows:
 *  - "Join Voice" button (calls getUserMedia on tap)
 *  - Connection status: disconnected / requesting / connecting / connected / failed
 *  - Mute / Unmute toggle
 *  - Camera on / off toggle (optional)
 *  - Leave voice button
 *  - Permission denied / HTTPS warning
 *
 * IMPORTANT: getUserMedia is ONLY called when the user taps "Join Voice".
 * Never called automatically on page load.
 */

import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { VoiceChannel } from '@/hooks/useVoiceChat';
import { ConnectionState } from '@/services/webrtcService';

interface VoiceControlsProps {
  channel: VoiceChannel | null;
  status: ConnectionState;
  isMuted: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  peerCount: number;
  error: string | null;
  showCamera?: boolean;

  onJoin: (channel: VoiceChannel, withCamera?: boolean) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;

  /** Which channel to offer. Caller decides based on player role + phase. */
  defaultChannel?: VoiceChannel;
  channelLabel?: string;
}

const STATUS_LABEL: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  requesting:   'Requesting permission…',
  connecting:   'Connecting…',
  connected:    'Connected',
  failed:       'Connection failed',
};

const STATUS_COLOR: Record<ConnectionState, string> = {
  disconnected: 'text-white/40',
  requesting:   'text-yellow-400',
  connecting:   'text-yellow-400',
  connected:    'text-neon-green',
  failed:       'text-neon-red',
};

export function VoiceControls({
  channel,
  status,
  isMuted,
  cameraOn,
  isLocalSpeaking,
  peerCount,
  error,
  showCamera = false,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleCamera,
  defaultChannel = 'room',
  channelLabel,
}: VoiceControlsProps) {
  const isInVoice = channel !== null;
  const isConnecting = status === 'requesting' || status === 'connecting';

  const label = channelLabel ?? (defaultChannel === 'mafia' ? '🔴 Mafia Voice' : '🎙 Room Voice');

  return (
    <div className="rounded-2xl border border-white/10 bg-void-50/60 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-white/40">Voice</p>
          <p className={clsx('text-xs font-mono mt-0.5 transition-colors', STATUS_COLOR[status])}>
            {isInVoice && status === 'connected'
              ? `${label} · ${peerCount + 1} connected`
              : STATUS_LABEL[status]}
          </p>
        </div>

        {/* Speaking indicator */}
        {isInVoice && (
          <motion.div
            animate={{ scale: isLocalSpeaking ? [1, 1.2, 1] : 1, opacity: isLocalSpeaking ? 1 : 0.3 }}
            transition={{ repeat: isLocalSpeaking ? Infinity : 0, duration: 0.5 }}
            className={clsx(
              'w-3 h-3 rounded-full',
              isLocalSpeaking ? 'bg-neon-green shadow-[0_0_8px_#00ff88]' : 'bg-white/20',
            )}
          />
        )}
      </div>

      {/* Error / warning */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-mono text-neon-red bg-neon-red/10 border border-neon-red/20 rounded-xl px-3 py-2 leading-relaxed"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buttons */}
      {!isInVoice ? (
        <button
          onClick={() => onJoin(defaultChannel)}
          disabled={isConnecting}
          className={clsx(
            'w-full py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
            'border transition-all duration-200',
            isConnecting
              ? 'border-white/10 text-white/30 cursor-wait bg-white/5'
              : 'border-neon-green/40 text-neon-green bg-neon-green/10 hover:bg-neon-green/20 hover:border-neon-green/60 active:scale-95',
          )}
        >
          {isConnecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">◌</span>
              {STATUS_LABEL[status]}
            </span>
          ) : (
            `🎙 Join ${defaultChannel === 'mafia' ? 'Mafia ' : ''}Voice`
          )}
        </button>
      ) : (
        <div className="space-y-2">
          {/* In-voice controls */}
          <div className="flex gap-2">
            {/* Mute toggle */}
            <button
              onClick={onToggleMute}
              className={clsx(
                'flex-1 py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
                'border transition-all duration-200 active:scale-95',
                isMuted
                  ? 'border-neon-red/50 text-neon-red bg-neon-red/15 hover:bg-neon-red/25'
                  : 'border-neon-green/40 text-neon-green bg-neon-green/10 hover:bg-neon-green/20',
              )}
            >
              {isMuted ? '🔇 Muted' : '🎙 Mic On'}
            </button>

            {/* Camera toggle (optional) */}
            {showCamera && (
              <button
                onClick={onToggleCamera}
                className={clsx(
                  'flex-1 py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
                  'border transition-all duration-200 active:scale-95',
                  cameraOn
                    ? 'border-neon-cyan/40 text-neon-cyan bg-neon-cyan/10 hover:bg-neon-cyan/20'
                    : 'border-white/20 text-white/40 bg-white/5 hover:bg-white/10',
                )}
              >
                {cameraOn ? '📷 Cam On' : '📷 Cam Off'}
              </button>
            )}

            {/* Leave */}
            <button
              onClick={onLeave}
              className="px-4 py-3 rounded-xl border border-white/10 text-white/40 hover:text-neon-red hover:border-neon-red/30 font-mono transition-all active:scale-95"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
