import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { Phase, PlayerPublic } from '@/types/index';
import { Timer } from '@/components/ui/Timer';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { PlayerList } from '@/components/game/PlayerList';
import { RoleReveal, TeamMate } from '@/components/game/RoleReveal';
import { NightPanel } from '@/components/game/NightPanel';
import { VotingPanel } from '@/components/game/VotingPanel';
import { GameOver } from '@/components/game/GameOver';
import { NightResultOverlay } from '@/components/game/NightResultOverlay';
import { NightSummaryOverlay } from '@/components/game/NightSummaryOverlay';
import { AchievementToast } from '@/components/ui/AchievementToast';
import { PlayerStatsModal } from '@/components/ui/PlayerStatsModal';
import { ReportModal } from '@/components/ui/ReportModal';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { RoomMoreMenu } from '@/components/ui/RoomMoreMenu';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { useVoiceChat, VoiceChannel } from '@/hooks/useVoiceChat';
import { useGameSounds, setSoundMuted, isSoundMuted, SFX } from '@/hooks/useSoundFX';
import { PhaseTransition } from '@/components/game/PhaseTransition';
import { PlayerGrid } from '@/components/game/PlayerGrid';
import { EliminationCinematic } from '@/components/game/EliminationCinematic';
import { GameEventLog } from '@/components/game/GameEventLog';
import { PhaseAtmosphere } from '@/components/game/PhaseAtmosphere';
import { VoteEliminationOverlay } from '@/components/game/VoteEliminationOverlay';
import { CultConversionOverlay } from '@/components/game/CultConversionOverlay';
import { VoteRevealScreen } from '@/components/game/VoteRevealScreen';
import { PlayerProfileModal } from '@/components/ui/PlayerProfileModal';
import { TutorialOverlay } from '@/components/ui/TutorialOverlay';
import { useT } from '@/store/langStore';

type MobileTab = 'action' | 'players' | 'chat';
type RightTab = 'events' | 'chat';

const PHASE_COLORS: Record<Phase, string> = {
  lobby:        'text-white',
  role_reveal:  'text-neon-purple',
  night:        'text-neon-cyan',
  day:          'text-neon-cyan',
  speech:       'text-neon-cyan',
  voting:       'text-neon-red',
  game_over:    'text-white',
};

const PHASE_STRIP: Record<Phase, string> = {
  lobby:        'rgba(255,255,255,0.05)',
  role_reveal:  '#9b00ff',
  night:        '#3b00cc',
  day:          '#00c4cc',
  speech:       '#00e5ff',
  voting:       '#ff2d55',
  game_over:    'rgba(255,255,255,0.1)',
};

const PHASE_GLOW: Partial<Record<Phase, string>> = {
  night:       '0 0 12px rgba(59,0,204,0.8)',
  voting:      '0 0 12px rgba(255,45,85,0.7)',
  role_reveal: '0 0 12px rgba(155,0,255,0.7)',
  speech:      '0 0 10px rgba(0,229,255,0.5)',
  day:         '0 0 10px rgba(0,196,204,0.5)',
};

function getPhaseSubtitle(phase: Phase, day: number, currentSpeakerName?: string | null, amAlive = true, isSpectator = false): string {
  if (isSpectator) return 'Watching…';
  switch (phase) {
    case 'role_reveal': return 'Your role has been assigned.';
    case 'night':       return amAlive ? 'Use your ability or wait for dawn.' : 'You are eliminated. Watch silently.';
    case 'day':         return day === 1 ? 'Common discussion — no vote yet.' : 'Discuss and find the Mafia.';
    case 'speech':      return currentSpeakerName ? `${currentSpeakerName} is speaking…` : 'Players take turns to speak.';
    case 'voting':      return 'Vote to eliminate a suspect.';
    case 'game_over':   return 'The game is over.';
    default:            return '';
  }
}

