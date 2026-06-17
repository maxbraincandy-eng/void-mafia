import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { GameOverResult, RoleKey, Team } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { useGameStore } from '@/store/gameStore';
import { useT } from '@/store/langStore';
import { ConfettiEffect } from './ConfettiEffect';
import { XPToast } from '@/components/ui/XPToast';
import { LevelMilestoneOverlay } from '@/components/ui/LevelMilestoneOverlay';

type Phase = 'mafia_cinematic' | 'role_reveal' | 'highlights' | 'timeline';

const TEAM_CONFETTI: Record<Team, string[]> = {
  town:    ['#00f5ff', '#00e5ff', '#ffffff', '#60a5fa', '#00ccff'],
  mafia:   ['#ff00cc', '#ff2d55', '#cc0066', '#ff69b4', '#330011'],
  neutral: ['#9b00ff', '#a855f7', '#c084fc', '#ffffff', '#7c3aed'],
  cult:    ['#c026d3', '#e879f9', '#a21caf', '#f0abfc', '#6b21a8'],
  yakuza:  ['#ef4444', '#dc2626', '#fca5a5', '#991b1b', '#ffd700'],
};

const WINNER_BG: Record<Team, string> = {
  town:    'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(0,200,255,0.18) 0%, transparent 60%)',
  mafia:   'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(255,0,180,0.18) 0%, transparent 60%)',
  neutral: 'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(140,0,255,0.18) 0%, transparent 60%)',
  cult:    'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(192,38,211,0.18) 0%, transparent 60%)',
  yakuza:  'radial-gradient(ellipse 180% 60% at 50% -10%, rgba(239,68,68,0.18) 0%, transparent 60%)',
};

const ROLE_ICONS: Record<RoleKey, string> = {
  mafia: '◆', citizen: '◈', sheriff: '✦', doctor: '+', don: '♛',
  maniac: '∞', jester: '✧', bodyguard: '⬡',
  spy: '◉', escort: '✿', vigilante: '⚖',
  cult_leader: '⛤', cultist: '◎', veteran: '★',
  tracker: '◯', arsonist: '△', mayor: '♔',
  yakuza: '龍', shogun: '⚔',
};

const ROLE_CARD_IMAGES: Partial<Record<RoleKey | string, string>> = {
  citizen:     '/roles/citizen.png',
  sheriff:     '/roles/sheriff.png',
  doctor:      '/roles/doctor.png',
  cult_leader: '/roles/cult_leader.png',
  mafia:       '/roles/mafia.svg',
  don:         '/roles/don.svg',
  maniac:      '/roles/maniac.svg',
  jester:      '/roles/jester.svg',
  bodyguard:   '/roles/bodyguard.svg',
  spy:         '/roles/spy.svg',
  escort:      '/roles/escort.svg',
  vigilante:   '/roles/vigilante.svg',
  veteran:     '/roles/veteran.svg',
  tracker:     '/roles/tracker.svg',
  arsonist:    '/roles/arsonist.svg',
  mayor:       '/roles/mayor.svg',
  cultist:     '/roles/cultist.svg',
};

const ROLE_COLORS: Record<RoleKey, string> = {
  mafia: 'text-neon-pink', don: 'text-neon-pink',
  citizen: 'text-neon-cyan', sheriff: 'text-blue-400', doctor: 'text-neon-green',
  bodyguard: 'text-neon-green', spy: 'text-cyan-400', vigilante: 'text-yellow-400', escort: 'text-pink-400',
  maniac: 'text-neon-purple', jester: 'text-purple-400',
  cult_leader: 'text-fuchsia-400', cultist: 'text-fuchsia-300',
  veteran: 'text-yellow-400', tracker: 'text-blue-400',
  arsonist: 'text-orange-400', mayor: 'text-yellow-300',
  yakuza: 'text-red-400', shogun: 'text-red-300',
};

