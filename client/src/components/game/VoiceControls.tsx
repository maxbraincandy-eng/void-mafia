/**
 * VoiceControls — voice/video UI panel.
 *
 * Before joining:
 *   - Camera toggle checkbox (opt-in)
 *   - "Join Voice" button (calls getUserMedia on tap — browser permission prompt)
 *
 * After joining:
 *   - Mute / Unmute mic
 *   - Enable / Disable camera (requests permission on first enable)
 *   - Leave button
 *   - Connection status
 *   - Speaking indicator
 *   - Error / HTTPS warning
 */

import { useState } from 'react';
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

  onJoin: (channel: VoiceChannel, withCamera: boolean) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;

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
  onJoin,
  onLeave,
  onToggleMute,
  onToggleCamera,
  defaultChannel = 'room',
  channelLabel,
}: VoiceControlsProps) {
  const isInVoice = channel !== null;
  const isConnecting = status === 'requesting' || status === 'connecting';

  // Pre-join camera opt-in (local UI state)
  const [wantCamera, setWantCamera] = useState(false);

  const label = channelLabel ?? (defaultChannel === 'mafia' ? '🔴 Mafia Voice' : '🎙 Room Voice');

  return (
    <div className="rounded-2xl border border-white/10 bg-void-50/60 p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-white/40">Voice</p>
          <p className={clsx('text-xs font-mono mt-0.5 transition-colors', STATUS_COLOR[status])}>
            {isInVoice && status === 'connected'
              ? `${label} · ${peerCount + 1} connected`
              : STATUS_LABEL[status]}
          </p>
        </div>

        {/* Local speaking indicator */}
        {isInVoice && (
          <motion.div
            animate={{ scale: isLocalSpeaking ? [1, 1.25, 1] : 1, opacity: isLocalSpeaking ? 1 : 0.25 }}
            transition={{ repeat: isLocalSpeaking ? Infinity : 0, duration: 0.55 }}
            className={clsx(
              'w-3 h-3 rounded-full',
              isLocalSpeaking ? 'bg-neon-green shadow-[0_0_8px_#00ff88]' : 'bg-white/20',
            )}
          />
        )}
      </div>

      {/* Error message */}
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

      {/* ── Pre-join state ───────────────────────────────────────────── */}
      {!isInVoice && (
        <div className="space-y-3">
          {/* Camera opt-in toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none group">
            <div
              onClick={() => setWantCamera(v => !v)}
              className={clsx(
                'w-10 h-6 rounded-full flex items-center px-0.5 transition-all flex-shrink-0',
                wantCamera ? 'bg-neon-cyan/40 border border-neon-cyan/50' : 'bg-white/10 border border-white/10',
              )}
            >
              <motion.div
                animate={{ x: wantCamera ? 16 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={clsx(
                  'w-5 h-5 rounded-full transition-colors',
                  wantCamera ? 'bg-neon-cyan' : 'bg-white/40',
                )}
              />
            </div>
            <div>
              <p className="text-xs font-mono text-white/60 group-hover:text-white/80 transition-colors">
                📷 Include camera
              </p>
              <p className="text-[10px] font-mono text-white/25">
                {wantCamera
                  ? 'Browser will ask for camera permission'
                  : 'Mic only — camera off'}
              </p>
            </div>
          </label>

          {/* Join button */}
          <button
            onClick={() => onJoin(defaultChannel, wantCamera)}
            disabled={isConnecting}
            className={clsx(
              'w-full py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
              'border transition-all duration-200 active:scale-95',
              isConnecting
                ? 'border-white/10 text-white/30 cursor-wait bg-white/5'
                : 'border-neon-green/40 text-neon-green bg-neon-green/10 hover:bg-neon-green/20 hover:border-neon-green/60',
            )}
          >
            {isConnecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block animate-spin">◌</span>
                {STATUS_LABEL[status]}
              </span>
            ) : (
              <>
                {wantCamera ? '📷 ' : '🎙 '}
                Join {defaultChannel === 'mafia' ? 'Mafia ' : ''}Voice
              </>
            )}
          </button>

          <p className="text-[10px] text-white/20 font-mono text-center">
            Browser will ask for microphone permission{wantCamera ? ' and camera' : ''} when you tap Join.
          </p>
        </div>
      )}

      {/* ── In-voice controls ────────────────────────────────────────── */}
      {isInVoice && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Mute / Unmute */}
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

            {/* Camera toggle — tapping requests permission if not yet granted */}
            <button
              onClick={onToggleCamera}
              className={clsx(
                'flex-1 py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
                'border transition-all duration-200 active:scale-95',
                cameraOn
                  ? 'border-neon-cyan/40 text-neon-cyan bg-neon-cyan/10 hover:bg-neon-cyan/20'
                  : 'border-white/15 text-white/40 bg-white/5 hover:bg-white/10 hover:text-white/70',
              )}
            >
              {cameraOn ? '📷 Cam On' : '📷 Cam Off'}
            </button>

            {/* Leave */}
            <button
              onClick={onLeave}
              className="px-4 py-3 rounded-xl border border-white/10 text-white/40 hover:text-neon-red hover:border-neon-red/30 font-mono transition-all active:scale-95"
              title="Leave voice"
            >
              ✕
            </button>
          </div>

          {!cameraOn && (
            <p className="text-[10px] text-white/20 font-mono text-center">
              Tap "Cam Off" to enable camera — browser will ask for permission.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