export function GamePage() {
  const [statsPlayer, setStatsPlayer] = useState<PlayerPublic | null>(null);
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [profileModalId, setProfileModalId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('action');
  const [rightTab, setRightTab] = useState<RightTab>('events');
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadEvents, setUnreadEvents] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [willText, setWillText] = useState('');
  const [willSaved, setWillSaved] = useState(false);
  const [soundMuted, setSoundMutedState] = useState(isSoundMuted());
  const [transitionPhase, setTransitionPhase] = useState<Phase | null>(null);
  const handleTransitionDone = useCallback(() => setTransitionPhase(null), []);
  const [mobileVoiceOpen, setMobileVoiceOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [eliminationVictims, setEliminationVictims] = useState<Array<{ name: string; seat: number }>>([]);
  const handleElimDone = useCallback(() => setEliminationVictims([]), []);
  const prevAliveRef = useRef<Map<string, boolean>>(new Map());
  const {
    room, myPlayer, myRole, amHost, amAlive,
    nightResult, investigationResult, spyReport, gameOverResult,
    voteEliminationResult, cultConversionNotice, nightSummary, newAchievements,
    voteBreakdown,
    skipPhase, daySkipVote, leaveRoom, terminateGame,
    dismissNightResult, dismissInvestigation, dismissSpyReport, dismissGameOver,
    dismissVoteElimination, dismissCultConversion, dismissNightSummary, dismissNewAchievements,
    dismissVoteBreakdown,
    setWill, pauseTimer, submitVote,
    isLoading,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    myRole: s.myRole,
    amHost: s.amHost(),
    amAlive: s.amAlive(),
    nightResult: s.nightResult,
    investigationResult: s.investigationResult,
    spyReport: s.spyReport,
    gameOverResult: s.gameOverResult,
    voteEliminationResult: s.voteEliminationResult,
    cultConversionNotice: s.cultConversionNotice,
    nightSummary: s.nightSummary,
    newAchievements: s.newAchievements,
    voteBreakdown: s.voteBreakdown,
    skipPhase: s.skipPhase,
    daySkipVote: s.daySkipVote,
    leaveRoom: s.leaveRoom,
    terminateGame: s.terminateGame,
    dismissNightResult: s.dismissNightResult,
    dismissInvestigation: s.dismissInvestigation,
    dismissSpyReport: s.dismissSpyReport,
    dismissGameOver: s.dismissGameOver,
    dismissVoteElimination: s.dismissVoteElimination,
    dismissCultConversion: s.dismissCultConversion,
    dismissNightSummary: s.dismissNightSummary,
    dismissNewAchievements: s.dismissNewAchievements,
    dismissVoteBreakdown: s.dismissVoteBreakdown,
    setWill: s.setWill,
    pauseTimer: s.pauseTimer,
    submitVote: s.submitVote,
    isLoading: s.isLoading,
  }));

  const voice = useVoiceChat();
  useGameSounds();
  const t = useT();

  const amSpectator = myPlayer?.isSpectator ?? false;
  const isInVoice = voice.channel !== null;

  // Determine appropriate voice channel for this player/phase
  const isMafiaPlayer = myRole?.key === 'mafia' || myRole?.key === 'don';
  const voiceChannel: VoiceChannel =
    isMafiaPlayer && room?.phase === 'night' ? 'mafia' : 'room';
  const voiceChannelLabel =
    voiceChannel === 'mafia' ? '◉ Mafia Voice' : '◎ Room Voice';

  // Speech phase voice enforcement is handled server-side via voice:force-mute / voice:force-unmute.
  // Auto-join Mafia voice when night starts; rejoin room channel when night ends.
  const prevPhaseForVoice = useRef<string | null>(null);
  useEffect(() => {
    const cur = room?.phase ?? null;
    if (!cur || cur === prevPhaseForVoice.current) return;
    const prev = prevPhaseForVoice.current;
    prevPhaseForVoice.current = cur;
    if (!amAlive || amSpectator) return;
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then(r => {
        if (r.state !== 'granted') return;
        if (cur === 'night' && isMafiaPlayer && !voice.channel) {
          voice.joinVoice('mafia');
        } else if (prev === 'night' && cur !== 'night' && isMafiaPlayer && !voice.channel) {
          // Mafia was kicked from room channel when night started — rejoin now
          voice.joinVoice('room');
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, isMafiaPlayer, amAlive, amSpectator]);

  // Auto-join voice if mic permission was already granted
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then(result => {
        if (result.state === 'granted') voice.joinVoice(voiceChannel);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Track unread chat messages
  const chatLen = room?.chat.length ?? 0;
  const prevChatLen = useRef(chatLen);
  useEffect(() => {
    if (mobileTab !== 'chat' && chatLen > prevChatLen.current) {
      setUnreadChat(u => u + chatLen - prevChatLen.current);
    }
    prevChatLen.current = chatLen;
  }, [chatLen, mobileTab]);

  useEffect(() => {
    if (mobileTab === 'chat') setUnreadChat(0);
  }, [mobileTab]);

  // Elimination cinematic: detect when players go from alive → dead
  useEffect(() => {
    if (!room) return;
    // Reset tracking on new game
    if (room.phase === 'lobby' || room.phase === 'role_reveal') {
      prevAliveRef.current.clear();
      return;
    }
    const prev = prevAliveRef.current;
    const newVictims: Array<{ name: string; seat: number }> = [];
    for (const p of room.players) {
      if (!p.isSpectator) {
        const wasAlive = prev.get(p.id);
        if (wasAlive === true && !p.isAlive) {
          newVictims.push({ name: p.name, seat: p.seat });
        }
        prev.set(p.id, p.isAlive);
      }
    }
    if (newVictims.length > 0) setEliminationVictims(newVictims);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.players]);

  // Track unread events (system messages) when on chat tab
  const eventLen = room?.chat.filter(m => m.isSystem).length ?? 0;
  const prevEventLen = useRef(eventLen);
  useEffect(() => {
    if (rightTab !== 'events' && eventLen > prevEventLen.current) {
      setUnreadEvents(u => u + eventLen - prevEventLen.current);
    }
    prevEventLen.current = eventLen;
  }, [eventLen, rightTab]);
  useEffect(() => {
    if (rightTab === 'events') setUnreadEvents(0);
  }, [rightTab]);

  // Phase transition overlay + auto-switch to best tab for each phase
  const prevPhaseForTransition = useRef<Phase | null>(null);
  useEffect(() => {
    const cur = room?.phase ?? null;
    if (prevPhaseForTransition.current !== null && cur !== null && prevPhaseForTransition.current !== cur) {
      setTransitionPhase(cur);
      setMobileVoiceOpen(false); // collapse voice panel on phase change
      if (cur === 'voting' || cur === 'night') {
        // Action panel must be front-and-center for time-sensitive interactions
        setMobileTab('action');
      } else if (['day', 'speech', 'role_reveal'].includes(cur)) {
        setMobileTab('players');
      }
    }
    prevPhaseForTransition.current = cur;
  }, [room?.phase]);

  if (!room) return null;

  const phase = room.phase;
  const isNight = phase === 'night';
  const alivePlayers = room.players.filter(p => p.isAlive).length;

  // Grid view is shown as primary content for social phases
  const useGridView = ['day', 'speech', 'voting', 'role_reveal'].includes(phase);

  // Vote counts for grid overlay
  const voteCounts: Record<string, number> = {};
  for (const p of room.players) {
    if (p.voteTarget) voteCounts[p.voteTarget] = (voteCounts[p.voteTarget] ?? 0) + 1;
  }

  // My pending vote selection (for PlayerGrid highlight)
  // We read this from VotingPanel indirectly — simpler to just track via room state
  const myVoteTarget = myPlayer?.voteTarget ?? null;

  // Mic is locked when another player has the floor
  const micLocked = phase === 'speech' && room.currentSpeakerId !== myPlayer?.id && room.currentSpeakerId !== null;

  // Per-tile voice state — drives in-frame mic/camera controls & speaking rings
  const speakingSocketIds = new Set(voice.peers.filter(p => p.isSpeaking).map(p => p.socketId));
  const tileVoice = {
    speakingSocketIds,
    localSocketId: myPlayer?.socketId ?? null,
    inVoice: voice.channel !== null,
    isMuted: voice.isMuted,
    cameraOn: voice.cameraOn,
    isLocalSpeaking: voice.isLocalSpeaking,
    localStream: voice.getLocalStream(),
    remoteStreams: voice.remoteStreams,
    micLocked,
    onToggleMute: voice.toggleMute,
    onToggleCamera: voice.toggleCamera,
    onJoin: (withCamera?: boolean) => voice.joinVoice(voiceChannel, withCamera),
  };

  // During voting phase, grid taps select vote target; elsewhere open stats
  const handlePlayerSelect = (p: PlayerPublic) => {
    if (p.id === myPlayer?.id) {
      // Tapping own tile does nothing extra — controls are already inline in the tile
      return;
    }
    if (phase === 'voting' && amAlive && !amSpectator && p.isAlive) {
      if (pendingVoteId === p.id) {
        SFX.voteConfirm();
        submitVote(p.id);
        setPendingVoteId(null);
      } else {
        setPendingVoteId(p.id);
      }
    } else {
      setStatsPlayer(p);
    }
  };


  // Clear pending vote when phase changes
  useEffect(() => {
    setPendingVoteId(null);
  }, [phase]);

  const handleSaveWill = async () => {
    await setWill(willText.slice(0, 200));
    setWillSaved(true);
    setTimeout(() => setWillSaved(false), 2000);
  };

  // Voice panel — shown in sidebar (desktop) and action tab (mobile)
  const VoicePanel = (
    <div className="mt-4">
      <VoiceControls
        channel={voice.channel}
        status={voice.status}
        isMuted={voice.isMuted}
        cameraOn={voice.cameraOn}
        isLocalSpeaking={voice.isLocalSpeaking}
        peerCount={voice.peers.length}
        error={voice.error}
        muteLocked={micLocked}
        defaultChannel={voiceChannel}
        channelLabel={voiceChannelLabel}
        onJoin={(ch, withCam) => voice.joinVoice(ch, withCam)}
        onLeave={voice.leaveVoice}
        onToggleMute={voice.toggleMute}
        onToggleCamera={voice.toggleCamera}
      />
      {isInVoice && voice.peers.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-display uppercase tracking-widest text-white/30 mb-2">
            {t.game.voice.inVoice.replace('{n}', String(voice.peers.length + 1))}
          </p>
          <VoiceParticipants
            localName={myPlayer?.name ?? 'You'}
            isLocalSpeaking={voice.isLocalSpeaking}
            isMuted={voice.isMuted}
            peers={voice.peers}
          />
        </div>
      )}
    </div>
  );

  // Last will panel — shown in action area for alive players during active phases (not spectators)
  const showWill = amAlive && !amSpectator && phase !== 'lobby' && phase !== 'role_reveal' && phase !== 'game_over';
  const LastWillPanel = showWill ? (
    <div className="mt-4 rounded-2xl border border-white/8 bg-void-50/40 p-3 space-y-2">
      <p className="text-xs font-display uppercase tracking-widest text-white/30">{t.game.will.title}</p>
      <textarea
        value={willText}
        onChange={e => { setWillText(e.target.value.slice(0, 200)); setWillSaved(false); }}
        placeholder={t.game.will.placeholder}
        rows={2}
        maxLength={200}
        className="w-full bg-void-50/60 border border-white/8 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-neon-cyan/30 resize-none transition-all"
      />
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/20 font-mono flex-1">{willText.length}/200</span>
        <button
          onClick={handleSaveWill}
          disabled={isLoading}
          className={clsx(
            'px-3 py-1 rounded-lg text-[10px] font-display font-bold tracking-wider uppercase transition-all',
            willSaved
              ? 'text-neon-green border border-neon-green/40 bg-neon-green/10'
              : 'text-white/50 border border-white/15 hover:text-white hover:border-white/30',
            'disabled:opacity-40',
          )}
        >
          {willSaved ? t.game.will.saved : t.game.will.save}
        </button>
      </div>
    </div>
  ) : null;

  // ── Phase center content (shared)
  const PhaseContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35 }}
      >
        {phase === 'role_reveal' && (
          amSpectator ? (
            <div className="py-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-purple/60" />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-purple/60">Spectating</span>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(155,0,255,0.2), transparent)' }} />
              </div>
              <p className="text-white/40 text-sm font-mono">Roles are being revealed to players…</p>
            </div>
          ) : (
            <RoleReveal
              role={myRole}
              teammates={
                myRole?.team === 'mafia'
                  ? (room?.players ?? [])
                      .filter(p => p.team === 'mafia' && p.id !== myPlayer?.id)
                      .map((p): TeamMate => ({
                        name: p.name,
                        roleName: p.role ? (t.game.roles[p.role as keyof typeof t.game.roles] ?? p.role) : 'Mafia',
                        roleKey: p.role ?? 'mafia',
                      }))
                  : []
              }
            />
          )
        )}

        {phase === 'night' && (
          <div className="space-y-4">
            <div className="py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-purple/70" style={{ boxShadow: '0 0 6px rgba(155,0,255,0.8)' }} />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'rgba(155,0,255,0.8)' }}>
                  {t.game.night.title} · {t.game.header.phase} {room.day}
                </span>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(155,0,255,0.25), transparent)' }} />
              </div>
              <p className="text-white/40 text-sm font-mono pl-4">
                {amSpectator ? 'Players are taking their night actions…' : amAlive ? t.game.night.activeMsg : t.game.night.eliminatedMsg}
              </p>
            </div>
            {/* Mafia voice panel in action area during night */}
            {isMafiaPlayer && amAlive && !amSpectator && (
              <Card glow="none" padding="sm">
                <p className="text-[10px] font-mono tracking-[0.2em] uppercase text-neon-red/60 mb-2">◉ Mafia Channel</p>
                <VoiceControls
                  channel={voice.channel}
                  status={voice.status}
                  isMuted={voice.isMuted}
                  cameraOn={voice.cameraOn}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  peerCount={voice.peers.length}
                  error={voice.error}
                  defaultChannel="mafia"
                  channelLabel="🔴 Mafia Voice"
                  onJoin={(ch, wc) => voice.joinVoice(ch, wc)}
                  onLeave={voice.leaveVoice}
                  onToggleMute={voice.toggleMute}
                  onToggleCamera={voice.toggleCamera}
                />
              </Card>
            )}
            {!amSpectator && <NightPanel />}
          </div>
        )}

        {phase === 'day' && (() => {
          const activePlayers = room.players.filter(p => p.isAlive && !p.isSpectator);
          const skipNeeded = Math.floor(activePlayers.length / 2) + 1;
          const alreadyVoted = room.daySkipVoteCount ?? 0;
          return (
            <div className="space-y-4">
              {room.killedLastNight.length > 0 && (
                <Card glow="red" padding="md">
                  <p className="text-xs font-mono text-white/40 uppercase tracking-widest mb-2">{t.game.day.nightReport}</p>
                  {room.killedLastNight.map(k => (
                    <p key={k.id} className="text-white font-semibold">
                      <span className="text-neon-red">💀</span> {k.name} {t.game.day.eliminatedNight}
                    </p>
                  ))}
                </Card>
              )}
              {room.savedLastNight && room.killedLastNight.length === 0 && (
                <Card glow="green" padding="md">
                  <p className="text-neon-green text-sm">💊 {t.game.day.doctorSaved}</p>
                </Card>
              )}
              <div className="py-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan/70" style={{ boxShadow: '0 0 6px rgba(0,196,204,0.8)' }} />
                  <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-cyan/70">
                    {t.game.day.title} {room.day}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,196,204,0.25), transparent)' }} />
                </div>
                <p className="text-white/40 text-sm font-mono pl-4">{t.game.day.discuss}</p>
              </div>
              {amAlive && (
                <div className="text-center">
                  <button
                    onClick={() => daySkipVote()}
                    disabled={isLoading}
                    className="px-6 py-2 border border-white/15 text-white/40 text-xs font-mono rounded-xl hover:border-neon-cyan/40 hover:text-neon-cyan transition-all disabled:opacity-40"
                  >
                    {t.game.day.skipDiscussion
                      .replace('{voted}', String(alreadyVoted))
                      .replace('{needed}', String(skipNeeded))}
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {phase === 'speech' && (() => {
          const speaker = room.players.find(p => p.id === room.currentSpeakerId);
          const speakerIdx = room.players.filter(p => p.isAlive && !p.isSpectator)
            .findIndex(p => p.id === room.currentSpeakerId);
          const totalSpeakers = room.players.filter(p => p.isAlive && !p.isSpectator).length;
          return (
            <div className="space-y-4">
              <div className="py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon-green/70" style={{ boxShadow: '0 0 6px rgba(0,230,100,0.8)' }} />
                  <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-green/70">
                    {t.game.speech.title}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,230,100,0.25), transparent)' }} />
                </div>
                {speaker ? (
                  <div className="pl-4 space-y-0.5">
                    <p className="text-white font-semibold text-base">{speaker.name}</p>
                    <p className="text-white/35 text-xs font-mono">
                      {t.game.speech.speaker} {speakerIdx + 1} {t.game.speech.of} {totalSpeakers}
                    </p>
                  </div>
                ) : (
                  <p className="text-white/40 text-sm font-mono pl-4">{t.game.speech.loading}</p>
                )}
              </div>
            </div>
          );
        })()}

        {phase === 'voting' && (
          <div className="space-y-4">
            <div className="py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-red/70" style={{ boxShadow: '0 0 6px rgba(255,45,85,0.8)' }} />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-red/70">
                  {t.game.voting.title}
                </span>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(255,45,85,0.25), transparent)' }} />
              </div>
              <p className="text-white/40 text-sm font-mono pl-4">
                {t.game.voting.alivePlaying.replace('{n}', String(alivePlayers))}
              </p>
            </div>
            {!amSpectator && <VotingPanel />}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

  // Wrap PhaseContent with Last Will below it
  const PhaseContentWithWill = (
    <>
      {PhaseContent}
      {LastWillPanel}
    </>
  );

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: '#060314' }}>
      {/* Phase ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0 transition-all duration-1000">
        {isNight && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] rounded-full blur-[100px]" style={{ background: 'rgba(100,0,220,0.07)' }} />
        )}
        {(phase === 'day' || phase === 'speech') && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[180px] rounded-full blur-[90px]" style={{ background: 'rgba(0,180,200,0.06)' }} />
        )}
        {phase === 'voting' && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[180px] rounded-full blur-[90px]" style={{ background: 'rgba(220,0,50,0.06)' }} />
        )}
      </div>

      {/* Leaderboard */}
      <LeaderboardModal open={showLeaderboard} onClose={() => setShowLeaderboard(false)} />

      {/* Role Guide */}
      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />


      {/* More Menu */}
      <RoomMoreMenu
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        phase={phase}
        roomCode={room.code}
        spectators={room.players.filter(p => p.isSpectator)}
        amHost={amHost}
        isInVoice={isInVoice}
        activeRoleCounts={room.activeRoleCounts}
        onLeaveRoom={leaveRoom}
        onTerminateGame={amHost ? terminateGame : undefined}
        onResetVoice={isInVoice ? () => {
          const hadCamera = voice.cameraOn;
          voice.leaveVoice();
          setTimeout(() => voice.joinVoice(voiceChannel, hadCamera), 800);
        } : undefined}
        onShowRoleGuide={() => setShowRoleGuide(true)}
      />



      {/* Vote elimination cinematic */}
      <VoteEliminationOverlay result={voteEliminationResult} onDismiss={dismissVoteElimination} />

      {/* Cult conversion notification */}
      <CultConversionOverlay visible={cultConversionNotice} onDismiss={dismissCultConversion} />

      {/* Phase transition overlay */}
      <PhaseTransition phase={transitionPhase} onDone={handleTransitionDone} />

      {/* Game Over */}
      {gameOverResult && <GameOver result={gameOverResult} />}

      {/* Elimination cinematic */}
      <EliminationCinematic victims={eliminationVictims} onDone={handleElimDone} />

      {/* Night result */}
      <NightResultOverlay result={nightResult} onDismiss={dismissNightResult} />
      <NightSummaryOverlay summary={nightSummary} onDismiss={dismissNightSummary} />
      <AchievementToast achievements={newAchievements} onDismiss={dismissNewAchievements} />

      {/* Investigation result */}
      <AnimatePresence>
        {investigationResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={dismissInvestigation}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className={clsx(
                'glass-card border p-8 text-center max-w-sm w-full',
                investigationResult.result === 'suspicious'
                  ? 'border-neon-pink/30 shadow-neon-pink'
                  : 'border-neon-green/30 shadow-neon-green',
              )}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">{t.game.investigation.title}</p>
              <div className="text-5xl mb-4">
                {investigationResult.result === 'suspicious' ? '🔴' : '🟢'}
              </div>
              <h2 className={clsx(
                'font-display text-3xl font-bold tracking-widest uppercase mb-2',
                investigationResult.result === 'suspicious' ? 'text-neon-pink' : 'text-neon-green',
              )}>
                {investigationResult.result === 'suspicious' ? t.game.investigation.suspicious : t.game.investigation.clear}
              </h2>
              <p className="text-white/70 text-sm">
                {investigationResult.result === 'suspicious'
                  ? t.game.investigation.suspiciousDesc.replace('{name}', investigationResult.targetName)
                  : t.game.investigation.clearDesc.replace('{name}', investigationResult.targetName)}
              </p>
              <Button variant="secondary" className="mt-6" onClick={dismissInvestigation} fullWidth>
                {t.game.investigation.gotIt}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spy night report */}
      <AnimatePresence>
        {spyReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={dismissSpyReport}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              className="glass-card border border-neon-cyan/30 shadow-neon-cyan p-8 text-center max-w-sm w-full"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">{t.game.spyReport.title}</p>
              <div className="text-5xl mb-4">🕵️</div>
              <h2 className="font-display text-3xl font-bold tracking-widest uppercase mb-2 text-neon-cyan">
                {t.game.spyReport.intel}
              </h2>
              <p className="text-white/70 text-sm">
                {spyReport.mafiaTargetName
                  ? <><span dangerouslySetInnerHTML={{ __html: t.game.spyReport.targeted.replace('{name}', `<strong class="text-white">${spyReport.mafiaTargetName}</strong>`) }} /></>
                  : t.game.spyReport.noMove}
              </p>
              <Button variant="secondary" className="mt-6" onClick={dismissSpyReport} fullWidth>
                {t.game.spyReport.gotIt}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Phase atmosphere (ambient tinted background per phase) ── */}
      <PhaseAtmosphere phase={phase} />

      {/* ── Main layout ─────────────────────────────────────────────── */}
      <div className="relative z-10 h-screen flex flex-col">

        {/* Top bar */}
        <header className="flex-shrink-0 glass-panel border-b border-white/6">
          {/* Phase color strip */}
          <div
            className="h-[3px] w-full transition-all duration-700"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${PHASE_STRIP[phase]} 20%, ${PHASE_STRIP[phase]} 80%, transparent 100%)`,
              boxShadow: `0 0 12px ${PHASE_STRIP[phase]}60`,
            }}
          />
          <div className="px-3 py-2 md:px-4 md:py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-2 md:gap-4">
            {/* More menu button */}
            <button
              onClick={() => setShowMoreMenu(true)}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all active:scale-90"
              title="More options"
            >
              <span className="text-lg leading-none">⋯</span>
            </button>

            {/* Phase */}
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest hidden sm:block">{t.game.header.phase}</p>
              <h1
                className={clsx('font-display text-lg md:text-xl font-bold tracking-widest uppercase truncate transition-all duration-700', PHASE_COLORS[phase])}
                style={{ textShadow: PHASE_GLOW[phase] }}
              >
                {t.game.phaseLabels[phase]}
                {phase !== 'role_reveal' && phase !== 'game_over' && (
                  <span className="text-white/40 text-sm"> · D{room.day}</span>
                )}
              </h1>
              <p className="text-[10px] font-mono text-white/35 truncate hidden sm:block leading-tight mt-0.5">
                {getPhaseSubtitle(phase, room.day, room.players.find(p => p.id === room.currentSpeakerId)?.name, amAlive, amSpectator)}
              </p>
            </div>

            {/* Timer */}
            {room.maxTimer > 0 && (
              <div className="ml-1 md:ml-4 flex-shrink-0">
                <Timer seconds={room.timer} max={room.maxTimer} size="sm" />
              </div>
            )}

            {/* Alive count pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neon-green/20 bg-neon-green/5">
              <div className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              <span className="text-xs font-mono text-neon-green/80 font-bold">{alivePlayers}</span>
              <span className="text-[10px] font-mono text-white/30">alive</span>
            </div>

            <div className="ml-auto flex items-center gap-1.5 md:gap-3">
              {/* Room code */}
              <div className="hidden sm:block text-right">
                <p className="text-[10px] text-white/30 font-mono">{t.game.header.room}</p>
                <p className="font-mono text-xs md:text-sm text-neon-cyan/70 font-bold tracking-widest">{room.code}</p>
              </div>

              {/* Spectator badge */}
              {amSpectator && (
                <div className="px-2 py-1 rounded-lg border border-neon-purple/40 bg-neon-purple/10 text-[10px] font-mono tracking-widest uppercase text-neon-purple/80">
                  SPECTATOR
                </div>
              )}

              {/* Role badge */}
              {myRole && !amSpectator && (
                <div className="px-2 py-1 rounded-lg border text-[10px] md:text-xs font-display font-bold tracking-wider uppercase"
                  style={{
                    borderColor: `${myRole.glowColor}40`,
                    color: myRole.glowColor,
                    backgroundColor: `${myRole.glowColor}10`,
                    textShadow: `0 0 10px ${myRole.glowColor}`,
                  }}>
                  {myRole.name}
                </div>
              )}

              {/* Spectator count eye icon */}
              {(room.spectatorCount ?? 0) > 0 && (
                <div className="hidden sm:flex items-center gap-1 text-white/30 text-xs font-mono" title="Spectators watching">
                  <span>👁</span>
                  <span>{room.spectatorCount}</span>
                </div>
              )}

              {/* Compact voice status in header */}
              {isInVoice && (
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                  compact
                />
              )}

              {/* Role Guide button */}
              <button
                onClick={() => setShowRoleGuide(true)}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono tracking-widest uppercase text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                title="Role Guide"
              >
                Guide
              </button>

              {/* Leaderboard button */}
              <button
                onClick={() => setShowLeaderboard(true)}
                className="hidden sm:flex px-2.5 py-1 rounded-lg text-[10px] font-mono tracking-widest uppercase text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
                title={t.game.header.leaderboard}
              >
                Ranks
              </button>

              {/* Pause button (host only, during active phases) */}
              {amHost && phase !== 'role_reveal' && phase !== 'game_over' && phase !== 'lobby' && (
                <button
                  onClick={() => pauseTimer()}
                  disabled={isLoading}
                  title={room.isPaused ? t.game.header.resume : t.game.header.pause}
                  className={clsx(
                    'px-2 py-1 rounded-lg text-sm transition-all',
                    room.isPaused
                      ? 'text-yellow-400 border border-yellow-400/40 bg-yellow-400/10 animate-pulse'
                      : 'text-white/30 hover:text-white/70',
                  )}
                >
                  {room.isPaused ? '▶' : '⏸'}
                </button>
              )}

              {/* PAUSED indicator for all players */}
              {room.isPaused && (
                <span className="text-xs font-display font-bold text-yellow-400 tracking-widest uppercase animate-pulse">
                  {t.game.header.paused}
                </span>
              )}

              {amHost && phase !== 'role_reveal' && phase !== 'game_over' && phase !== 'lobby' && (
                <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>
                  <span className="hidden sm:inline">{t.game.header.skip} </span>⏭
                </Button>
              )}

              {/* Sound mute toggle */}
              <button
                onClick={() => { const m = !soundMuted; setSoundMuted(m); setSoundMutedState(m); }}
                title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono tracking-widest uppercase text-white/30 hover:text-white/70 hover:bg-white/5 transition-all"
              >
                {soundMuted ? 'SFX ∅' : 'SFX'}
              </button>

              <Button size="sm" variant="ghost" onClick={() => setShowMoreMenu(true)}>
                {t.game.header.leave}
              </Button>
            </div>
          </div>
          </div>
        </header>

        {/* ── DESKTOP layout (md+) ──────────────────────────────────── */}
        <div className="hidden md:flex flex-1 overflow-hidden max-w-7xl w-full mx-auto">
          {/* Players + Voice sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-y-auto p-4 border-r border-white/5 flex flex-col">
            <div className="flex-shrink-0">
              <h2 className="text-xs font-display uppercase tracking-widest text-white/40 mb-3">
                {t.lobby.players} · {alivePlayers}
              </h2>
              <PlayerList
                players={room.players}
                phase={phase}
                showVotes={phase === 'voting'}
                currentSpeakerId={phase === 'speech' ? room.currentSpeakerId : null}
                onSelectTarget={handlePlayerSelect}
              />
            </div>
            {/* Voice panel in sidebar — only for non-mafia-night or non-mafia players */}
            {phase !== 'night' || !isMafiaPlayer ? (
              <div className="mt-auto pt-4">
                {VoicePanel}
              </div>
            ) : null}
          </aside>

          {/* Center: Phase content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {PhaseContentWithWill}
          </main>

          {/* Events + Chat sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-hidden p-4 border-l border-white/5 hidden lg:flex flex-col">
            {/* Tab switcher */}
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {(['events', 'chat'] as RightTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold tracking-widest uppercase transition-all relative',
                    rightTab === tab
                      ? 'bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan'
                      : 'border border-white/8 text-white/30 hover:text-white/60',
                  )}
                >
                  {tab === 'events' ? 'Events' : 'Chat'}
                  {tab === 'events' && unreadEvents > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-cyan text-void text-[8px] flex items-center justify-center font-bold">
                      {unreadEvents > 9 ? '9+' : unreadEvents}
                    </span>
                  )}
                  {tab === 'chat' && unreadChat > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-neon-red text-white text-[8px] flex items-center justify-center font-bold">
                      {unreadChat > 9 ? '9+' : unreadChat}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              {rightTab === 'chat' ? (
                <ChatPanel compact />
              ) : (
                <GameEventLog messages={room.chat} className="h-full" />
              )}
            </div>
          </aside>
        </div>

        {/* ── MOBILE layout (<md) ───────────────────────────────────── */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col">

          {useGridView ? (
            /* ── Grid-primary layout (day / speech / voting / role_reveal) ── */
            <>
              <div className="flex-1 overflow-hidden flex flex-col">
                <AnimatePresence mode="wait">
                  {mobileTab === 'chat' ? (
                    <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 h-full">
                      <div className="h-[calc(100vh-12rem)]">
                        <ChatPanel />
                      </div>
                    </motion.div>
                  ) : mobileTab === 'action' ? (
                    <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-3 space-y-3">
                      {/* Voting: show panel immediately — no tab switching needed */}
                      {phase === 'voting' && !amSpectator && <VotingPanel />}
                      {phase === 'voting' && amSpectator && (
                        <div className="text-center py-6 text-white/40 text-sm font-mono">👁 Spectating votes…</div>
                      )}

                      {phase === 'day' && !amSpectator && (() => {
                        const active = room.players.filter(p => p.isAlive && !p.isSpectator);
                        const skipNeeded = Math.floor(active.length / 2) + 1;
                        const alreadyVoted = room.daySkipVoteCount ?? 0;
                        return (
                          <div className="text-center pt-2">
                            <button onClick={() => daySkipVote()} disabled={isLoading}
                              className="px-6 py-3 border border-white/15 text-white/50 text-sm font-mono rounded-xl hover:border-neon-cyan/40 hover:text-neon-cyan transition-all disabled:opacity-40">
                              {t.game.day.skipDiscussion.replace('{voted}', String(alreadyVoted)).replace('{needed}', String(skipNeeded))}
                            </button>
                          </div>
                        );
                      })()}

                      {phase === 'speech' && !amSpectator && (
                        <div className="text-center py-2">
                          {amHost && <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>⏭ {t.game.header.skip}</Button>}
                        </div>
                      )}

                      {/* Last Will — compact on mobile */}
                      {LastWillPanel}

                      {/* Voice — collapsible on mobile */}
                      <div className="rounded-xl border border-white/8 overflow-hidden">
                        <button
                          onClick={() => setMobileVoiceOpen(o => !o)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-white/40 hover:text-white/60 transition-colors"
                        >
                          <span>{isInVoice ? voiceChannelLabel : t.game.voice.join}</span>
                          <span className="text-[10px]">{mobileVoiceOpen ? '▲' : '▼'}</span>
                        </button>
                        {mobileVoiceOpen && (
                          <div className="px-3 pb-3">
                            {VoicePanel}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    /* Default: player grid fills entire available height */
                    <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                      <div className="flex-1 min-h-0">
                        <PlayerGrid
                          players={room.players}
                          phase={phase}
                          currentSpeakerId={room.currentSpeakerId}
                          myPlayerId={myPlayer?.id ?? null}
                          voteCounts={voteCounts}
                          selectedVoteId={phase === 'voting' ? (pendingVoteId ?? myVoteTarget) : myVoteTarget}
                          showRoles={amSpectator || phase === 'game_over'}
                          fillHeight
                          voice={tileVoice}
                          onSelect={handlePlayerSelect}
                        />
                      </div>

                      {/* Vote confirm bar pinned at bottom */}
                      {phase === 'voting' && pendingVoteId && (() => {
                        const target = room.players.find(p => p.id === pendingVoteId);
                        return target ? (
                          <div className="flex-shrink-0 mx-2 mb-2 mt-1 rounded-2xl border border-neon-red/50 bg-[rgba(20,0,5,0.97)] backdrop-blur p-3 flex items-center gap-3 shadow-[0_0_20px_rgba(255,45,85,0.3)]">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{t.game.voting.confirmTitle}</p>
                              <p className="text-sm font-semibold text-white truncate">{target.name}</p>
                            </div>
                            <button
                              onClick={() => { SFX.voteConfirm(); submitVote(pendingVoteId); setPendingVoteId(null); }}
                              disabled={isLoading}
                              className="flex-shrink-0 px-4 py-2 rounded-xl bg-neon-red text-white text-xs font-display font-bold tracking-wider uppercase shadow-[0_0_12px_rgba(255,45,85,0.5)] disabled:opacity-40"
                            >
                              {t.game.voting.voteOut}
                            </button>
                            <button
                              onClick={() => setPendingVoteId(null)}
                              className="flex-shrink-0 p-2 text-white/30 hover:text-white/60"
                            >
                              ✕
                            </button>
                          </div>
                        ) : null;
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Slim 3-button nav */}
              <div className="flex-shrink-0 border-t border-white/[0.06] flex" style={{ background: 'rgba(8,4,22,0.96)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                {([
                  { id: 'grid',   label: t.lobby.players },
                  { id: 'action', label: phase === 'voting' ? t.game.voting.title : (t.game.phaseLabels[phase] || 'Action') },
                  { id: 'chat',   label: t.lobby.chat },
                ] as { id: MobileTab | 'grid'; label: string }[]).map(tab => {
                  const isActive = tab.id === 'grid'
                    ? mobileTab !== 'action' && mobileTab !== 'chat'
                    : mobileTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMobileTab(tab.id === 'grid' ? 'players' : tab.id)}
                      className={clsx(
                        'flex-1 py-3 flex flex-col items-center gap-0.5 transition-all relative',
                        isActive ? 'text-neon-cyan' : 'text-white/30 hover:text-white/55',
                      )}
                    >
                      {isActive && (
                        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-px rounded-full bg-neon-cyan/60" />
                      )}
                      <span className="text-[10px] font-mono tracking-widest uppercase">{tab.label}</span>
                      {tab.id === 'chat' && unreadChat > 0 && (
                        <span className="absolute top-1 right-3 w-4 h-4 rounded-full bg-neon-red text-white text-[9px] flex items-center justify-center font-bold">
                          {unreadChat > 9 ? '9+' : unreadChat}
                        </span>
                      )}
                      {tab.id === 'action' && phase === 'voting' && !myVoteTarget && amAlive && !amSpectator && (
                        <span className="absolute top-1.5 left-4 w-1.5 h-1.5 rounded-full bg-neon-red animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* ── Original tab layout (night / game_over) ── */
            <>
              <div className="flex-1 overflow-y-auto p-3 pb-2">
                <AnimatePresence mode="wait">
                  {mobileTab === 'action' && (
                    <motion.div key="action" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                      {PhaseContentWithWill}
                      {/* Voice — collapsible during night to keep action visible */}
                      {(phase !== 'night' || !isMafiaPlayer) && (
                        <div className="rounded-xl border border-white/8 overflow-hidden">
                          <button
                            onClick={() => setMobileVoiceOpen(o => !o)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono text-white/40 hover:text-white/60 transition-colors"
                          >
                            <span>{isInVoice ? voiceChannelLabel : t.game.voice.join}</span>
                            <span className="text-[10px]">{mobileVoiceOpen ? '▲' : '▼'}</span>
                          </button>
                          {mobileVoiceOpen && <div className="px-3 pb-3">{VoicePanel}</div>}
                        </div>
                      )}
                      {/* Mafia voice during night shown inline without collapse */}
                      {phase === 'night' && isMafiaPlayer && VoicePanel}
                    </motion.div>
                  )}
                  {mobileTab === 'players' && (
                    <motion.div key="players" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                      <PlayerList
                        players={room.players}
                        phase={phase}
                        showVotes={false}
                        currentSpeakerId={null}
                        onSelectTarget={handlePlayerSelect}
                      />
                    </motion.div>
                  )}
                  {mobileTab === 'chat' && (
                    <motion.div key="chat" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                      <div className="h-[calc(100%-2rem)]"><ChatPanel /></div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-shrink-0 border-t border-white/[0.06] flex" style={{ background: 'rgba(8,4,22,0.96)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                {([
                  { id: 'action',  label: t.game.phaseLabels[phase] || 'Action' },
                  { id: 'players', label: t.lobby.players },
                  { id: 'chat',    label: t.lobby.chat },
                ] as { id: MobileTab; label: string }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setMobileTab(tab.id)}
                    className={clsx(
                      'flex-1 py-3 flex flex-col items-center gap-0.5 transition-all relative',
                      mobileTab === tab.id ? 'text-neon-cyan' : 'text-white/30 hover:text-white/55',
                    )}
                  >
                    {mobileTab === tab.id && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-px rounded-full bg-neon-cyan/60" />
                    )}
                    <span className="text-[10px] font-mono tracking-widest uppercase">{tab.label}</span>
                    {tab.id === 'chat' && unreadChat > 0 && (
                      <span className="absolute top-1.5 right-3 w-4 h-4 rounded-full bg-neon-red text-white text-[9px] flex items-center justify-center font-bold">
                        {unreadChat > 9 ? '9+' : unreadChat}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile Role Reveal full-screen overlay ─────────────────────── */}
      {/* On desktop, RoleReveal is shown in the center main column.        */}
      {/* On mobile, role_reveal uses the grid layout path which never      */}
      {/* renders PhaseContent, so we show a dedicated overlay here.        */}
      <AnimatePresence>
        {phase === 'role_reveal' && !amSpectator && myRole && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[35] bg-black/93 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto"
          >
            <div className="w-full max-w-xs">
              <RoleReveal
                role={myRole}
                teammates={
                  myRole?.team === 'mafia'
                    ? (room?.players ?? [])
                        .filter(p => p.team === 'mafia' && p.id !== myPlayer?.id)
                        .map((p): TeamMate => ({
                          name: p.name,
                          roleName: p.role ? (t.game.roles[p.role as keyof typeof t.game.roles] ?? p.role) : 'Mafia',
                          roleKey: p.role ?? 'mafia',
                        }))
                    : myRole?.team === 'cult'
                      ? (room?.players ?? [])
                          .filter(p => p.team === 'cult' && p.id !== myPlayer?.id)
                          .map((p): TeamMate => ({
                            name: p.name,
                            roleName: p.role ? (t.game.roles[p.role as keyof typeof t.game.roles] ?? p.role) : 'Cultist',
                            roleKey: p.role ?? 'cultist',
                          }))
                      : []
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player stats modal */}
      {statsPlayer && (
        <PlayerStatsModal
          profileId={statsPlayer.profileId ?? null}
          playerName={statsPlayer.name}
          onClose={() => setStatsPlayer(null)}
          onReport={pid => { setReportProfileId(pid); setStatsPlayer(null); }}
        />
      )}

      {reportProfileId && (
        <ReportModal
          targetProfileId={reportProfileId}
          targetName={room.players.find(p => p.profileId === reportProfileId)?.name ?? ''}
          roomId={room.id}
          onClose={() => setReportProfileId(null)}
          onSuccess={() => setReportProfileId(null)}
        />
      )}

      <VoteRevealScreen breakdown={voteBreakdown} onDismiss={dismissVoteBreakdown} />
      <PlayerProfileModal playerId={profileModalId} onClose={() => setProfileModalId(null)} />
      <TutorialOverlay />
    </div>
  );
}
