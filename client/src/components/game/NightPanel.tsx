import { useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { PlayerPublic, RoleKey } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

const NIGHT_ROLE_DESCRIPTIONS: Partial<Record<RoleKey, string>> = {
  mafia:      'Choose a player to eliminate tonight.',
  don:        'Choose a player to eliminate. You appear innocent to investigators.',
  sheriff:    'Investigate a player — learn if they are Mafia.',
  doctor:     'Protect one player from elimination tonight.',
  bodyguard:  'Guard a player. If mafia attacks them tonight, you die in their place.',
  maniac:     'Choose anyone to eliminate. You win alone.',
  vigilante:  'Choose a player to eliminate. Be careful — mistakes cost the town.',
  escort:     'Distract a player — their night action is cancelled.',
};

export function NightPanel() {
  const { room, myPlayer, myRole, submitNightAction, isLoading } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    myRole: s.myRole,
    submitNightAction: s.submitNightAction,
    isLoading: s.isLoading,
  }));

  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!room || !myPlayer) return null;

  const role = myPlayer.role;
  const hasActed = myPlayer.hasActed;
  const wakeAtNight = role && ['mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'maniac', 'vigilante', 'escort'].includes(role);

  if (!wakeAtNight) {
    const isSpy = role === 'spy';
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-4xl animate-pulse">{isSpy ? '🕵️' : '😴'}</div>
        <p className="text-white/50 font-mono text-sm text-center">
          {isSpy
            ? <>You observe from the shadows.<br />A report will arrive at dawn…</>
            : <>Citizens sleep during the night.<br />Wait for dawn…</>}
        </p>
      </div>
    );
  }

  if (!myPlayer.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3">
        <div className="text-3xl">💀</div>
        <p className="text-white/40 font-mono text-sm">You have been eliminated.</p>
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
        <p className="text-neon-green font-mono text-sm">Action submitted. Waiting for others…</p>
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

  const actionLabel = role === 'sheriff' ? 'Investigate'
    : role === 'doctor' ? 'Protect'
    : role === 'bodyguard' ? 'Guard'
    : role === 'escort' ? 'Distract'
    : 'Eliminate';

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-white/8 bg-void-50/40">
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">Night Objective</p>
        <p className="text-sm text-white/80">
          {NIGHT_ROLE_DESCRIPTIONS[role as RoleKey] ?? 'Take your action.'}
        </p>
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
