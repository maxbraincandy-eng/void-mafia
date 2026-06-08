import { motion } from 'framer-motion';
import clsx from 'clsx';
import { RoomPublic, PlayerPublic } from '@/types/index';
import { useT } from '@/store/langStore';

interface Props {
  room: RoomPublic;
  myPlayer: PlayerPublic | null;
}

export function SpectatorTheater({ room, myPlayer }: Props) {
  const t = useT();

  const activePlayers = room.players.filter(p => !p.isSpectator);
  const alivePlayers = activePlayers.filter(p => p.isAlive);
  const deadPlayers = activePlayers.filter(p => !p.isAlive);
  const spectators = room.players.filter(p => p.isSpectator);
  const isGameActive = room.phase !== 'lobby' && room.phase !== 'game_over';

  return (
    <div className="space-y-3">
      {/* Theater header */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-neon-purple/20 bg-neon-purple/[0.06]">
        <span className="text-base" style={{ filter: 'drop-shadow(0 0 6px rgba(155,0,255,0.9))' }}>👁</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono tracking-[0.25em] uppercase text-neon-purple/70">Spectator Theater</p>
          <p className="text-[10px] font-mono text-white/30 truncate">
            {spectators.length} watching · {alivePlayers.length} alive
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse flex-shrink-0" />
          <span className="text-[10px] font-mono text-neon-purple/60 uppercase tracking-widest">LIVE</span>
        </div>
      </div>

      {/* Role distribution (game active only) */}
      {isGameActive && Object.keys(room.activeRoleCounts ?? {}).length > 0 && (
        <div className="rounded-xl border border-white/[0.06] p-3 space-y-2" style={{ background: 'rgba(10,6,28,0.5)' }}>
          <p className="text-[10px] font-mono tracking-widest uppercase text-white/30">Roles in play</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(room.activeRoleCounts).map(([role, count]) => (
              <span key={role} className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 text-white/40">
                {t.game.roles[role as keyof typeof t.game.roles] ?? role} ×{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Player status grid */}
      {isGameActive && activePlayers.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] p-3 space-y-2" style={{ background: 'rgba(10,6,28,0.5)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] font-mono tracking-widest uppercase text-white/30">Players</p>
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-neon-green/60">{alivePlayers.length} alive</span>
              <span className="text-white/20">·</span>
              <span className="text-white/30">{deadPlayers.length} dead</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {activePlayers.map(p => (
              <PlayerStatusTile key={p.id} player={p} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Who's watching */}
      {spectators.length > 1 && (
        <div className="rounded-xl border border-neon-purple/10 p-3 space-y-1.5" style={{ background: 'rgba(20,6,40,0.4)' }}>
          <p className="text-[10px] font-mono tracking-widest uppercase text-neon-purple/40">Also watching</p>
          <div className="flex flex-wrap gap-1.5">
            {spectators
              .filter(s => s.id !== myPlayer?.id)
              .slice(0, 8)
              .map(s => (
                <span key={s.id} className="text-[10px] font-mono text-white/40 px-2 py-0.5 rounded border border-white/8">
                  {s.name}
                </span>
              ))}
            {spectators.length - 1 > 8 && (
              <span className="text-[10px] font-mono text-white/25">
                +{spectators.length - 1 - 8} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerStatusTile({ player, t }: { player: PlayerPublic; t: any }) {
  const roleLabel = player.role ? (t.game.roles[player.role as keyof typeof t.game.roles] ?? player.role) : null;

  return (
    <motion.div
      layout
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-mono transition-all',
        player.isAlive
          ? 'border-neon-green/15 bg-neon-green/[0.04] text-white/70'
          : 'border-white/[0.05] bg-white/[0.02] text-white/25 line-through',
      )}
    >
      <span className={clsx(
        'w-1 h-1 rounded-full flex-shrink-0',
        player.isAlive ? 'bg-neon-green' : 'bg-white/20',
      )} />
      <span className="truncate flex-1">{player.name}</span>
      {roleLabel && (
        <span className={clsx(
          'text-[9px] tracking-widest',
          player.team === 'mafia' ? 'text-neon-red/60'
            : player.team === 'town' ? 'text-neon-green/50'
            : player.team === 'neutral' ? 'text-yellow-400/50'
            : 'text-white/30',
        )}>
          {roleLabel}
        </span>
      )}
    </motion.div>
  );
}
