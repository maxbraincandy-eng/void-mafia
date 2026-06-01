import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { GameOverResult, RoleKey, Team } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ConfettiEffect } from './ConfettiEffect';
import { XPToast } from '@/components/ui/XPToast';

type Phase = 'mafia_cinematic' | 'role_reveal' | 'highlights';

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

interface MVPBadge {
  icon: string;
  title: string;
  description: string;
  playerName?: string;
  color: string;
}

type PlayerEntry = { id: string; name: string; role: RoleKey; team: Team; survived: boolean };

function computeMVPBadges(players: PlayerEntry[], result: GameOverResult): MVPBadge[] {
  const badges: MVPBadge[] = [];
  const mafiaTeam = players.filter(p => p.team === 'mafia');
  const survivingMafia = mafiaTeam.filter(p => p.survived);

  if (survivingMafia.length === 1 && mafiaTeam.length > 1) {
    badges.push({
      icon: '💀', title: 'Last Standing',
      description: 'Final mafia member alive',
      playerName: survivingMafia[0].name, color: 'text-neon-pink',
    });
  }

  if (result.winner === 'town' && survivingMafia.length === 0) {
    badges.push({
      icon: '💯', title: 'Perfect Sweep',
      description: 'Town eliminated every mafia', color: 'text-neon-cyan',
    });
  }

  const townHero = players.find(
    p => p.team === 'town' && p.survived && p.role !== 'citizen' && result.winner === 'town',
  );
  if (townHero) {
    badges.push({
      icon: '🏆', title: 'Town Hero',
      description: 'Led town to victory',
      playerName: townHero.name, color: 'text-blue-400',
    });
  }

  const neutralSurvivor = players.find(p => p.team === 'neutral' && p.survived);
  if (neutralSurvivor) {
    badges.push({
      icon: '🌀', title: 'Lone Wolf',
      description: 'Survived as a neutral',
      playerName: neutralSurvivor.name, color: 'text-neon-purple',
    });
  }

  const cultLeader = players.find(p => p.role === 'cult_leader' && p.survived);
  if (cultLeader && result.winner === 'cult') {
    badges.push({
      icon: '🕯️', title: 'Cult Rises',
      description: 'Spread the cult to victory',
      playerName: cultLeader.name, color: 'text-fuchsia-400',
    });
  }

  return badges;
}

interface FlipCardProps {
  player: PlayerEntry;
  delay: number;
  myPlayerId: string | null;
  roleLabel: (role: RoleKey) => string;
}

