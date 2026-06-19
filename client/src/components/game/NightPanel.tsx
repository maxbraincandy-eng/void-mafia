import { useState } from 'react';
import { motion } from 'framer-motion';
import { RoleKey } from '@/types/index';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { PlayerList } from './PlayerList';
import { Button } from '@/components/ui/Button';

const WAKE_ROLES = new Set<RoleKey>([
  'mafia', 'don', 'sheriff', 'doctor', 'bodyguard', 'maniac', 'vigilante',
  'escort', 'tracker', 'veteran', 'arsonist', 'cult_leader', 'yakuza',
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
  const [lastAction, setLastAction] = useState<{ verb: string; name: string } | null>(null);

  if (!room || !myPlayer) return null;

  const role = myPlayer.role as RoleKey | undefined;
  const hasActed = myPlayer.hasActed;
  const wakeAtNight = role && WAKE_ROLES.has(role);

  if (!wakeAtNight) {
    const isSpy = role === 'spy';
    const isShogun = role === 'shogun';
    if (isShogun) {
      const yakuzaPlayer = room.players.find(p => p.role === 'yakuza');
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="text-4xl">⚔️</div>
          <p className="font-mono text-sm text-center" style={{ color: '#ef4444' }}>
            You are hidden support for the Yakuza.
          </p>
          {yakuzaPlayer && (
            <p className="text-white/50 font-mono text-xs text-center">
              Yakuza: <span className="text-red-400 font-bold">{yakuzaPlayer.name}</span>
            </p>
          )}
          <p className="text-white/30 font-mono text-xs text-center">Your identity appears clean to investigators.</p>
        </div>
      );
    }
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
        className="flex items-center justify-center gap-3 py-6"
      >
        <span className="text-2xl">✓</span>
        <div>
          <p className="text-sm font-display font-bold text-neon-green uppercase tracking-widest">Action confirmed</p>
          <p className="text-xs font-mono text-white/40">
            {lastAction ? `${lastAction.verb}: ${lastAction.name} · ` : ''}Waiting for night to end…
          </p>
        </div>
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
          onClick={() => { setLastAction({ verb: 'Alert', name: 'active' }); submitNightAction(myPlayer.id); }}
        >
          🎖️ {nightActions['alert'] ?? 'Go on Alert'}
        </Button>
      </div>
    );
  }

  // ── Determine valid targets ───────────────────────────────────────
  const isMafiaRole = role === 'mafia' || role === 'don';
  const canSelfKill = isMafiaRole && (room.settings.mafiaCanSelfKill ?? false);
  const targetablePlayers = room.players.filter(p => {
    if (!p.isAlive) return false;
    if (p.id === myPlayer.id) return false;
    if (isMafiaRole && p.team === 'mafia') return false;
    if (role === 'cult_leader' && p.team === 'cult') return false;
    if (role === 'yakuza' && p.team === 'yakuza') return false;
    return true;
  });

  // Yakuza info panel — show Shogun ally above target list
  const yakuzaShogunInfo = role === 'yakuza'
    ? room.players.find(p => p.role === 'shogun')
    : null;

  // Doctor/Bodyguard can protect themselves; Mafia can self-kill if setting is on
  const targets = (role === 'doctor' || role === 'bodyguard' || canSelfKill)
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
    : role === 'yakuza'   ? nightActions['eliminate']   ?? 'Eliminate'
    : nightActions['eliminate'] ?? 'Eliminate';

  const confirmVariant =
    role === 'doctor' || role === 'bodyguard' ? 'neon-green'
    : role === 'sheriff' || role === 'tracker' ? 'neon-cyan'
    : role === 'cult_leader' ? 'neon-purple'
    : role === 'yakuza' ? 'danger'
    : 'neon-pink';

  // Mafia teammates' current kill votes (only visible to Mafia/Don)
  const mafiaVotePanel = (role === 'mafia' || role === 'don') && room.mafiaVotes
    ? Object.values(room.mafiaVotes).filter(v => v.voterName !== myPlayer.name)
    : null;

  // Compute consensus state for Mafia
  const allMafiaTeammates = room.players.filter(
    p => p.isAlive && (p.role === 'mafia' || p.role === 'don') && p.id !== myPlayer.id,
  );
  const mafiaVoteTargets = room.mafiaVotes ? Object.values(room.mafiaVotes).map(v => v.targetName) : [];
  const myMafiaVote = room.mafiaVotes?.[myPlayer.id];
  const allVotesSame = mafiaVoteTargets.length > 0
    && mafiaVoteTargets.every(t => t === mafiaVoteTargets[0]);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-white/8 bg-void-50/40">
        <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">{t.game.night.objective}</p>
        <p className="text-sm text-white/80">{roleDesc}</p>
      </div>

      {/* Mafia teammate votes panel */}
      {(role === 'mafia' || role === 'don') && allMafiaTeammates.length > 0 && (
        <div className="p-3 rounded-xl border border-pink-500/30 bg-pink-950/20 space-y-1.5">
          <p className="text-[12px] font-mono text-pink-400/60 uppercase tracking-widest">
            Team Kill — {allVotesSame && mafiaVoteTargets.length > 0 ? '✓ Agreed' : mafiaVoteTargets.length > 0 ? '⚠ Disagreement' : 'Waiting…'}
          </p>
          {allMafiaTeammates.map(tm => {
            const vote = room.mafiaVotes?.[tm.id];
            return (
              <div key={tm.id} className="flex items-center justify-between text-xs font-mono">
                <span className="text-pink-300">{tm.role === 'don' ? '👑' : '🔫'} {tm.name}</span>
                <span className={vote ? 'text-white/70' : 'text-white/25 animate-pulse'}>
                  {vote ? `→ ${vote.targetName}` : '…'}
                </span>
              </div>
            );
          })}
          {myMafiaVote && (
            <div className="flex items-center justify-between text-xs font-mono border-t border-pink-500/20 pt-1.5 mt-1">
              <span className="text-pink-300/60">You</span>
              <span className="text-white/70">→ {myMafiaVote.targetName}</span>
            </div>
          )}
        </div>
      )}

      {yakuzaShogunInfo && (
        <div className="p-3 rounded-xl border border-red-500/30 bg-red-950/20">
          <p className="text-[12px] font-mono text-red-400/60 uppercase tracking-widest mb-0.5">Your Ally</p>
          <p className="text-sm font-bold text-red-400">⚔️ Shogun: {yakuzaShogunInfo.name}</p>
        </div>
      )}

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
          onClick={() => { setLastAction({ verb: 'Ignite', name: 'all doused' }); submitNightAction(myPlayer.id); }}
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
            onClick={() => {
              const targetName = room.players.find(p => p.id === selectedId)?.name ?? '';
              setLastAction({ verb: actionLabel, name: targetName });
              submitNightAction(selectedId);
              setSelectedId(null);
            }}
            variant={confirmVariant}
          >
            {actionLabel}: {room.players.find(p => p.id === selectedId)?.name}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
