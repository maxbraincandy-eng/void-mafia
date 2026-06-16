import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { useAuthStore } from '@/store/authStore';
import { useCommunityStore } from '@/store/communityStore';
import { useLoungeVoice } from '@/hooks/useLoungeVoice';
import type { CommunityLounge, CommunityLoungeMember } from '@/types/index';
import {
  Accent, ACCENT_COLORS, Avatar, PillButton, ModalShell, TextInput,
} from '@/components/community/shared';

function accentForLounge(lounge: CommunityLounge): Accent {
  return lounge.kind === 'void_radio' ? 'cyan' : 'purple';
}

/** Hidden audio element bound to a remote peer's MediaStream (voice-only, no video track). */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function RoleBadge({ role, accent }: { role: CommunityLoungeMember['role']; accent: Accent }) {
  const t = useT();
  const c = ACCENT_COLORS[accent];
  const label = role === 'host' ? t.community.lounges.host : role === 'speaker' ? t.community.lounges.speaker : t.community.lounges.listener;
  return (
    <span
      className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border flex-shrink-0"
      style={role === 'listener'
        ? { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }
        : { color: c.text, borderColor: c.border, background: c.bg }}
    >
      {label}
    </span>
  );
}

function MemberRow({
  member, isMe, isSpeaking, accent, canManage, onTap, onOpenProfile,
}: {
  member: CommunityLoungeMember;
  isMe: boolean;
  isSpeaking: boolean;
  accent: Accent;
  canManage: boolean;
  onTap: () => void;
  onOpenProfile: (playerId: string) => void;
}) {
  const t = useT();
  const c = ACCENT_COLORS[accent];
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors"
      style={{ background: 'rgba(255,255,255,0.02)' }}
    >
      <div
        className="rounded-full flex-shrink-0 cursor-pointer transition-all"
        style={isSpeaking ? { boxShadow: `0 0 0 2px ${c.solid}, 0 0 16px ${c.solid}` } : undefined}
        onClick={() => onOpenProfile(member.playerId)}
      >
        <Avatar avatar={member.avatar} avatarUrl={member.avatarUrl} size={36} />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenProfile(member.playerId)}>
        <p className="font-mono text-xs text-white/80 truncate">
          {member.username}{isMe ? ` ${t.common.you}` : ''}
        </p>
        {member.handRaised && (
          <p className="font-mono text-[9px] mt-0.5" style={{ color: c.text }}>✋ {t.community.lounges.handRaised}</p>
        )}
      </div>
      <RoleBadge role={member.role} accent={accent} />
      {canManage && !isMe && (
        <button
          onClick={onTap}
          className="font-mono text-[10px] text-white/30 hover:text-white/60 px-1.5 flex-shrink-0"
        >
          •••
        </button>
      )}
    </div>
  );
}

