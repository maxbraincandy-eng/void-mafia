/**
 * VoiceParticipants — list of people in the current voice channel.
 * Shows speaking indicator for each participant.
 */

import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { PeerState } from '@/services/webrtcService';

interface VoiceParticipantsProps {
  localName: string;
  isLocalSpeaking: boolean;
  isMuted: boolean;
  peers: PeerState[];
  compact?: boolean;
  spectatorSocketIds?: Set<string>;
}

export function VoiceParticipants({
  localName,
  isLocalSpeaking,
  isMuted,
  peers,
  compact = false,
  spectatorSocketIds,
}: VoiceParticipantsProps) {
  const visiblePeers = spectatorSocketIds
    ? peers.filter(p => !spectatorSocketIds.has(p.socketId))
    : peers;

  const total = visiblePeers.length + 1;
  if (total === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <ParticipantDot name={localName} speaking={isLocalSpeaking && !isMuted} muted={isMuted} />
        <AnimatePresence>
          {visiblePeers.map(p => (
            <ParticipantDot key={p.socketId} name={p.name} speaking={p.isSpeaking} />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <ParticipantRow name={localName} speaking={isLocalSpeaking && !isMuted} muted={isMuted} isLocal />
      <AnimatePresence>
        {visiblePeers.map(p => (
          <motion.div
            key={p.socketId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
          >
            <ParticipantRow name={p.name} speaking={p.isSpeaking} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function ParticipantRow({
  name,
  speaking,
  muted = false,
  isLocal = false,
}: {
  name: string;
  speaking: boolean;
  muted?: boolean;
  isLocal?: boolean;
}) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all',
      speaking ? 'bg-neon-green/8 border border-neon-green/20' : 'border border-transparent',
    )}>
      <SpeakingRing speaking={speaking} muted={muted} />
      <span className={clsx(
        'text-xs font-mono truncate flex-1',
        speaking ? 'text-neon-green' : 'text-white/60',
      )}>
        {name}
        {isLocal && <span className="text-white/30 ml-1">(you)</span>}
      </span>
      {muted && <span className="text-neon-red text-xs">🔇</span>}
    </div>
  );
}

function ParticipantDot({
  name,
  speaking,
  muted = false,
}: {
  name: string;
  speaking: boolean;
  muted?: boolean;
}) {
  return (
    <div
      title={`${name}${muted ? ' (muted)' : ''}`}
      className={clsx(
        'w-6 h-6 rounded-full border flex items-center justify-center text-[12px] font-bold uppercase transition-all',
        speaking
          ? 'bg-neon-green/20 border-neon-green/60 text-neon-green shadow-[0_0_6px_#00ff88]'
          : 'bg-white/5 border-white/15 text-white/50',
      )}
    >
      {name[0]}
    </div>
  );
}

function SpeakingRing({ speaking, muted }: { speaking: boolean; muted: boolean }) {
  return (
    <motion.div
      animate={{
        scale: speaking ? [1, 1.3, 1] : 1,
        opacity: muted ? 0.3 : 1,
      }}
      transition={{ repeat: speaking ? Infinity : 0, duration: 0.7 }}
      className={clsx(
        'w-2.5 h-2.5 rounded-full flex-shrink-0',
        muted        ? 'bg-neon-red/60'
        : speaking   ? 'bg-neon-green shadow-[0_0_6px_#00ff88]'
        : 'bg-white/25',
      )}
    />
  );
}