const TEAM_CONFIG: Record<Team, { label: string; color: string; border: string; bg: string; glow: string }> = {
  mafia:   { label: 'MAFIA',   color: 'text-neon-pink',    border: 'border-neon-pink/20',    bg: 'bg-neon-pink/5',    glow: '#ff00cc' },
  town:    { label: 'TOWN',    color: 'text-neon-cyan',    border: 'border-neon-cyan/20',    bg: 'bg-neon-cyan/5',    glow: '#00f5ff' },
  neutral: { label: 'NEUTRAL', color: 'text-neon-purple',  border: 'border-neon-purple/20',  bg: 'bg-neon-purple/5',  glow: '#9b00ff' },
  cult:    { label: 'CULT',    color: 'text-fuchsia-400',  border: 'border-fuchsia-400/20',  bg: 'bg-fuchsia-400/5',  glow: '#c026d3' },
  yakuza:  { label: 'YAKUZA',  color: 'text-red-400',      border: 'border-red-500/20',      bg: 'bg-red-950/10',     glow: '#ef4444' },
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
      icon: '◆', title: 'Last Standing',
      description: 'Final mafia member alive',
      playerName: survivingMafia[0].name, color: 'text-neon-pink',
    });
  }
  if (result.winner === 'town' && survivingMafia.length === 0) {
    badges.push({
      icon: '✦', title: 'Perfect Sweep',
      description: 'Town eliminated every mafia', color: 'text-neon-cyan',
    });
  }
  const townHero = players.find(
    p => p.team === 'town' && p.survived && p.role !== 'citizen' && result.winner === 'town',
  );
  if (townHero) {
    badges.push({
      icon: '★', title: 'Town Hero',
      description: 'Led town to victory',
      playerName: townHero.name, color: 'text-blue-400',
    });
  }
  const neutralSurvivor = players.find(p => p.team === 'neutral' && p.survived);
  if (neutralSurvivor) {
    badges.push({
      icon: '∞', title: 'Lone Wolf',
      description: 'Survived as a neutral',
      playerName: neutralSurvivor.name, color: 'text-neon-purple',
    });
  }
  const cultLeader = players.find(p => p.role === 'cult_leader' && p.survived);
  if (cultLeader && result.winner === 'cult') {
    badges.push({
      icon: '⛤', title: 'Cult Rises',
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
  const cardImg = ROLE_CARD_IMAGES[player.role] ?? null;

  return (
    <div style={{ perspective: '500px' }}>
      <motion.div
        animate={{ rotateY: 180 }}
        transition={{ duration: 0.5, delay, ease: [0.4, 0, 0.2, 1] }}
        onAnimationComplete={() => setDone(true)}
        style={{ transformStyle: 'preserve-3d', height: '90px' }}
        className="relative w-full"
      >
        {/* Front */}
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
        {/* Back */}
        <div
          className={`absolute inset-0 rounded-xl border overflow-hidden flex flex-col items-center justify-center gap-0.5 px-1 ${tc.border} ${tc.bg} ${
            player.id === myPlayerId ? 'ring-1 ring-white/30' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          } as React.CSSProperties}
        >
          {cardImg && (
            <img
              src={cardImg}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-25"
              draggable={false}
            />
          )}
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="text-lg leading-none font-mono" style={{ color: tc.glow }}>{ROLE_ICONS[player.role]}</span>
            <p className={`text-[9px] font-mono font-bold leading-none ${ROLE_COLORS[player.role]}`}>
              {roleLabel(player.role)}
            </p>
            <p className="text-[8px] text-white/40 truncate w-full text-center leading-none mt-0.5 px-1">
              {player.name}
            </p>
            <span className={`text-[8px] font-bold ${player.survived ? 'text-neon-green/70' : 'text-white/25'}`}>
              {player.survived ? '✓' : '×'}
            </span>
          </div>
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

  const { leaveRoom, restartGame, isLoading, room, myPlayerId, xpGain, dismissXPGain } =
    useGameStore(s => ({
      leaveRoom: s.leaveRoom,
      restartGame: s.restartGame,
      isLoading: s.isLoading,
      room: s.room,
      myPlayerId: s.myPlayerId,
      xpGain: s.xpGain,
      dismissXPGain: s.dismissXPGain,
    }));
  const t = useT();

  const myPlayerData = room?.players.find(p => p.id === myPlayerId);
  const amHost = myPlayerData?.isHost ?? false;

  const WINNER_CONFIG: Record<Team, { label: string; color: string; glowColor: string; symbol: string }> = {
    town:    { label: t.game.gameOver.townWins,  color: 'text-neon-cyan',   glowColor: '#00f5ff', symbol: '✦' },
    mafia:   { label: t.game.gameOver.mafiaWins, color: 'text-neon-pink',   glowColor: '#ff00cc', symbol: '◆' },
    neutral: { label: t.game.gameOver.soloWin,   color: 'text-neon-purple', glowColor: '#9b00ff', symbol: '∞' },
    cult:    { label: t.game.gameOver.cultWins,  color: 'text-fuchsia-400', glowColor: '#c026d3', symbol: '⛤' },
    yakuza:  { label: 'Yakuza Wins',             color: 'text-red-400',     glowColor: '#ef4444', symbol: '龍' },
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
    yakuza:  players.filter(p => p.team === 'yakuza'),
  }), [players]);

  const myData = myPlayerId ? result.allRoles[myPlayerId] : null;
  const iWon = myData?.team === result.winner;
  const mvpBadges = useMemo(() => computeMVPBadges(players, result), [players, result]);

  const roleLabel = (role: RoleKey) =>
    (t.game.roles as Record<string, string>)[role] ?? role;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-hidden"
    >
      <div className="absolute inset-0 bg-black" />

      <AnimatePresence mode="wait">
        {/* ── Phase 1: Mafia Cinematic ── */}
        {phase === 'mafia_cinematic' && (
          <motion.div
            key="mafia_cinematic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
            style={{ background: 'radial-gradient(ellipse 130% 70% at 50% 50%, rgba(220,0,60,0.18) 0%, transparent 70%)' }}
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
                  transition={{ delay: 1.0 + i * 0.8, type: 'spring', stiffness: 240, damping: 20 }}
                  className="flex items-center gap-4 glass-panel border border-neon-pink/35 bg-neon-pink/6 rounded-2xl px-5 py-4"
                >
                  <span className="text-2xl font-mono text-neon-pink">{ROLE_ICONS[player.role]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg font-bold text-white truncate">{player.name}</p>
                    <p className="font-mono text-xs text-neon-pink">{roleLabel(player.role)}</p>
                  </div>
                  {!player.survived && <span className="text-white/25 text-base shrink-0">×</span>}
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 }}
              className="mt-8 w-full max-w-xs"
            >
              <Button variant="primary" fullWidth onClick={() => setPhase('role_reveal')}>
                {t.game.gameOver.continueBtn}
              </Button>
            </motion.div>
          </motion.div>
        )}

        {/* ── Phase 2: Role Reveal ── */}
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

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="mt-6 pb-4"
              >
                <Button variant="primary" fullWidth onClick={() => setPhase('highlights')}>
                  {t.game.gameOver.continueBtn}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ── Phase 3: Highlights ── */}
        {phase === 'highlights' && (
          <motion.div
            key="highlights"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 overflow-y-auto"
          >
            {iWon && <ConfettiEffect colors={TEAM_CONFETTI[result.winner]} />}
            <div className="fixed inset-0 pointer-events-none" style={{ background: WINNER_BG[result.winner] }} />

            <div className="relative z-10 w-full max-w-md mx-auto px-4 pt-10 pb-8 flex flex-col gap-4">

              {/* Winner banner */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                className="text-center py-5"
              >
                <div
                  className="font-mono text-5xl mb-2 leading-none"
                  style={{ color: cfg.glowColor, filter: `drop-shadow(0 0 18px ${cfg.glowColor})` }}
                >
                  {cfg.symbol}
                </div>
                <h1
                  className={`font-display text-4xl font-bold tracking-widest uppercase ${cfg.color}`}
                  style={{ textShadow: `0 0 24px ${cfg.glowColor}` }}
                >
                  {cfg.label}
                </h1>
                <p className="text-white/30 font-mono text-[11px] mt-1 uppercase tracking-widest">
                  {t.game.gameOver.gameIsOver}
                </p>
              </motion.div>

              {/* Personal callout */}
              {myData && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="glass-card border border-white/10 rounded-2xl overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {ROLE_CARD_IMAGES[myData.role] && (
                      <img
                        src={ROLE_CARD_IMAGES[myData.role]}
                        alt=""
                        className="w-12 h-16 object-cover rounded-lg opacity-90 shrink-0"
                        draggable={false}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-0.5">
                        {t.game.gameOver.youWere}
                      </p>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`font-mono text-xl ${ROLE_COLORS[myData.role]}`}>{ROLE_ICONS[myData.role]}</span>
                        <h2 className={`font-display text-xl font-bold tracking-widest uppercase ${ROLE_COLORS[myData.role]}`}>
                          {roleLabel(myData.role)}
                        </h2>
                      </div>
                      <span
                        className={`text-xs font-mono font-bold ${
                          survivalMap.get(myPlayerId!) ? 'text-neon-green' : 'text-red-400/80'
                        }`}
                      >
                        {survivalMap.get(myPlayerId!) ? t.game.gameOver.survived : t.game.gameOver.eliminated}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* MVP badges */}
              {mvpBadges.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 }}
                  className="space-y-1.5"
                >
                  {mvpBadges.map((badge, i) => (
                    <motion.div
                      key={badge.title}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.28 + i * 0.06 }}
                      className="flex items-center gap-3 glass-panel border border-white/8 rounded-xl px-3 py-2"
                    >
                      <span className={`font-mono text-base shrink-0 ${badge.color}`}>{badge.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-display font-bold ${badge.color}`}>{badge.title}</p>
                        <p className="text-[10px] font-mono text-white/30">{badge.description}</p>
                      </div>
                      {badge.playerName && (
                        <span className="text-[10px] font-mono text-white/40 shrink-0">{badge.playerName}</span>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {/* Teams */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card border border-white/8 rounded-2xl p-4 space-y-4"
              >
                <h3 className="text-[10px] font-display uppercase tracking-widest text-white/30">
                  {t.game.gameOver.finalRoles}
                </h3>

                {(['mafia', 'town', 'neutral', 'cult', 'yakuza'] as Team[]).map(team => {
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
                        <div className="flex-1 h-px bg-white/6" />
                        <span className="text-[10px] font-mono text-white/25">{aliveCount}/{group.length}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.map((p, i) => (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.38 + i * 0.04 }}
                            className={`relative flex items-center gap-2 p-2 rounded-xl border overflow-hidden ${tc.border} ${tc.bg} ${
                              p.id === myPlayerId ? 'ring-1 ring-white/20' : ''
                            }`}
                          >
                            {ROLE_CARD_IMAGES[p.role] && (
                              <img
                                src={ROLE_CARD_IMAGES[p.role]}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover opacity-10"
                                draggable={false}
                              />
                            )}
                            <span className={`relative z-10 font-mono text-base shrink-0 ${ROLE_COLORS[p.role]}`}>{ROLE_ICONS[p.role]}</span>
                            <div className="relative z-10 min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-white truncate leading-tight">
                                {p.name}
                                {p.id === myPlayerId && (
                                  <span className="text-[9px] text-white/30 font-mono ml-1">you</span>
                                )}
                              </p>
                              <p className={`text-[9px] font-mono ${ROLE_COLORS[p.role]}`}>{roleLabel(p.role)}</p>
                            </div>
                            <span className={`relative z-10 text-[10px] shrink-0 font-bold ${p.survived ? 'text-neon-green/70' : 'text-white/20'}`}>
                              {p.survived ? '✓' : '×'}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </motion.div>

              {/* Timeline link */}
              {(result.timeline ?? []).length > 0 && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.42 }}
                  onClick={() => setPhase('timeline')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/8 bg-white/3 hover:bg-white/6 hover:border-white/15 transition-colors font-mono text-[11px] text-white/35 hover:text-white/55 uppercase tracking-widest"
                >
                  <span className="font-mono">◈</span>
                  <span>View Game Timeline</span>
                </motion.button>
              )}

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48 }}
                className="space-y-2"
              >
                {amHost ? (
                  <Button variant="primary" fullWidth loading={isLoading} onClick={() => restartGame()}>
                    {t.game.gameOver.backToLobby}
                  </Button>
                ) : (
                  <Button variant="ghost" fullWidth loading={isLoading} onClick={() => leaveRoom()}>
                    {t.game.gameOver.leaveRoom}
                  </Button>
                )}
              </motion.div>

            </div>
          </motion.div>
        )}

        {/* ── Phase 4: Timeline ── */}
        {phase === 'timeline' && (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-start justify-start overflow-y-auto p-4"
          >
            <div className="w-full max-w-lg mx-auto py-6">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => setPhase('highlights')}
                  className="flex items-center gap-1.5 text-white/30 hover:text-white/60 font-mono text-xs transition-colors"
                >
                  ← Back
                </button>
                <div className="flex-1" />
                <h1 className="font-display text-xl font-bold text-white/70 tracking-widest uppercase">
                  Game Timeline
                </h1>
                <div className="flex-1" />
              </div>

              {(() => {
                const timeline = result.timeline ?? [];
                if (timeline.length === 0) {
                  return (
                    <p className="text-center text-white/25 font-mono text-sm py-8">
                      No timeline data available.
                    </p>
                  );
                }

                const byDay = new Map<number, typeof timeline>();
                for (const ev of timeline) {
                  if (!byDay.has(ev.day)) byDay.set(ev.day, []);
                  byDay.get(ev.day)!.push(ev);
                }
                const sortedDays = [...byDay.keys()].sort((a, b) => a - b);

                return (
                  <div className="space-y-6">
                    {sortedDays.map((day, di) => (
                      <motion.div
                        key={day}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: di * 0.06 }}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-display font-bold tracking-widest uppercase text-white/30">
                            Day {day}
                          </span>
                          <div className="flex-1 h-px bg-white/8" />
                        </div>

                        <div className="space-y-2">
                          {byDay.get(day)!.map((ev, ei) => {
                            if (ev.type === 'night_kill') {
                              const roleColor = ev.victimRole ? ROLE_COLORS[ev.victimRole] : 'text-white/50';
                              const roleIcon = ev.victimRole ? ROLE_ICONS[ev.victimRole] : '?';
                              const killerIcon = ev.killerRole ? ROLE_ICONS[ev.killerRole] : '×';
                              return (
                                <motion.div
                                  key={ei}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: di * 0.06 + ei * 0.04 }}
                                  className="glass-panel border border-neon-pink/15 bg-neon-pink/4 rounded-xl px-4 py-3"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-mono text-neon-pink/60 shrink-0">×</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-semibold text-white">{ev.victimName ?? '?'}</span>
                                        {ev.victimRole && (
                                          <span className={`text-[10px] font-mono ${roleColor}`}>
                                            {roleIcon} {roleLabel(ev.victimRole)}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] font-mono text-white/35 mt-0.5">
                                        Killed at night
                                        {ev.killerRole && (
                                          <span> by {killerIcon} {roleLabel(ev.killerRole)}</span>
                                        )}
                                      </p>
                                    </div>
                                    {ev.victimTeam && (
                                      <span className={`text-[9px] font-mono shrink-0 ${TEAM_CONFIG[ev.victimTeam]?.color ?? 'text-white/30'}`}>
                                        {TEAM_CONFIG[ev.victimTeam]?.label}
                                      </span>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            }

                            if (ev.type === 'night_survived') {
                              return (
                                <motion.div
                                  key={ei}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: di * 0.06 + ei * 0.04 }}
                                  className="glass-panel border border-white/8 rounded-xl px-4 py-3"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-mono text-white/30 shrink-0">◑</span>
                                    <p className="text-sm font-mono text-white/45">
                                      {ev.doctorSaved
                                        ? 'Someone was saved by the doctor'
                                        : 'Night passed peacefully'}
                                    </p>
                                  </div>
                                </motion.div>
                              );
                            }

                            if (ev.type === 'vote_eliminate') {
                              const roleColor = ev.victimRole ? ROLE_COLORS[ev.victimRole] : 'text-white/50';
                              const roleIcon = ev.victimRole ? ROLE_ICONS[ev.victimRole] : '?';
                              return (
                                <motion.div
                                  key={ei}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: di * 0.06 + ei * 0.04 }}
                                  className="glass-panel border border-yellow-500/15 bg-yellow-500/4 rounded-xl px-4 py-3"
                                >
                                  <div className="flex items-center gap-3 mb-2">
                                    <span className="text-base font-mono text-yellow-500/60 shrink-0">⚖</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-semibold text-white">{ev.victimName ?? '?'}</span>
                                        {ev.victimRole && (
                                          <span className={`text-[10px] font-mono ${roleColor}`}>
                                            {roleIcon} {roleLabel(ev.victimRole)}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] font-mono text-white/35 mt-0.5">
                                        Eliminated by vote
                                      </p>
                                    </div>
                                    {ev.victimTeam && (
                                      <span className={`text-[9px] font-mono shrink-0 ${TEAM_CONFIG[ev.victimTeam]?.color ?? 'text-white/30'}`}>
                                        {TEAM_CONFIG[ev.victimTeam]?.label}
                                      </span>
                                    )}
                                  </div>
                                  {ev.voteBreakdown && ev.voteBreakdown.length > 0 && (
                                    <div className="pl-7 space-y-0.5">
                                      {ev.voteBreakdown.map((v, vi) => (
                                        <p key={vi} className="text-[9px] font-mono text-white/25">
                                          {v.voterName} → {v.targetName}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                </motion.div>
                              );
                            }

                            if (ev.type === 'vote_no_elim') {
                              return (
                                <motion.div
                                  key={ei}
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: di * 0.06 + ei * 0.04 }}
                                  className="glass-panel border border-white/8 rounded-xl px-4 py-3"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-base font-mono text-white/30 shrink-0">⚖</span>
                                    <p className="text-sm font-mono text-white/45">
                                      Vote ended in a tie — no elimination
                                    </p>
                                  </div>
                                </motion.div>
                              );
                            }

                            return null;
                          })}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                );
              })()}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mt-8"
              >
                <button
                  onClick={() => setPhase('highlights')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20 transition-colors font-mono text-xs text-white/40 hover:text-white/60 uppercase tracking-widest"
                >
                  ← Back to Results
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <XPToast gain={xpGain} onDismiss={dismissXPGain} />
      <LevelMilestoneOverlay gain={xpGain} onDismiss={dismissXPGain} />
    </motion.div>
  );
}