function ActionSheet({
  member, accent, onClose, onPromote, onDemote, onKick,
}: {
  member: CommunityLoungeMember;
  accent: Accent;
  onClose: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onKick: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [confirmingKick, setConfirmingKick] = useState(false);

  return (
    <ModalShell onClose={onClose} accent={accent} maxWidthClass="max-w-xs">
      <p className="font-display font-bold text-white text-base mb-3 truncate">{member.username}</p>
      <div className="space-y-2">
        {member.role === 'listener' && (
          <PillButton accent={accent} className="w-full justify-center" onClick={() => { onPromote(); onClose(); }}>
            {t.community.lounges.promote}
          </PillButton>
        )}
        {member.role === 'speaker' && (
          <PillButton accent={accent} className="w-full justify-center" onClick={() => { onDemote(); onClose(); }}>
            {t.community.lounges.demote}
          </PillButton>
        )}

        {!confirmingKick ? (
          <button
            onClick={() => setConfirmingKick(true)}
            className="w-full py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }}
          >
            {t.community.lounges.kick}
          </button>
        ) : (
          <div className="space-y-2 pt-1">
            <TextInput value={reason} onChange={setReason} placeholder={t.community.lounges.kickReasonPh} maxLength={140} accent={accent} />
            <button
              onClick={() => { onKick(reason.trim()); onClose(); }}
              className="w-full py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(255,68,68,0.18)', border: '1px solid rgba(255,68,68,0.4)', color: '#ff4444' }}
            >
              {t.community.lounges.kick}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function PreJoinScreen({ lounge, accent, onJoin }: {
  lounge: CommunityLounge;
  accent: Accent;
  onJoin: (asSpeaker: boolean) => void;
}) {
  const t = useT();
  const c = ACCENT_COLORS[accent];
  const title = lounge.kind === 'max_lounge' ? t.community.lounges.maxLounge
    : lounge.kind === 'void_radio' ? t.community.lounges.voidRadio
    : lounge.name;

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4 space-y-6">
      <div>
        <p className="font-display font-bold text-white text-lg">{title}</p>
        <p className="font-mono text-[10px] text-white/35 mt-1">
          {lounge.speakerCount} {t.community.lounges.speakers} · {lounge.listenerCount} {t.community.lounges.listeners}
        </p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => onJoin(false)}
          className="w-full py-4 rounded-2xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.97]"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, boxShadow: c.shadow }}
        >
          🎧 {t.community.lounges.joinAsListener}
        </button>
        <button
          onClick={() => onJoin(true)}
          className="w-full py-4 rounded-2xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.97]"
          style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.35), rgba(0,245,255,0.2))', border: `1px solid ${c.border}`, color: '#fff' }}
        >
          🎙 {t.community.lounges.joinAsSpeaker}
        </button>
        <p className="font-mono text-[9px] text-white/30 leading-relaxed px-2">
          {t.community.lounges.micCapNotice}
        </p>
      </div>
    </div>
  );
}

