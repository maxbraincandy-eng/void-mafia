import { motion } from 'framer-motion';
import { GameOverResult, RoleKey, Team } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';

interface Props {
  result: GameOverResult;
}

const WINNER_CONFIG: Record<Team, { label: string; color: string; glowColor: string; icon: string }> = {
  town:    { label: 'Town Wins', color: 'text-neon-cyan',   glowColor: '#00f5ff', icon: '⚖️' },
  mafia:   { label: 'Mafia Wins', color: 'text-neon-pink',  glowColor: '#ff00cc', icon: '🔫' },
  neutral: { label: 'Solo Win',  color: 'text-neon-purple', glowColor: '#9b00ff', icon: '🌀' },
};

const ROLE_ICONS: Record<RoleKey, string> = {
  mafia: '🔫', citizen: '🏙', sheriff: '🔍', doctor: '💉', don: '♛',
  maniac: '🌀', jester: '🃏', bodyguard: '🛡',
  spy: '🕵️', escort: '💃', vigilante: '⚖️',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  mafia: 'text-neon-pink', don: 'text-neon-pink',
  citizen: 'text-neon-cyan', sheriff: 'text-blue-400', doctor: 'text-neon-green',
  bodyguard: 'text-neon-green', spy: 'text-cyan-400', vigilante: 'text-yellow-400', escort: 'text-pink-400',
  maniac: 'text-neon-purple', jester: 'text-purple-400',
};

export function GameOver({ result }: Props) {
  const { amHost, restartGame, leaveRoom, isLoading } = useGameStore(s => ({
    amHost: s.amHost(),
    restartGame: s.restartGame,
    leaveRoom: s.leaveRoom,
    isLoading: s.isLoading,
  }));

  const cfg = WINNER_CONFIG[result.winner];
  const players = Object.entries(result.allRoles).map(([id, data]) => ({ id, ...data }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg py-8">
        {/* Winner announcement */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center mb-8"
        >
          <div
            className="text-8xl mb-4 filter drop-shadow-lg"
            style={{ filter: `drop-shadow(0 0 30px ${cfg.glowColor})` }}
          >
            {cfg.icon}
          </div>
          <h1
            className={`font-display text-5xl font-bold tracking-widest uppercase ${cfg.color}`}
            style={{ textShadow: `0 0 30px ${cfg.glowColor}, 0 0 60px ${cfg.glowColor}60` }}
          >
            {cfg.label}
          </h1>
          <p className="text-white/40 font-mono text-sm mt-2 uppercase tracking-widest">
            The game is over
          </p>
        </motion.div>

        {/* Role reveal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card border border-white/8 p-4 mb-6"
        >
          <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
            🔓 Final Roles
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {players.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-void-50/60 border border-white/5"
              >
                <span className="text-xl">{ROLE_ICONS[p.role]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                  <p className={`text-xs font-mono ${ROLE_COLORS[p.role]}`}>{p.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex gap-3"
        >
          {amHost && (
            <Button variant="primary" fullWidth loading={isLoading} onClick={restartGame}>
              ↻ Play Again
            </Button>
          )}
          <Button variant="secondary" fullWidth loading={isLoading} onClick={() => leaveRoom()}>
            Leave Room
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
