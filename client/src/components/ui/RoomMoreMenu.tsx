import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Phase, PlayerPublic } from '@/types/index';
import { ConfirmModal } from './ConfirmModal';

interface Props {
  open: boolean;
  onClose: () => void;
  // Room info
  phase: Phase;
  roomCode: string;
  spectators: PlayerPublic[];
  amHost: boolean;
  isInVoice: boolean;
  activeRoleCounts?: Record<string, number>;
  // Actions
  onLeaveRoom: () => void;
  onTerminateGame?: () => void;
  onResetVoice?: () => void;
  onShowRoleGuide?: () => void;
}

type ConfirmAction = 'leave' | 'terminate' | null;

export function RoomMoreMenu({
  open, onClose, phase, roomCode, spectators, amHost, isInVoice, activeRoleCounts,
  onLeaveRoom, onTerminateGame, onResetVoice, onShowRoleGuide,
}: Props) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const isActiveGame = phase !== 'lobby' && phase !== 'game_over';

  const handleConfirm = () => {
    if (confirmAction === 'leave') {
      onClose();
      onLeaveRoom();
    } else if (confirmAction === 'terminate') {
      onClose();
      onTerminateGame?.();
    }
    setConfirmAction(null);
  };

  const leaveTitle = amHost ? 'Close Room' : 'Leave Room';
  const leaveMsg = amHost
    ? 'You are the host. Leaving will close the room for everyone. Are you sure?'
    : 'Are you sure you want to leave this room?';

  const terminateTitle = 'Terminate Game';
  const terminateMsg = 'Stop the current game and return everyone to the lobby. The room will remain open.';

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-2xl overflow-hidden safe-area-bottom"
              style={{
                background: 'rgba(8,4,20,0.98)',
                border: '1px solid rgba(155,0,255,0.25)',
                borderBottom: 'none',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/8">
                <div>
                  <p className="font-display text-sm font-bold text-white/80 tracking-widest uppercase">Options</p>
                  <p className="text-[10px] font-mono text-white/30">Room {roomCode}</p>
                </div>
                <button onClick={onClose} className="text-white/40 hover:text-white text-lg transition-colors p-1">✕</button>
              </div>

              <div className="px-4 py-3 space-y-2 max-h-[70vh] overflow-y-auto">

                {/* Spectators section */}
                <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                    <span className="text-base">👁</span>
                    <span className="text-xs font-display font-bold text-white/60 tracking-widest uppercase">
                      Spectators
                    </span>
                    <span className="ml-auto text-xs font-mono text-white/30">{spectators.length}</span>
                  </div>
                  {spectators.length === 0 ? (
                    <p className="text-xs text-white/25 font-mono text-center py-3">No spectators</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {spectators.map(s => (
                        <div key={s.id} className="flex items-center gap-2 px-4 py-2">
                          <span className="text-sm">👁</span>
                          <span className="text-sm text-white/60">{s.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Roles section */}
                <ActiveRolesSection activeRoleCounts={activeRoleCounts} />

                {/* Role Guide */}
                {onShowRoleGuide && (
                  <button
                    onClick={() => { onClose(); onShowRoleGuide(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 transition-all active:scale-98 text-left"
                  >
                    <span className="text-xl">📖</span>
                    <span className="text-sm font-display font-semibold text-white/80 tracking-wide">Role Guide</span>
                    <span className="ml-auto text-white/20 text-xs">→</span>
                  </button>
                )}

                {/* Reset Voice/Video */}
                {onResetVoice && isInVoice && (
                  <button
                    onClick={() => { onClose(); onResetVoice(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-neon-cyan/15 bg-neon-cyan/5 hover:bg-neon-cyan/10 transition-all active:scale-98 text-left"
                  >
                    <span className="text-xl">🔄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-semibold text-neon-cyan/80 tracking-wide">Reset Voice/Video</p>
                      <p className="text-[10px] font-mono text-white/30">Reconnects mic, camera, and audio</p>
                    </div>
                  </button>
                )}

                {/* Terminate Game (host only, active game only) */}
                {amHost && isActiveGame && onTerminateGame && (
                  <button
                    onClick={() => setConfirmAction('terminate')}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 hover:bg-yellow-500/10 transition-all active:scale-98 text-left"
                  >
                    <span className="text-xl">⏹</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-display font-semibold text-yellow-400/80 tracking-wide">Terminate Game</p>
                      <p className="text-[10px] font-mono text-white/30">Stop game, return to lobby</p>
                    </div>
                  </button>
                )}

                {/* Leave Room */}
                <button
                  onClick={() => setConfirmAction('leave')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-neon-red/25 bg-neon-red/8 hover:bg-neon-red/15 transition-all active:scale-98 text-left"
                >
                  <span className="text-xl">{amHost ? '🔒' : '🚪'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-neon-red/80 tracking-wide">{leaveTitle}</p>
                    <p className="text-[10px] font-mono text-white/30">
                      {amHost ? 'Closes room for all players' : 'Return to home screen'}
                    </p>
                  </div>
                </button>

              </div>

              <div className="h-2" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation modals */}
      <ConfirmModal
        open={confirmAction === 'leave'}
        title={leaveTitle}
        message={leaveMsg}
        confirmLabel={amHost ? 'Yes, Close Room' : 'Yes, Leave'}
        dangerous
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={confirmAction === 'terminate'}
        title={terminateTitle}
        message={terminateMsg}
        confirmLabel="Yes, Terminate"
        dangerous
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}

const ROLE_ICONS: Record<string, string> = {
  citizen: '🏙', mafia: '🔫', don: '♛', sheriff: '🔍', doctor: '💉',
  maniac: '🌀', jester: '🃏', bodyguard: '🛡', spy: '🕵️',
  escort: '💃', vigilante: '⚖️', cult_leader: '🕯️',
  veteran: '🎖️', tracker: '👁', arsonist: '🔥', mayor: '👑',
};

const ROLE_COLORS: Record<string, string> = {
  citizen: 'rgba(255,255,255,0.5)',
  mafia: '#ff2d55', don: '#ff2d55',
  sheriff: '#60a5fa', doctor: '#00ff88',
  maniac: '#9b00ff', jester: '#a855f7',
  bodyguard: '#34d399', spy: '#00e5ff',
  escort: '#f472b6', vigilante: '#fbbf24',
  cult_leader: '#e879f9', veteran: '#fbbf24',
  tracker: '#60a5fa', arsonist: '#fb923c',
  mayor: '#ffd700',
};

const ROLE_ORDER = ['mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'spy', 'escort',
  'vigilante', 'tracker', 'veteran', 'mayor', 'maniac', 'arsonist', 'jester', 'cult_leader', 'citizen'];

function ActiveRolesSection({ activeRoleCounts }: { activeRoleCounts?: Record<string, number> }) {
  if (!activeRoleCounts) return null;

  const entries = Object.entries(activeRoleCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => (ROLE_ORDER.indexOf(a) ?? 99) - (ROLE_ORDER.indexOf(b) ?? 99));

  const totalSpecial = entries
    .filter(([role]) => role !== 'citizen')
    .reduce((s, [, c]) => s + c, 0);

  return (
    <div className="rounded-xl border border-white/8 bg-white/3 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
        <span className="text-base">⚔️</span>
        <span className="text-xs font-display font-bold text-white/60 tracking-widest uppercase">
          Active Roles
        </span>
        <span className="ml-auto text-xs font-mono text-white/30">
          {totalSpecial > 0 ? `${totalSpecial} special` : 'auto-assigned'}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-white/30 font-mono text-center py-3 px-4">
          Roles are auto-assigned based on player count
        </p>
      ) : (
        <div className="p-3 grid grid-cols-2 gap-1.5">
          {entries.map(([role, count]) => (
            <div
              key={role}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${ROLE_COLORS[role] ?? 'rgba(255,255,255,0.12)'}33`,
              }}
            >
              <span className="text-base flex-shrink-0">{ROLE_ICONS[role] ?? '?'}</span>
              <span className="text-[11px] font-mono text-white/75 truncate capitalize flex-1">
                {role.replace(/_/g, ' ')}
              </span>
              <span
                className="flex-shrink-0 text-[11px] font-display font-bold"
                style={{ color: ROLE_COLORS[role] ?? 'rgba(255,255,255,0.5)' }}
              >
                ×{count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
