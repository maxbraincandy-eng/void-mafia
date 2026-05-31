import { useState } from 'react';
import { motion } from 'framer-motion';
import { PlayerPublic, RoleKey } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

export function NightPanel() {
  const { room, myPlayer, myRole, submitNightAction, isLoading } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    myRole: s.myRole,
    submitNightAction: s.submitNightAction,
    isLoading: s.isLoading,
  }));
  const t = useT();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!room || !myPlayer) return null;

  const role = myPlayer.role;
  const hasActed = myPlayer.hasActed;
  const wakeAtNight = role && ['mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'maniac', 'vigilante', 'escort'].includes(role);

  if (!wakeAtNight) {
    const isSpy = role === 'spy';
    const msg = isSpy ? t.game.night.spyWaiting : t.game.night.citizenSleep;
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-4xl animate-pulse">{isSpy ? '🕵️' : '😴'}</div>
        <p className="text-white/50 font-mono text-sm text-center whitespace-pre-line">{msg}</p>
      </div>
    );
  }

  if (!myPlayer.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="text-3xl">💀</div>
        <p className="text-white/40 font-mono text-sm">{t.game.night.eliminatedMsg}</p>
      </div>
    );
  }

  if (hasActed) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-40 gap-3"
      >
        <div className="text-3xl">✅</div>
        <p className="text-neon-green font-mono text-sm">{t.game.night.waitingMsg}</p>
      </motion.div>
    );
  }

  // Determine valid targets
  const alivePlayers = room.players.filter(p => p.isAlive);
  const targetablePlayers = alivePlayers.filter(p => {
    if (p.id === myPlayer.id) return false;
    if ((role === 'mafia' || role === 'don') && p.team === 'mafia') return false;
    return true;
  });

  // Doctor and bodyguard can include self as a target
  const targets = (role === 'doctor' || role === 'bodyguard')
    ? [myPlayer, ...targetablePlayers.filter(p => p.id !== myPlayer.id)]
    : targetablePlayers;

  const selectableIds = new Set(targets.map(p => p.id));

  const actionLabel =
    role === 'sheriff'   ? t.game.nightActions.investigate
    : role === 'doctor'  ? t.game.nightActions.protect
    : role === 'bodyguard' ? t.game.nightActions.guard
    : role === 'escort'  ? t.game.nightActions.distract
    : t.game.nightActions.eliminate;

  const roleDesc = t.game.nightRoleDesc[role as keyof typeof t.game.nightRoleDesc]
    ?? t.game.night.actionDefault;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-white/8 bg-void-50/40">
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">{t.game.night.objective}</p>
        <p className="text-sm text-white/80">{roleDesc}</p>
      </div>

      <PlayerList
        players={room.players}
        phase="night"
        onSelectTarget={p => setSelectedId(p.id)}
        selectableIds={selectableIds}
        selectedId={selectedId}
      />

      {selectedId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button
            fullWidth
            loading={isLoading}
            onClick={() => submitNightAction(selectedId)}
            variant={role === 'doctor' ? 'neon-green' : role === 'sheriff' ? 'neon-cyan' : 'neon-pink'}
          >
            {actionLabel}: {room.players.find(p => p.id === selectedId)?.name}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
