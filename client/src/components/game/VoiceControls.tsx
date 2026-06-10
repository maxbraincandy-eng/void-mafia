/**
 * VoiceControls — voice/video UI panel.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { VoiceChannel } from '@/hooks/useVoiceChat';
import { ConnectionState } from '@/services/webrtcService';
import { useT } from '@/store/langStore';

interface VoiceControlsProps {
  channel: VoiceChannel | null;
  status: ConnectionState;
  isMuted: boolean;
  cameraOn: boolean;
  isLocalSpeaking: boolean;
  peerCount: number;
  error: string | null;
  muteLocked?: boolean;
  listenOnly?: boolean;

  onJoin: (channel: VoiceChannel, withCamera: boolean) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onReset?: () => void;

  defaultChannel?: VoiceChannel;
  channelLabel?: string;
}

export function VoiceControls({
  channel,
  status,
  isMuted,
  cameraOn,
  isLocalSpeaking,
  peerCount,
  error,
  muteLocked = false,
  listenOnly = false,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleCamera,
  onReset,
  defaultChannel = 'room',
  channelLabel,
}: VoiceControlsProps) {
  const t = useT();
  const v = t.game.voice;

  const STATUS_LABEL: Record<ConnectionState, string> = {
    disconnected: v.notConnected,
    requesting:   v.requesting,
    connecting:   v.connecting,
    connected:    v.connected,
    failed:       v.failed,
  };

  const STATUS_COLOR: Record<ConnectionState, string> = {
    disconnected: 'text-white/40',
    requesting:   'text-yellow-400',
    connecting:   'text-yellow-400',
    connected:    'text-neon-green',
    failed:       'text-neon-red',
  };

  const isInVoice = channel !== null;
  const isConnecting = status === 'requesting' || status === 'connecting';

  const [wantCamera, setWantCamera] = useState(false);

  const label = channelLabel ?? (
    defaultChannel === 'mafia'  ? '🔴 Mafia Voice'
    : defaultChannel === 'yakuza' ? '⚔️ Yakuza Voice'
    : '🎙 Room Voice'
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-void-50/60 p-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-white/40">{v.title}</p>
          <p className={clsx('text-xs font-mono mt-0.5 transition-colors', STATUS_COLOR[status])}>
            {isInVoice && status === 'connected'
              ? v.connectedLabel.replace('{label}', label).replace('{n}', String(peerCount + 1))
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

      {/* Error message / permission guide */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error.toLowerCase().includes('denied') || error.toLowerCase().includes('allow') ? (
              /* Permission denied — show how-to guide */
              <div className="rounded-xl border border-neon-red/30 bg-neon-red/8 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-neon-red/15">
                  <p className="text-xs font-display font-bold text-neon-red">🎙 მიკროფონი გათიშულია</p>
                  <p className="text-[10px] font-mono text-white/40 mt-0.5">Microphone permission blocked</p>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <p className="text-[11px] font-mono text-white/70 font-semibold">Android Chrome:</p>
                  <ol className="space-y-1.5 text-[10px] font-mono text-white/50">
                    <li className="flex items-start gap-1.5">
                      <span className="text-neon-cyan shrink-0 mt-0.5">1.</span>
                      <span>მისამართის ზოლში <span className="text-white/80">🔒</span> ან <span className="text-white/80">ⓘ</span> ხატულაზე დააჭირე</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-neon-cyan shrink-0 mt-0.5">2.</span>
                      <span><span className="text-white/80">Permissions</span> → <span className="text-white/80">Microphone</span> → <span className="text-neon-green">Allow</span></span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-neon-cyan shrink-0 mt-0.5">3.</span>
                      <span>გვერდი განაახლე (Reload) და ხელახლა შემოდი ხმოვან არხში</span>
                    </li>
                  </ol>
                  <button
                    onClick={() => onJoin(defaultChannel, false)}
                    className="w-full mt-1 py-2 rounded-lg text-[11px] font-mono font-bold border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20 transition-colors active:scale-95"
                  >
                    ↺ ხელახლა ცდა
                  </button>
                </div>
              </div>
            ) : (
              /* Other errors — simple message + reset option */
              <div className="space-y-2">
                <div className="text-xs font-mono text-neon-red bg-neon-red/10 border border-neon-red/20 rounded-xl px-3 py-2 leading-relaxed">
                  {error}
                </div>
                {onReset && (
                  <button
                    onClick={onReset}
                    className="w-full py-2 rounded-lg text-[11px] font-mono font-bold border border-white/15 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors active:scale-95"
                  >
                    ↺ Reset Connection
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pre-join state ── */}
      {!isInVoice && (
        <div className="space-y-3">
          {!listenOnly && (
            /* Camera opt-in toggle — only for speaking participants */
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <div
                onClick={() => setWantCamera(vv => !vv)}
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
                  {v.includeCamera}
                </p>
                <p className="text-[10px] font-mono text-white/25">
                  {wantCamera ? v.cameraBrowserAsk : v.micOnly}
                </p>
              </div>
            </label>
          )}

          {/* Join button */}
          <button
            onClick={() => onJoin(defaultChannel, listenOnly ? false : wantCamera)}
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
            ) : listenOnly ? (
              '👁 Listen'
            ) : (
              <>
                {wantCamera ? '📷 ' : '🎙 '}
                {defaultChannel === 'mafia' ? v.joinMafia : defaultChannel === 'yakuza' ? '⚔️ Join Yakuza Voice' : v.join}
              </>
            )}
          </button>

          {!listenOnly && (
            <p className="text-[10px] text-white/20 font-mono text-center">
              {v.joinHint.replace('{cam}', wantCamera ? v.andCamera : '')}
            </p>
          )}
        </div>
      )}

      {/* ── Listen-only state (spectators / dead players) ── */}
      {isInVoice && listenOnly && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-mono text-white/40">
            👁 Listening • {peerCount} speaker{peerCount !== 1 ? 's' : ''}
          </p>
          <button
            onClick={onLeave}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-white/30 hover:text-neon-red hover:border-neon-red/30 font-mono text-xs transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── In-voice controls (active speakers) ── */}
      {isInVoice && !listenOnly && (
        <div className="space-y-2">
          <div className="flex gap-2">
            {/* Mute / Unmute */}
            <button
              onClick={muteLocked ? undefined : onToggleMute}
              disabled={muteLocked}
              title={muteLocked ? v.lockedTitle : undefined}
              className={clsx(
                'flex-1 py-3 rounded-xl font-display font-bold tracking-widest text-sm uppercase',
                'border transition-all duration-200',
                muteLocked
                  ? 'border-white/10 text-white/25 bg-white/5 cursor-not-allowed'
                  : isMuted
                    ? 'border-neon-red/50 text-neon-red bg-neon-red/15 hover:bg-neon-red/25 active:scale-95'
                    : 'border-neon-green/40 text-neon-green bg-neon-green/10 hover:bg-neon-green/20 active:scale-95',
              )}
            >
              {muteLocked ? v.micLocked : isMuted ? v.muted : v.micOn}
            </button>

            {/* Camera toggle */}
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
              {cameraOn ? v.camOn : v.camOff}
            </button>

            {/* Leave */}
            <button
              onClick={onLeave}
              className="px-4 py-3 rounded-xl border border-white/10 text-white/40 hover:text-neon-red hover:border-neon-red/30 font-mono transition-all active:scale-95"
              title={v.leave}
            >
              ✕
            </button>
          </div>

          {muteLocked && (
            <p className="text-[10px] text-neon-red/50 font-mono text-center">
              {v.micLockedHint}
            </p>
          )}
          {!muteLocked && !cameraOn && (
            <p className="text-[10px] text-white/20 font-mono text-center">
              {v.camHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
