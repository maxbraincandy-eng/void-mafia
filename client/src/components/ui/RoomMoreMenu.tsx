import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Phase, PlayerPublic, ClanRole } from '@/types/index';
import type { VoiceChannel } from '@/hooks/useVoiceChat';
import type { ConnectionState } from '@/services/webrtcService';
import { ConfirmModal } from './ConfirmModal';

interface VoiceProps {
  channel: VoiceChannel | null;
  status: ConnectionState;
  isMuted: boolean;
  cameraOn: boolean;
  listenOnly: boolean;
  peerCount: number;
  forceMuted?: boolean;
  error?: string | null;
  defaultChannel?: VoiceChannel;
  onJoin: (channel: VoiceChannel, withCamera?: boolean) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onReset?: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  phase: Phase;
  roomCode: string;
  players: PlayerPublic[];
  amHost: boolean;
  isMod?: boolean;
  isSpectator?: boolean;
  activeRoleCounts?: Record<string, number>;
  clanId?: string | null;
  clanRoom?: boolean;
  viewerClanId?: string | null;
  viewerClanRole?: ClanRole | null;
  voice: VoiceProps;
  onLeaveRoom: () => void;
  onTerminateGame?: () => void;
  onShowRoleGuide?: () => void;
  onKickPlayer?: (playerId: string) => void;
}

type ConfirmAction = 'leave' | 'terminate' | null;

// ── Small helpers ────────────────────────────────────────────────────

function SectionHeader({
  icon, label, count, open, onToggle,
}: { icon: string; label: string; count?: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/3 rounded-xl"
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1 text-[11px] font-display font-bold text-white/55 tracking-[0.18em] uppercase">
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px] font-mono text-white/30 mr-1">{count}</span>
      )}
      <span className="text-white/25 text-xs transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
    </button>
  );
}

function Row({
  icon, label, sub, color = 'default', onClick, disabled,
}: {
  icon: string; label: string; sub?: string; color?: 'default' | 'cyan' | 'red' | 'yellow' | 'green' | 'purple';
  onClick?: () => void; disabled?: boolean;
}) {
  const palette = {
    default: { border: 'rgba(255,255,255,0.07)', bg: 'rgba(255,255,255,0.03)', hover: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.72)' },
    cyan:    { border: 'rgba(0,229,255,0.18)',   bg: 'rgba(0,229,255,0.04)',   hover: 'rgba(0,229,255,0.09)',   text: 'rgba(0,229,255,0.85)' },
    red:     { border: 'rgba(255,22,84,0.22)',    bg: 'rgba(255,22,84,0.06)',   hover: 'rgba(255,22,84,0.12)',   text: 'rgba(255,22,84,0.85)' },
    yellow:  { border: 'rgba(251,191,36,0.22)',   bg: 'rgba(251,191,36,0.05)', hover: 'rgba(251,191,36,0.10)',  text: 'rgba(251,191,36,0.85)' },
    green:   { border: 'rgba(0,255,136,0.18)',    bg: 'rgba(0,255,136,0.04)',  hover: 'rgba(0,255,136,0.09)',   text: 'rgba(0,255,136,0.85)' },
    purple:  { border: 'rgba(155,0,255,0.22)',    bg: 'rgba(155,0,255,0.05)',  hover: 'rgba(155,0,255,0.10)',   text: 'rgba(155,0,255,0.85)' },
  }[color];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-default"
      style={{ border: `1px solid ${palette.border}`, background: palette.bg }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = palette.hover; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = palette.bg; }}
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold tracking-wide truncate" style={{ color: palette.text }}>{label}</p>
        {sub && <p className="text-[10px] font-mono text-white/30 mt-0.5 leading-tight truncate">{sub}</p>}
      </div>
      {onClick && !disabled && <span className="text-white/18 text-xs">›</span>}
    </button>
  );
}