export function LoungeRoom({ lounge, onLeave, onOpenProfile }: {
  lounge: CommunityLounge;
  onLeave: () => void;
  onOpenProfile: (playerId: string) => void;
}) {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const { loungeMembers, setCurrentLounge, setLoungeLive } = useCommunityStore();
  const voice = useLoungeVoice();
  const accent = accentForLounge(lounge);
  const c = ACCENT_COLORS[accent];

  const isOwnerLevel = profile?.moderatorLevel === 'owner';
  const isLoungeOwner = !!profile && profile.id === lounge.ownerId;
  const autoHost = isLoungeOwner || isOwnerLevel;

  const [hasJoined, setHasJoined] = useState(autoHost);
  const [actionTarget, setActionTarget] = useState<CommunityLoungeMember | null>(null);
  const [kickedVisible, setKickedVisible] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);

  // Enter the lounge (subscribe to roster) and auto-join voice as host when applicable.
  useEffect(() => {
    setCurrentLounge(lounge.id);
    if (autoHost) {
      voice.joinLounge(lounge.id, true);
    }
    return () => {
      voice.leaveLounge();
      setCurrentLounge(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lounge.id]);

  // Kicked toast auto-dismiss.
  useEffect(() => {
    if (voice.kickedReason) {
      setKickedVisible(true);
      const timer = setTimeout(() => {
        setKickedVisible(false);
        voice.clearKicked();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [voice.kickedReason]);

  const me = useMemo(
    () => loungeMembers.find(m => m.playerId === profile?.id) ?? null,
    [loungeMembers, profile?.id],
  );
  const amHost = me?.role === 'host';
  const canToggleLive = isLoungeOwner || isOwnerLevel;

  const speakingSocketIds = useMemo(
    () => new Set(voice.peers.filter(p => p.isSpeaking).map(p => p.socketId)),
    [voice.peers],
  );

  function handleJoinFromPreJoin(asSpeaker: boolean) {
    setHasJoined(true);
    voice.joinLounge(lounge.id, asSpeaker);
  }

  function handleLeave() {
    voice.leaveLounge();
    setCurrentLounge(null);
    onLeave();
  }

  async function handleToggleLive() {
    if (liveBusy) return;
    setLiveBusy(true);
    try {
      await setLoungeLive(lounge.id, !lounge.isLive);
    } finally {
      setLiveBusy(false);
    }
  }

  const title = lounge.kind === 'max_lounge' ? t.community.lounges.maxLounge
    : lounge.kind === 'void_radio' ? t.community.lounges.voidRadio
    : lounge.name;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-white text-base truncate">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
              style={lounge.isLive
                ? { color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)', background: 'rgba(0,255,136,0.08)' }
                : { color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.03)' }}
            >
              {lounge.isLive ? t.community.lounges.live : t.community.lounges.offline}
            </span>
            <span className="font-mono text-[10px] text-white/30">
              {lounge.speakerCount} {t.community.lounges.speakers} · {lounge.listenerCount} {t.community.lounges.listeners}
            </span>
          </div>
        </div>
        <PillButton accent={accent} onClick={handleLeave} className="flex-shrink-0">
          {t.community.lounges.leaveLounge}
        </PillButton>
      </div>

      {canToggleLive && (
        <button
          onClick={handleToggleLive}
          disabled={liveBusy}
          className="w-full py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
          style={lounge.isLive
            ? { background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff4444' }
            : { background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
        >
          {lounge.isLive ? t.community.lounges.offline : t.community.lounges.live}
        </button>
      )}

      {/* Kicked toast */}
      <AnimatePresence>
        {kickedVisible && voice.kickedReason && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="px-4 py-2.5 rounded-xl font-mono text-xs"
            style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.3)', color: '#ff8a8a' }}
          >
            {t.community.lounges.kicked} {voice.kickedReason}
          </motion.div>
        )}
      </AnimatePresence>

      {!hasJoined ? (
        <PreJoinScreen lounge={lounge} accent={accent} onJoin={handleJoinFromPreJoin} />
      ) : (
        <>
          {/* Voice controls */}
          <div className="flex items-center gap-2">
            {(voice.role === 'host' || voice.role === 'speaker') && (
              <PillButton accent={accent} onClick={voice.toggleMute}>
                {voice.isMuted ? `🔇 ${t.community.lounges.unmute}` : `🎙 ${t.community.lounges.mute}`}
              </PillButton>
            )}
            {voice.role === 'listener' && (
              <PillButton accent={accent} onClick={voice.handRaised ? voice.lowerHand : voice.raiseHand}>
                ✋ {voice.handRaised ? t.community.lounges.lowerHand : t.community.lounges.raiseHand}
              </PillButton>
            )}
            <span className="font-mono text-[9px] text-white/25 ml-auto">
              {voice.status === 'connecting' || voice.status === 'requesting' ? '…' : voice.status}
            </span>
          </div>

          {voice.error && (
            <p className="font-mono text-[10px] text-red-400/70 px-1">{voice.error}</p>
          )}

          {/* Roster */}
          <div className="space-y-1.5">
            {loungeMembers.map(member => (
              <MemberRow
                key={member.socketId}
                member={member}
                isMe={member.playerId === profile?.id}
                isSpeaking={member.playerId === profile?.id
                  ? voice.isLocalSpeaking && !voice.isMuted
                  : speakingSocketIds.has(member.socketId)}
                accent={accent}
                canManage={amHost}
                onTap={() => setActionTarget(member)}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        </>
      )}

      {/* Hidden remote audio elements */}
      {Object.entries(voice.remoteStreams).map(([socketId, stream]) => (
        <RemoteAudio key={socketId} stream={stream} />
      ))}

      <AnimatePresence>
        {actionTarget && (
          <ActionSheet
            member={actionTarget}
            accent={accent}
            onClose={() => setActionTarget(null)}
            onPromote={() => voice.promote(actionTarget.playerId)}
            onDemote={() => voice.demote(actionTarget.playerId)}
            onKick={(reason) => voice.kick(actionTarget.playerId, reason)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
