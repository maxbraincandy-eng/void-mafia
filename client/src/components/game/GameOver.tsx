import { motion } from 'framer-motion';
import { GameOverResult, RoleKey, Team } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ConfettiEffect } from './ConfettiEffect';

const TEAM_CONFETTI: Record<Team, string[]> = {
  town:    ['#00f5ff', '#00e5ff', '#ffffff', '#60a5fa', '#00ccff'],
  mafia:   ['#ff00cc', '#ff2d55', '#cc0066', '#ff69b4', '#330011'],
  neutral: ['#9b00ff', '#a855f7', '#c084fc', '#ffffff', '#7c3aed'],
  cult:    ['#c026d3', '#e879f9', '#a21caf', '#f0abfc', '#6b21a8'],
};

const WINNER_BG: Record<Team, string> = {
  town:    'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(0,200,255,0.18) 0%, transparent 60%)',
  mafia:   'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(255,0,180,0.18) 0%, transparent 60%)',
  neutral: 'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(140,0,255,0.18) 0%, transparent 60%)',
  cult:    'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(192,38,211,0.18) 0%, transparent 60%)',
};

interface Props {
  result: GameOverResult;
}

const ROLE_ICONS: Record<RoleKey, string> = {
  mafia: '🔫', citizen: '🏙', sheriff: '🔍', doctor: '💉', don: '♛',
  maniac: '🌀', jester: '🃏', bodyguard: '🛡',
  spy: '🕵️', escort: '💃', vigilante: '⚖️',
  cult_leader: '🕯️', cultist: '🔮', veteran: '🎖️',
  tracker: '👁', arsonist: '🔥', mayor: '👑',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  mafia: 'text-neon-pink', don: 'text-neon-pink',
  citizen: 'text-neon-cyan', sheriff: 'text-blue-400', doctor: 'text-neon-green',
  bodyguard: 'text-neon-green', spy: 'text-cyan-400', vigilante: 'text-yellow-400', escort: 'text-pink-400',
  maniac: 'text-neon-purple', jester: 'text-purple-400',
  cult_leader: 'text-fuchsia-400', cultist: 'text-fuchsia-300',
  veteran: 'text-yellow-400', tracker: 'text-blue-400',
  arsonist: 'text-orange-400', mayor: 'text-yellow-300',
};

const TEAM_CONFIG: Record<Team, { label: string; color: string; border: string; bg: string }> = {
  mafia:   { label: 'MAFIA',   color: 'text-neon-pink',    border: 'border-neon-pink/20',    bg: 'bg-neon-pink/5' },
  town:    { label: 'TOWN',    color: 'text-neon-cyan',    border: 'border-neon-cyan/20',    bg: 'bg-neon-cyan/5' },
  neutral: { label: 'NEUTRAL', color: 'text-neon-purple',  border: 'border-neon-purple/20',  bg: 'bg-neon-purple/5' },
  cult:    { label: 'CULT',    color: 'text-fuchsia-400',  border: 'border-fuchsia-400/20',  bg: 'bg-fuchsia-400/5' },
};