function ToggleBtn({
  active, icon, label, onClick, disabled,
}: { active: boolean; icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-40"
      style={{
        background: active ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[9px] font-mono tracking-wide" style={{ color: active ? 'rgba(0,229,255,0.9)' : 'rgba(255,255,255,0.35)' }}>
        {label}
      </span>
    </button>
  );
}

// ── Constants ────────────────────────────────────────────────────────

const ROLE_ICONS: Record<string, string> = {
  citizen: '🏙', mafia: '🔫', don: '♛', sheriff: '🔍', doctor: '💉',
  maniac: '🌀', jester: '🃏', bodyguard: '🛡', spy: '🕵️',
  escort: '💃', vigilante: '⚖️', cult_leader: '🕯️',
  veteran: '🎖️', tracker: '👁', arsonist: '🔥', mayor: '👑',
};

const ROLE_COLORS: Record<string, string> = {
  citizen: 'rgba(255,255,255,0.5)', mafia: '#ff2d55', don: '#ff2d55',
  sheriff: '#60a5fa', doctor: '#00ff88', maniac: '#9b00ff', jester: '#a855f7',
  bodyguard: '#34d399', spy: '#00e5ff', escort: '#f472b6', vigilante: '#fbbf24',
  cult_leader: '#e879f9', veteran: '#fbbf24', tracker: '#60a5fa',
  arsonist: '#fb923c', mayor: '#ffd700',
};

const ROLE_ORDER = ['mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'spy', 'escort',
  'vigilante', 'tracker', 'veteran', 'mayor', 'maniac', 'arsonist', 'jester', 'cult_leader', 'citizen'];

// ── Main component ───────────────────────────────────────────────────

export function RoomMoreMenu({
  open, onClose, phase, roomCode, players, amHost, isMod = false, isSpectator = false,
  activeRoleCounts, clanId, clanRoom, viewerClanId, viewerClanRole,
  voice, onLeaveRoom, onTerminateGame, onShowRoleGuide, onKickPlayer,
}: Props) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    room: true, voice: true, players: false, spectators: false, roles: false,
  });
  const [copied, setCopied] = useState(false);

  const isActiveGame = phase !== 'lobby' && phase !== 'game_over';
  const isLobby = phase === 'lobby';
  const isClanRoom = !!(clanRoom && clanId);
  const hasClanModPower = isClanRoom && clanId === viewerClanId &&
    (viewerClanRole === 'owner' || viewerClanRole === 'admin' || viewerClanRole === 'moderator');

  const alivePlayers  = players.filter(p => !p.isSpectator && p.isAlive);
  const deadPlayers   = players.filter(p => !p.isSpectator && !p.isAlive && phase !== 'lobby');
  const spectators    = players.filter(p => p.isSpectator);
  const activePlayers = players.filter(p => !p.isSpectator);

  const toggle = (key: string) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const handleConfirm = () => {
    if (confirmAction === 'leave') { onClose(); onLeaveRoom(); }
    else if (confirmAction === 'terminate') { onClose(); onTerminateGame?.(); }
    setConfirmAction(null);
  };

  const copyRoomLink = async () => {
    const url = `${window.location.origin}?join=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const shareRoom = async () => {
    const url = `${window.location.origin}?join=${roomCode}`;
    if (navigator.share) {
      await navigator.share({ title: 'Void Mafia', text: `Join my room!`, url }).catch(() => {});
    } else {
      copyRoomLink();
    }
  };

  // Voice derived state
  const isConnected  = voice.status === 'connected';
  const isConnecting = voice.status === 'connecting' || voice.status === 'requesting';
  const voiceLabel   = isConnected ? `${voice.peerCount + 1} in voice` : isConnecting ? 'Connecting…' : 'Not joined';
  const voiceStatusColor = isConnected ? 'rgba(0,255,136,0.8)' : isConnecting ? 'rgba(255,193,7,0.8)' : 'rgba(255,255,255,0.25)';

  const defaultCh = voice.defaultChannel ?? 'room';

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/65 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-2xl overflow-hidden"
              style={{
                background: 'rgba(7,3,18,0.99)',
                border: '1px solid rgba(138,43,226,0.2)',
                borderBottom: 'none',
                backdropFilter: 'blur(28px)',
                boxShadow: '0 -8px 48px rgba(0,0,0,0.85), 0 -2px 0 rgba(138,43,226,0.12)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                maxHeight: '80vh',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>

              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <p className="font-display text-sm font-bold text-white/75 tracking-widest uppercase">Room Options</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs text-neon-cyan/60 tracking-widest">{roomCode}</span>
                    <span className="text-white/15">·</span>
                    <span className="font-mono text-[10px]" style={{ color: voiceStatusColor }}>
                      {voiceLabel}
                    </span>
                  </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-white/30 hover:text-white/70 transition-colors" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto overscroll-contain px-3 py-3 space-y-1.5" style={{ maxHeight: 'calc(80vh - 90px)' }}>

                {/* ── 1. Room ─────────────────────────────────────────── */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <SectionHeader icon="🏠" label="Room" open={openSections.room} onToggle={() => toggle('room')} />
                  {openSections.room && (
                    <div className="px-4 pb-3 space-y-2">
                      {/* Stats row */}
                      <div className="flex gap-2">
                        {[
                          { label: 'Players', value: activePlayers.length },
                          { label: 'Spectators', value: spectators.length },
                          { label: 'Phase', value: phase.replace(/_/g, ' ') },
                        ].map(s => (
                          <div key={s.label} className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="font-mono text-[9px] text-white/30 uppercase tracking-widest mb-0.5">{s.label}</p>
                            <p className="font-display text-sm font-bold text-white/75 capitalize">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={copyRoomLink}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-mono transition-all active:scale-95"
                          style={{ background: copied ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.05)', border: copied ? '1px solid rgba(0,229,255,0.3)' : '1px solid rgba(255,255,255,0.08)', color: copied ? 'rgba(0,229,255,0.9)' : 'rgba(255,255,255,0.55)' }}
                        >
                          {copied ? '✓ Copied' : '🔗 Copy Link'}
                        </button>
                        <button
                          onClick={shareRoom}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-mono transition-all active:scale-95"
                          style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)', color: 'rgba(192,132,252,0.85)' }}
                        >
                          📤 Share
                        </button>
                      </div>
                      {isClanRoom && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(155,0,255,0.06)', border: '1px solid rgba(155,0,255,0.15)' }}>
                          <span className="text-sm">🛡</span>
                          <span className="text-[11px] font-mono text-purple-300/60">Clan Room</span>
                          {hasClanModPower && (
                            <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/25 uppercase tracking-wide">
                              {viewerClanRole}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 2. Voice ─────────────────────────────────────────── */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,229,255,0.02)' }}>
                  <SectionHeader icon="🎙" label="Voice" open={openSections.voice} onToggle={() => toggle('voice')} />
                  {openSections.voice && (
                    <div className="px-4 pb-3 space-y-2">
                      {voice.status !== 'disconnected' && voice.status !== 'failed' ? (
                        <>
                          <div className="flex gap-2">
                            <ToggleBtn active={!voice.isMuted} icon={voice.isMuted ? '🔇' : '🎙'} label={voice.isMuted ? 'Muted' : 'Speaking'} onClick={voice.onToggleMute} disabled={voice.listenOnly || voice.forceMuted} />
                            <ToggleBtn active={voice.cameraOn} icon={voice.cameraOn ? '📹' : '📷'} label={voice.cameraOn ? 'Camera On' : 'Camera Off'} onClick={voice.onToggleCamera} disabled={voice.listenOnly} />
                            <ToggleBtn active={false} icon="🚪" label="Leave" onClick={() => { voice.onLeave(); }} />
                          </div>
                          {voice.forceMuted && (
                            <p className="text-[10px] font-mono text-yellow-400/60 text-center">Mic locked by room</p>
                          )}
                          {voice.listenOnly && (
                            <p className="text-[10px] font-mono text-white/30 text-center">Listen-only mode</p>
                          )}
                          {voice.onReset && (
                            <Row icon="🔄" label="Reset Connection" sub="Reconnects mic, camera & audio" color="cyan" onClick={() => { onClose(); voice.onReset?.(); }} />
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          {isSpectator ? (
                            <Row icon="👁" label="Listen-Only Mode" sub="Spectators join in listen-only" color="default"
                              onClick={() => { voice.onJoin(defaultCh, false); }} />
                          ) : (
                            <>
                              <Row icon="🎙" label="Join Voice" sub="Join with microphone" color="cyan"
                                onClick={() => { voice.onJoin(defaultCh, false); }} />
                              <Row icon="📹" label="Join with Camera" sub="Join voice + video" color="default"
                                onClick={() => { voice.onJoin(defaultCh, true); }} />
                            </>
                          )}
                          {voice.status === 'failed' && (
                            <p className="text-[10px] font-mono text-neon-red/60 text-center px-2">
                              {voice.error ?? 'Connection failed'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 3. Players ───────────────────────────────────────── */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <SectionHeader icon="👥" label="Players" count={activePlayers.length} open={openSections.players} onToggle={() => toggle('players')} />
                  {openSections.players && (
                    <div className="px-4 pb-3 space-y-2">
                      {isActiveGame && (
                        <div>
                          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5 px-1">Alive — {alivePlayers.length}</p>
                          <div className="space-y-0.5">
                            {alivePlayers.map(p => (
                              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <span className="text-sm flex-shrink-0">{p.avatar}</span>
                                <span className="text-xs font-mono text-white/70 flex-1 truncate">{p.name}</span>
                                {p.isHost && <span className="text-[9px] font-mono text-neon-purple/50 uppercase">host</span>}
                                {p.isModerator && <span className="text-[9px] font-mono text-neon-green/50 uppercase">mod</span>}
                                {!p.isConnected && <span className="text-[9px] font-mono text-yellow-400/50">offline</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!isActiveGame && (
                        <div className="space-y-0.5">
                          {activePlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <span className="text-sm flex-shrink-0">{p.avatar}</span>
                              <span className="text-xs font-mono text-white/70 flex-1 truncate">{p.name}</span>
                              {p.isHost && <span className="text-[9px] font-mono text-neon-purple/50 uppercase tracking-wide">host</span>}
                              {p.isModerator && <span className="text-[9px] font-mono text-neon-green/50 uppercase tracking-wide">mod</span>}
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.isReady ? 'bg-neon-green' : 'bg-white/15'}`} />
                            </div>
                          ))}
                        </div>
                      )}
                      {isActiveGame && deadPlayers.length > 0 && (
                        <div>
                          <p className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1.5 px-1 mt-2">Dead — {deadPlayers.length}</p>
                          <div className="space-y-0.5">
                            {deadPlayers.map(p => (
                              <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg opacity-50" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <span className="text-sm flex-shrink-0 grayscale">{p.avatar}</span>
                                <span className="text-xs font-mono text-white/40 flex-1 truncate line-through">{p.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 4. Spectators ────────────────────────────────────── */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                  <SectionHeader icon="👁" label="Spectators" count={spectators.length} open={openSections.spectators} onToggle={() => toggle('spectators')} />
                  {openSections.spectators && (
                    <div className="px-4 pb-3">
                      {spectators.length === 0 ? (
                        <p className="text-xs text-white/25 font-mono text-center py-2">No spectators</p>
                      ) : (
                        <div className="space-y-0.5">
                          {spectators.map(s => (
                            <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <span className="text-sm">{s.avatar}</span>
                              <span className="text-xs font-mono text-white/55 flex-1 truncate">{s.name}</span>
                              {!s.isConnected && <span className="text-[9px] font-mono text-yellow-400/40">offline</span>}
                              {amHost && isLobby && onKickPlayer && (
                                <button
                                  onClick={() => { onKickPlayer(s.id); onClose(); }}
                                  className="text-[10px] font-mono text-neon-red/50 hover:text-neon-red/80 transition-colors ml-1 px-1.5 py-0.5 rounded"
                                  style={{ border: '1px solid rgba(255,22,84,0.15)' }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 5. Active Roles ──────────────────────────────────── */}
                {activeRoleCounts && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    <SectionHeader icon="⚔️" label="Active Roles" open={openSections.roles} onToggle={() => toggle('roles')} />
                    {openSections.roles && (
                      <ActiveRolesSection activeRoleCounts={activeRoleCounts} />
                    )}
                  </div>
                )}

                {/* ── 6. Player Tools ──────────────────────────────────── */}
                {onShowRoleGuide && (
                  <Row icon="📖" label="Role Guide" sub="Learn all roles & abilities" onClick={() => { onClose(); onShowRoleGuide(); }} />
                )}

                {/* Clan Mod info */}
                {hasClanModPower && (
                  <div className="px-4 py-2.5 rounded-xl" style={{ background: 'rgba(155,0,255,0.05)', border: '1px solid rgba(155,0,255,0.15)' }}>
                    <p className="text-[10px] font-mono text-purple-300/60">
                      You have clan moderation powers here. Click players to warn/kick.
                    </p>
                  </div>
                )}

                {/* ── 7. Danger Zone ───────────────────────────────────── */}
                <div className="pt-1">
                  <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.25em] px-1 mb-2">Danger Zone</p>
                  <div className="space-y-1.5">
                    {amHost && isActiveGame && onTerminateGame && (
                      <Row icon="⏹" label="Terminate Game" sub="Stop game, return to lobby" color="yellow"
                        onClick={() => setConfirmAction('terminate')} />
                    )}
                    <Row
                      icon={amHost ? '🔒' : '🚪'}
                      label={amHost ? 'Close Room' : 'Leave Room'}
                      sub={amHost ? 'Closes the room for everyone' : 'Return to home screen'}
                      color="red"
                      onClick={() => setConfirmAction('leave')}
                    />
                  </div>
                </div>

                <div className="h-2" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={confirmAction === 'leave'}
        title={amHost ? 'Close Room' : 'Leave Room'}
        message={amHost
          ? 'You are the host. Leaving will close the room for everyone. Are you sure?'
          : 'Are you sure you want to leave this room?'}
        confirmLabel={amHost ? 'Yes, Close Room' : 'Yes, Leave'}
        dangerous
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'terminate'}
        title="Terminate Game"
        message="Stop the current game and return everyone to the lobby. The room will remain open."
        confirmLabel="Yes, Terminate"
        dangerous
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}

function ActiveRolesSection({ activeRoleCounts }: { activeRoleCounts: Record<string, number> }) {
  const entries = Object.entries(activeRoleCounts)
    .filter(([, c]) => c > 0)
    .sort(([a], [b]) => (ROLE_ORDER.indexOf(a) ?? 99) - (ROLE_ORDER.indexOf(b) ?? 99));

  if (entries.length === 0) {
    return <p className="text-xs text-white/30 font-mono text-center py-3 px-4">Roles are auto-assigned by player count</p>;
  }

  return (
    <div className="p-3 grid grid-cols-2 gap-1.5">
      {entries.map(([role, count]) => (
        <div key={role} className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${(ROLE_COLORS[role] ?? 'rgba(255,255,255,0.12)')}33` }}>
          <span className="text-base flex-shrink-0">{ROLE_ICONS[role] ?? '?'}</span>
          <span className="text-[11px] font-mono text-white/70 truncate capitalize flex-1">{role.replace(/_/g, ' ')}</span>
          <span className="flex-shrink-0 text-[11px] font-display font-bold" style={{ color: ROLE_COLORS[role] ?? 'rgba(255,255,255,0.5)' }}>×{count}</span>
        </div>
      ))}
    </div>
  );
}
