import { useState } from 'react';
import { motion } from 'framer-motion';
import { RoleKey } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

const WAKE_ROLES = new Set<RoleKey>([
  'mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'maniac', 'vigilante',
  'escort', 'tracker', 'veteran', 'arsonist', 'cult_leader',
]);

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

  const role = myPlayer.role as RoleKey | undefined;
  const hasActed = myPlayer.hasActed;
  const wakeAtNight = role && WAKE_ROLES.has(role);

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

  const nightRoleDesc = t.game.nightRoleDesc as Record<string, string>;
  const nightActions  = t.game.nightActions  as Record<string, string>;
  const roleDesc = nightRoleDesc[role ?? ''] ?? t.game.night.actionDefault;

  // ── Veteran: single "Go on Alert" button, self-targets ───────────
  if (role === 'veteran') {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-xl border border-white/8 bg-void-50/40">
          <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">{t.game.night.objective}</p>
          <p className="text-sm text-white/80">{roleDesc}</p>
        </div>
        <Button
          fullWidth
          variant="danger"
          loading={isLoading}
          onClick={() => submitNightAction(myPlayer.id)}
        >
          🎖️ {nightActions['alert'] ?? 'Go on Alert'}
        </Button>
      </div>
    );
  }

  // ── Determine valid targets ───────────────────────────────────────
  const targetablePlayers = room.players.filter(p => {
    if (!p.isAlive) return false;
    if (p.id === myPlayer.id) return false;
    if ((role === 'mafia' || role === 'don') && p.team === 'mafia') return false;
    if (role === 'cult_leader' && p.team === 'cult') return false;
    return true;
  });

  // Doctor/Bodyguard can protect themselves
  const targets = (role === 'doctor' || role === 'bodyguard')
    ? [myPlayer, ...targetablePlayers]
    : targetablePlayers;

  const selectableIds = new Set(targets.map(p => p.id));

  const actionLabel =
    role === 'sheriff'     ? nightActions['investigate'] ?? 'Investigate'
    : role === 'doctor'   ? nightActions['protect']     ?? 'Protect'
    : role === 'bodyguard' ? nightActions['guard']      ?? 'Guard'
    : role === 'escort'   ? nightActions['distract']    ?? 'Distract'
    : role === 'tracker'  ? nightActions['track']       ?? 'Track'
    : role === 'arsonist' ? nightActions['douse']       ?? 'Douse'
    : role === 'cult_leader' ? nightActions['convert']  ?? 'Convert'
    : nightActions['eliminate'] ?? 'Eliminate';

  const confirmVariant =
    role === 'doctor' || role === 'bodyguard' ? 'neon-green'
    : role === 'sheriff' || role === 'tracker' ? 'neon-cyan'
    : role === 'cult_leader' ? 'neon-purple'
    : 'neon-pink';

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

      {/* Arsonist: always-visible Ignite button (self-target) */}
      {role === 'arsonist' && (
        <Button
          fullWidth
          variant="danger"
          loading={isLoading}
          onClick={() => submitNightAction(myPlayer.id)}
        >
          🔥 {nightActions['ignite'] ?? 'Ignite All Doused'}
        </Button>
      )}

      {selectedId && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Button
            fullWidth
            loading={isLoading}
            onClick={() => { submitNightAction(selectedId); setSelectedId(null); }}
            variant={confirmVariant}
          >
            {actionLabel}: {room.players.find(p => p.id === selectedId)?.name}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