export function GameOver({ result }: Props) {
  const { amHost, restartGame, leaveRoom, isLoading, room, myPlayerId } = useGameStore(s => ({
    amHost: s.amHost(),
    restartGame: s.restartGame,
    leaveRoom: s.leaveRoom,
    isLoading: s.isLoading,
    room: s.room,
    myPlayerId: s.myPlayerId,
  }));
  const t = useT();

  const WINNER_CONFIG: Record<Team, { label: string; color: string; glowColor: string; icon: string }> = {
    town:    { label: t.game.gameOver.townWins,  color: 'text-neon-cyan',   glowColor: '#00f5ff', icon: '⚖️' },
    mafia:   { label: t.game.gameOver.mafiaWins, color: 'text-neon-pink',   glowColor: '#ff00cc', icon: '🔫' },
    neutral: { label: t.game.gameOver.soloWin,   color: 'text-neon-purple', glowColor: '#9b00ff', icon: '🌀' },
    cult:    { label: t.game.gameOver.cultWins,  color: 'text-fuchsia-400', glowColor: '#c026d3', icon: '🕯️' },
  };

  const cfg = WINNER_CONFIG[result.winner];

  // Survival info from room state
  const survivalMap = new Map<string, boolean>(
    (room?.players ?? []).map(p => [p.id, p.isAlive])
  );

  const myData = myPlayerId ? result.allRoles[myPlayerId] : null;

  const players = Object.entries(result.allRoles).map(([id, data]) => ({
    id, ...data, survived: survivalMap.get(id) ?? false,
  }));

  const byTeam: Record<Team, typeof players> = {
    mafia:   players.filter(p => p.team === 'mafia'),
    town:    players.filter(p => p.team === 'town'),
    neutral: players.filter(p => p.team === 'neutral'),
    cult:    players.filter(p => p.team === 'cult'),
  };

  const roleLabel = (role: RoleKey) =>
    t.game.roles[role as keyof typeof t.game.roles] ?? role;

  const iWon = myData?.team === result.winner;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-y-auto"
    >
      {/* Confetti for winners */}
      {iWon && <ConfettiEffect colors={TEAM_CONFETTI[result.winner]} />}

      {/* Winner team background glow */}
      <div
        className="fixed inset-0 pointer-events-none transition-opacity duration-1000"
        style={{ background: WINNER_BG[result.winner], zIndex: 0 }}
      />
      <div className="relative z-10 w-full max-w-lg py-8">
        {/* Winner announcement */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center mb-6"
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
            {t.game.gameOver.gameIsOver}
          </p>
        </motion.div>

        {/* Personal callout */}
        {myData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mb-5 glass-card border border-white/8 py-4 px-6 rounded-2xl"
          >
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-1">
              {t.game.gameOver.youWere}
            </p>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-2xl">{ROLE_ICONS[myData.role]}</span>
              <h2 className={`font-display text-2xl font-bold tracking-widest uppercase ${ROLE_COLORS[myData.role]}`}>
                {roleLabel(myData.role)}
              </h2>
            </div>
            <span className={`text-xs font-mono font-bold ${survivalMap.get(myPlayerId!) ? 'text-neon-green' : 'text-neon-red/80'}`}>
              {survivalMap.get(myPlayerId!) ? t.game.gameOver.survived : t.game.gameOver.eliminated}
            </span>
          </motion.div>
        )}

        {/* Roles grouped by team */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card border border-white/8 p-4 mb-6 space-y-4"
        >
          <h2 className="text-xs font-display uppercase tracking-widest text-white/40">
            {t.game.gameOver.finalRoles}
          </h2>

          {(['mafia', 'town', 'neutral', 'cult'] as Team[]).map(team => {
            const group = byTeam[team];
            if (group.length === 0) return null;
            const tc = TEAM_CONFIG[team];
            const aliveCount = group.filter(p => p.survived).length;
            return (
              <div key={team}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-display font-bold tracking-widest uppercase ${tc.color}`}>
                    {tc.label}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[10px] font-mono text-white/25">
                    {aliveCount}/{group.length} alive
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45 + i * 0.04 }}
                      className={`flex items-center gap-2 p-2 rounded-xl border ${tc.border} ${tc.bg} ${
                        p.id === myPlayerId ? 'ring-1 ring-white/15' : ''
                      }`}
                    >
                      <span className="text-lg shrink-0">{ROLE_ICONS[p.role]}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate leading-tight">
                          {p.name}
                          {p.id === myPlayerId && (
                            <span className="text-[9px] text-white/30 font-mono ml-1">you</span>
                          )}
                        </p>
                        <p className={`text-[10px] font-mono ${ROLE_COLORS[p.role]}`}>{roleLabel(p.role)}</p>
                      </div>
                      <span className={`text-[10px] shrink-0 font-bold ${p.survived ? 'text-neon-green/70' : 'text-white/20'}`}>
                        {p.survived ? '✓' : '☠'}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="space-y-3"
        >
          {amHost ? (
            <Button variant="primary" fullWidth loading={isLoading} onClick={restartGame}>
              {t.game.gameOver.playAgain}
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/4">
              <span className="text-white/40 font-mono text-sm animate-pulse">
                ⏳ {t.game.gameOver.waitingForHost}
              </span>
            </div>
          )}

          <Button variant="ghost" fullWidth loading={isLoading} onClick={() => leaveRoom()}>
            {t.game.gameOver.leaveRoom}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