function FlipCard({ player, delay, myPlayerId, roleLabel }: FlipCardProps) {
  const [done, setDone] = useState(false);
  const tc = TEAM_CONFIG[player.team];

  return (
    <div style={{ perspective: '500px' }}>
      <motion.div
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] }}
        onAnimationComplete={() => setDone(true)}
        style={{ transformStyle: 'preserve-3d', height: '80px' }}
        className="relative w-full"
      >
        {/* Front — question mark */}
        <div
          className="absolute inset-0 rounded-xl glass-panel border border-white/10 flex items-center justify-center"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            display: done ? 'none' : undefined,
          } as React.CSSProperties}
        >
          <span className="text-xl text-white/20 font-display">?</span>
        </div>
        {/* Back — role */}
        <div
          className={`absolute inset-0 rounded-xl border flex flex-col items-center justify-center gap-0.5 px-1 ${tc.border} ${tc.bg} ${
            player.id === myPlayerId ? 'ring-1 ring-white/25' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          } as React.CSSProperties}
        >
          <span className="text-xl leading-none">{ROLE_ICONS[player.role]}</span>
          <p className={`text-[9px] font-mono font-bold leading-none ${ROLE_COLORS[player.role]}`}>
            {roleLabel(player.role)}
          </p>
          <p className="text-[8px] text-white/40 truncate w-full text-center leading-none mt-0.5 px-1">
            {player.name}
          </p>
          <span className={`text-[8px] font-bold ${player.survived ? 'text-neon-green/70' : 'text-white/25'}`}>
            {player.survived ? '✓' : '☠'}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

interface Props {
  result: GameOverResult;
}

export function GameOver({ result }: Props) {
  const [phase, setPhase] = useState<Phase>('mafia_cinematic');

  const { amHost, restartGame, leaveRoom, isLoading, room, myPlayerId, xpGain, dismissXPGain, rematch } =
    useGameStore(s => ({
      amHost: s.amHost(),
      restartGame: s.restartGame,
      leaveRoom: s.leaveRoom,
      isLoading: s.isLoading,
      room: s.room,
      myPlayerId: s.myPlayerId,
      xpGain: s.xpGain,
      dismissXPGain: s.dismissXPGain,
      rematch: s.rematch,
    }));
  const t = useT();

  const WINNER_CONFIG: Record<Team, { label: string; color: string; glowColor: string; icon: string }> = {
    town:    { label: t.game.gameOver.townWins,  color: 'text-neon-cyan',   glowColor: '#00f5ff', icon: '⚖️' },
    mafia:   { label: t.game.gameOver.mafiaWins, color: 'text-neon-pink',   glowColor: '#ff00cc', icon: '🔫' },
    neutral: { label: t.game.gameOver.soloWin,   color: 'text-neon-purple', glowColor: '#9b00ff', icon: '🌀' },
    cult:    { label: t.game.gameOver.cultWins,  color: 'text-fuchsia-400', glowColor: '#c026d3', icon: '🕯️' },
  };

  const cfg = WINNER_CONFIG[result.winner];

  const survivalMap = useMemo(
    () => new Map<string, boolean>((room?.players ?? []).map(p => [p.id, p.isAlive])),
    [room],
  );

  const players = useMemo(
    () => Object.entries(result.allRoles).map(([id, data]) => ({
      id, ...data, survived: survivalMap.get(id) ?? false,
    })),
    [result, survivalMap],
  );

  const mafiaPlayers = useMemo(() => players.filter(p => p.team === 'mafia'), [players]);

  const byTeam = useMemo(() => ({
    mafia:   players.filter(p => p.team === 'mafia'),
    town:    players.filter(p => p.team === 'town'),
    neutral: players.filter(p => p.team === 'neutral'),
    cult:    players.filter(p => p.team === 'cult'),
  }), [players]);

  const myData = myPlayerId ? result.allRoles[myPlayerId] : null;
  const iWon = myData?.team === result.winner;
  const mvpBadges = useMemo(() => computeMVPBadges(players, result), [players, result]);

  const roleLabel = (role: RoleKey) =>
    (t.game.roles as Record<string, string>)[role] ?? role;

  // Phase 1 → 2
  useEffect(() => {
    if (phase !== 'mafia_cinematic') return;
    const ms = mafiaPlayers.length > 0
      ? 1000 + mafiaPlayers.length * 800 + 2200
      : 1800;
    const timer = setTimeout(() => setPhase('role_reveal'), ms);
    return () => clearTimeout(timer);
  }, [phase, mafiaPlayers.length]);

  // Phase 2 → 3
  useEffect(() => {
    if (phase !== 'role_reveal') return;
    const ms = 500 + players.length * 150 + 3500;
    const timer = setTimeout(() => setPhase('highlights'), ms);
    return () => clearTimeout(timer);
  }, [phase, players.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div className="absolute inset-0 bg-black" />

      <AnimatePresence mode="wait">
        {/* ── Phase 1: Mafia Cinematic ──────────────────────────────── */}
        {phase === 'mafia_cinematic' && (
          <motion.div
            key="mafia_cinematic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{
              background:
                'radial-gradient(ellipse 130% 70% at 50% 50%, rgba(220,0,60,0.18) 0%, transparent 70%)',
            }}
          >
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-mono text-xs text-white/35 uppercase tracking-widest mb-2"
            >
              The mafia was...
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 180, damping: 16 }}
              className="font-display text-5xl font-bold text-neon-pink tracking-widest mb-8"
              style={{ textShadow: '0 0 40px #ff00cc, 0 0 80px #ff00cc40' }}
            >
              {mafiaPlayers.length === 0 ? 'NOBODY' : 'UNMASKED'}
            </motion.h1>

            <div className="w-full max-w-xs space-y-3">
              {mafiaPlayers.map((player, i) => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -40, scale: 0.93 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{
                    delay: 1.0 + i * 0.8,
                    type: 'spring',
                    stiffness: 240,
                    damping: 20,
                  }}
                  className="flex items-center gap-4 glass-panel border border-neon-pink/35 bg-neon-pink/6 rounded-2xl px-5 py-4"
                >
                  <span className="text-3xl">{ROLE_ICONS[player.role]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg font-bold text-white truncate">{player.name}</p>
                    <p className="font-mono text-xs text-neon-pink">{roleLabel(player.role)}</p>
                  </div>
                  {!player.survived && (
                    <span className="text-white/25 text-base shrink-0">☠</span>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Skip */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              onClick={() => setPhase('role_reveal')}
              className="absolute bottom-8 right-8 text-white/20 hover:text-white/50 font-mono text-xs transition-colors"
            >
              SKIP
            </motion.button>
          </motion.div>
        )}

        {/* ── Phase 2: Role Reveal ───────────────────────────────────── */}
        {phase === 'role_reveal' && (
          <motion.div
            key="role_reveal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-start justify-start p-6 overflow-y-auto"
          >
            <div className="w-full max-w-sm mx-auto">
              <motion.h1
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="font-display text-2xl font-bold text-white/80 tracking-widest uppercase text-center mt-8 mb-1"
              >
                Role Reveal
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="text-white/25 font-mono text-xs uppercase tracking-widest text-center mb-6"
              >
                Every secret exposed
              </motion.p>

              <div className="grid grid-cols-3 gap-2">
                {players.map((player, i) => (
                  <FlipCard
                    key={player.id}
                    player={player}
                    delay={0.35 + i * 0.15}
                    myPlayerId={myPlayerId}
                    roleLabel={roleLabel}
                  />
                ))}
              </div>
            </div>

            {/* Skip */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              onClick={() => setPhase('highlights')}
              className="fixed bottom-8 right-8 text-white/20 hover:text-white/50 font-mono text-xs transition-colors"
            >
              SKIP
            </motion.button>
          </motion.div>
        )}

        {/* ── Phase 3: Highlights ────────────────────────────────────── */}
        {phase === 'highlights' && (
          <motion.div
            key="highlights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto"
          >
            {iWon && <ConfettiEffect colors={TEAM_CONFETTI[result.winner]} />}

            <div
              className="fixed inset-0 pointer-events-none"
              style={{ background: WINNER_BG[result.winner] }}
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

              {/* MVP badges */}
              {mvpBadges.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-5"
                >
                  <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/30 text-center mb-2">
                    Highlights
                  </h3>
                  <div className="space-y-1.5">
                    {mvpBadges.map((badge, i) => (
                      <motion.div
                        key={badge.title}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.08 }}
                        className="flex items-center gap-3 glass-panel border border-white/8 rounded-xl px-4 py-2.5"
                      >
                        <span className="text-xl shrink-0">{badge.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-display font-bold ${badge.color}`}>{badge.title}</p>
                          <p className="text-[10px] font-mono text-white/30">{badge.description}</p>
                        </div>
                        {badge.playerName && (
                          <span className="text-xs font-mono text-white/40 shrink-0">{badge.playerName}</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Personal callout */}
              {myData && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
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
                  <span
                    className={`text-xs font-mono font-bold ${
                      survivalMap.get(myPlayerId!) ? 'text-neon-green' : 'text-neon-red/80'
                    }`}
                  >
                    {survivalMap.get(myPlayerId!) ? t.game.gameOver.survived : t.game.gameOver.eliminated}
                  </span>
                </motion.div>
              )}

              {/* Roles grouped by team */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
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
                            transition={{ delay: 0.5 + i * 0.04 }}
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
                transition={{ delay: 0.55 }}
                className="space-y-3"
              >
                {amHost ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="primary" fullWidth loading={isLoading} onClick={restartGame}>
                      {t.game.gameOver.playAgain}
                    </Button>
                    <Button variant="secondary" fullWidth loading={isLoading} onClick={rematch}>
                      🔁 Rematch
                    </Button>
                  </div>
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
        )}
      </AnimatePresence>

      <XPToast gain={xpGain} onDismiss={dismissXPGain} />
    </motion.div>
  );
}
