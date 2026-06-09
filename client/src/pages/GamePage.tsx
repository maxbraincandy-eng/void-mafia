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
import { ReportModal } from '@/components/ui/ReportModal';
import { LeaderboardModal } from '@/components/ui/LeaderboardModal';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { RoomMoreMenu } from '@/components/ui/RoomMoreMenu';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { useVoiceChat, VoiceChannel } from '@/hooks/useVoiceChat';
import { useGameSounds, SFX } from '@/hooks/useSoundFX';
import { useSettingsStore } from '@/store/settingsStore';
import { PhaseTransition } from '@/components/game/PhaseTransition';
import { PlayerGrid } from '@/components/game/PlayerGrid';
import { EliminationCinematic } from '@/components/game/EliminationCinematic';
import { GameEventLog } from '@/components/game/GameEventLog';
import { PhaseAtmosphere } from '@/components/game/PhaseAtmosphere';
import { VoteEliminationOverlay } from '@/components/game/VoteEliminationOverlay';
import { CultConversionOverlay } from '@/components/game/CultConversionOverlay';
import { VoteRevealScreen } from '@/components/game/VoteRevealScreen';
import { TutorialOverlay } from '@/components/ui/TutorialOverlay';
import { InGamePlayersPanel } from '@/components/game/InGamePlayersPanel';
import { SpectatorTheater } from '@/components/game/SpectatorTheater';
import { useT } from '@/store/langStore';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { ModDashboardPage } from '@/pages/ModDashboardPage';

type RightTab = 'events' | 'chat' | 'spectator';

const PHASE_COLORS: Record<Phase, string> = {
  lobby:        'text-white',
  role_reveal:  'text-neon-purple',
  night:        'text-neon-cyan',
  morning:      'text-neon-cyan',
  day:          'text-neon-cyan',
  speech:       'text-neon-cyan',
  voting:       'text-neon-red',
  final_words:  'text-neon-red',
  game_over:    'text-white',
};

const PHASE_STRIP: Record<Phase, string> = {
  lobby:        'rgba(255,255,255,0.05)',
  role_reveal:  '#9b00ff',
  night:        '#3b00cc',
  morning:      '#00c4cc',
  day:          '#00c4cc',
  speech:       '#00e5ff',
  voting:       '#ff2d55',
  final_words:  '#cc1133',
  game_over:    'rgba(255,255,255,0.1)',
};

const PHASE_GLOW: Partial<Record<Phase, string>> = {
  night:        '0 0 12px rgba(59,0,204,0.8)',
  morning:      '0 0 10px rgba(0,196,204,0.5)',
  voting:       '0 0 12px rgba(255,45,85,0.7)',
  final_words:  '0 0 12px rgba(255,45,85,0.7)',
  role_reveal:  '0 0 12px rgba(155,0,255,0.7)',
  speech:       '0 0 10px rgba(0,229,255,0.5)',
  day:          '0 0 10px rgba(0,196,204,0.5)',
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
  const [reportProfileId, setReportProfileId] = useState<string | null>(null);
  const [showPlayersPanel, setShowPlayersPanel] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);
  const myClanId = useAuthStore(s => s.myClanId);
  const myClanRole = useAuthStore(s => s.myClanRole);
  const { openProfile } = useSocialStore();
  const [rightTab, setRightTab] = useState<RightTab>('events');
  const [unreadChat, setUnreadChat] = useState(0);
  const [unreadEvents, setUnreadEvents] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const sfxEnabled = useSettingsStore(s => s.sfxEnabled);
  const updateSettings = useSettingsStore(s => s.update);
  // Music continues playing from menu — no stop needed.
  const [transitionPhase, setTransitionPhase] = useState<Phase | null>(null);
  const handleTransitionDone = useCallback(() => setTransitionPhase(null), []);
  const [mobileVoiceOpen, setMobileVoiceOpen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pendingVoteId, setPendingVoteId] = useState<string | null>(null);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [reconnectBanner, setReconnectBanner] = useState(false);
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
    pauseTimer, submitVote, nominate,
    isLoading, addToast,
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
    pauseTimer: s.pauseTimer,
    submitVote: s.submitVote,
    nominate: s.nominate,
    isLoading: s.isLoading,
    addToast: s.addToast,
  }));

  const voice = useVoiceChat();
  useGameSounds();
  const t = useT();

  const amSpectator = myPlayer?.isSpectator ?? false;

  // Auto-switch to spectator tab on join
  useEffect(() => {
    if (amSpectator) setRightTab('spectator');
  }, [amSpectator]);

  const activePlayers = room?.players.filter(p => !p.isSpectator) ?? [];
  const gridPlayers   = room?.players.filter(p => p.isAlive && !p.isSpectator) ?? [];
  const spectatorSocketIds = new Set(room?.players.filter(p => p.isSpectator).map(p => p.socketId) ?? []);
  const isInVoice = voice.channel !== null;

  // Determine appropriate voice channel for this player/phase
  const isMafiaPlayer  = myRole?.key === 'mafia' || myRole?.key === 'don';
  const isYakuzaPlayer = myRole?.key === 'yakuza' || myRole?.key === 'shogun';
  const voiceChannel: VoiceChannel =
    isMafiaPlayer  && room?.phase === 'night' ? 'mafia'
    : isYakuzaPlayer && room?.phase === 'night' ? 'yakuza'
    : 'room';
  const voiceChannelLabel =
    voiceChannel === 'mafia'  ? '◉ Mafia Voice'
    : voiceChannel === 'yakuza' ? '⚔️ Yakuza Voice'
    : '◎ Room Voice';

  // Speech phase voice enforcement is handled server-side via voice:force-mute / voice:force-unmute.
  // Auto-join Mafia voice when night starts; rejoin room channel when night ends.
  const prevPhaseForVoice = useRef<string | null>(null);
  useEffect(() => {
    const cur = room?.phase ?? null;
    if (!cur || cur === prevPhaseForVoice.current) return;
    const prev = prevPhaseForVoice.current;
    prevPhaseForVoice.current = cur;
    if (!amAlive || amSpectator) return;

    if (cur === 'night' && isMafiaPlayer) {
      if (voice.channel === 'room') {
        // Leave room and join mafia channel.
        voice.leaveVoice();
        setTimeout(() => voice.joinVoice('mafia', false, true).catch(() => {}), 400);
      } else if (!voice.channel) {
        voice.joinVoice('mafia', false, true).catch(() => {});
      }
    } else if (cur === 'night' && isYakuzaPlayer) {
      if (voice.channel === 'room') {
        voice.leaveVoice();
        setTimeout(() => voice.joinVoice('yakuza', false, true).catch(() => {}), 400);
      } else if (!voice.channel) {
        voice.joinVoice('yakuza', false, true).catch(() => {});
      }
    } else if (prev === 'night' && cur !== 'night') {
      if ((isMafiaPlayer && voice.channel === 'mafia') || (isYakuzaPlayer && voice.channel === 'yakuza')) {
        // Leave faction channel and switch back to room.
        voice.leaveVoice();
        setTimeout(() => voice.joinVoice('room', false, true).catch(() => {}), 400);
      } else if (!voice.channel) {
        // Session was already destroyed (force-leave arrived first, or network drop).
        voice.joinVoice('room', false, true).catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, isMafiaPlayer, isYakuzaPlayer, amAlive, amSpectator]);

  // Auto-join voice on room entry
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    autoJoined.current = true;
    if (amSpectator) {
      // Spectators auto-join as listen-only — no mic permission needed
      voice.joinVoiceListenOnly('room');
    } else {
      // Attempt silent auto-join; fails gracefully on iOS Safari where
      // navigator.permissions.query is unsupported or mic isn't pre-granted.
      voice.joinVoice(voiceChannel, false, true).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Track unread chat messages
  const chatLen = room?.chat.length ?? 0;
  const prevChatLen = useRef(chatLen);
  useEffect(() => {
    if (!showChat && chatLen > prevChatLen.current) {
      setUnreadChat(u => u + chatLen - prevChatLen.current);
    }
    prevChatLen.current = chatLen;
  }, [chatLen, showChat]);

  useEffect(() => {
    if (showChat) setUnreadChat(0);
  }, [showChat]);

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

  // Phase transition overlay
  const prevPhaseForTransition = useRef<Phase | null>(null);
  useEffect(() => {
    const cur = room?.phase ?? null;
    if (prevPhaseForTransition.current !== null && cur !== null && prevPhaseForTransition.current !== cur) {
      setTransitionPhase(cur);
      setMobileVoiceOpen(false); // collapse voice panel on phase change
    }
    prevPhaseForTransition.current = cur;
  }, [room?.phase]);

  if (!room) return null;

  const phase = room.phase;
  const isNight = phase === 'night';
  const alivePlayers = room.players.filter(p => p.isAlive).length;


  // Ally IDs: players the viewer knows are on their faction team (mafia/yakuza see each other)
  const viewerTeam = myPlayer?.team;
  const allyIds = (viewerTeam === 'mafia' || viewerTeam === 'yakuza' || viewerTeam === 'cult')
    ? new Set(room.players.filter(p => p.team === viewerTeam && p.id !== myPlayer!.id).map(p => p.id))
    : new Set<string>();

  // Vote counts for grid overlay
  const voteCounts: Record<string, number> = {};
  for (const p of room.players) {
    if (p.voteTarget) voteCounts[p.voteTarget] = (voteCounts[p.voteTarget] ?? 0) + 1;
  }
  const aliveVoters = room.players.filter(p => p.isAlive && !p.isSpectator);
  const votedCount = aliveVoters.filter(p => p.voteTarget).length;

  // My pending vote selection (for PlayerGrid highlight)
  // We read this from VotingPanel indirectly — simpler to just track via room state
  const myVoteTarget = myPlayer?.voteTarget ?? null;

  // Mic is locked when server force-muted this player (speech phase non-speaker, or night for non-mafia)
  const micLocked = voice.forceMuted;

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

  // During voting phase, grid taps select vote target; elsewhere open social profile
  const handlePlayerSelect = (p: PlayerPublic) => {
    if (p.id === myPlayer?.id) return;
    if (phase === 'voting' && amAlive && !amSpectator && p.isAlive) {
      if (pendingVoteId === p.id) {
        SFX.voteConfirm();
        submitVote(p.id);
        setPendingVoteId(null);
      } else {
        setPendingVoteId(p.id);
      }
    } else if (p.profileId) {
      openProfile(p.profileId);
    }
  };


  // Clear pending vote when phase changes
  useEffect(() => {
    setPendingVoteId(null);
  }, [phase]);

  // Haptic feedback on phase changes
  const prevPhaseForHaptic = useRef<string | null>(null);
  useEffect(() => {
    const cur = room?.phase ?? null;
    if (!cur || cur === prevPhaseForHaptic.current) return;
    prevPhaseForHaptic.current = cur;
    if (cur === 'voting') navigator.vibrate?.([200, 100, 200]);
    else if (cur === 'night') navigator.vibrate?.([300]);
  }, [room?.phase]);

  // Haptic when it becomes MY turn to speak
  const prevSpeakerRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = room?.currentSpeakerId ?? null;
    if (cur !== prevSpeakerRef.current) {
      prevSpeakerRef.current = cur;
      if (cur === myPlayer?.id && amAlive && !amSpectator) {
        navigator.vibrate?.([150, 50, 150]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.currentSpeakerId]);

  // Nomination notification
  const prevNominationsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!room || !myPlayer) return;
    const nominations = room.nominations ?? {};
    const prevNominations = prevNominationsRef.current;
    const iNominatedNow = Object.values(nominations).includes(myPlayer.id);
    const iWasNominated = Object.values(prevNominations).includes(myPlayer.id);
    if (iNominatedNow && !iWasNominated) {
      SFX.timerWarning();
      navigator.vibrate?.([100, 50, 100]);
      addToast('You were nominated!', 'error');
    }
    prevNominationsRef.current = nominations;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.nominations, myPlayer?.id]);

  // Reconnect banner: show briefly when mounting into an active game (mid-session rejoin)
  const reconnectChecked = useRef(false);
  useEffect(() => {
    if (!room || reconnectChecked.current) return;
    reconnectChecked.current = true;
    const activePhase = room.phase !== 'lobby' && room.phase !== 'role_reveal' && room.phase !== 'game_over';
    if (activePhase) {
      setReconnectBanner(true);
      setTimeout(() => setReconnectBanner(false), 3500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // Voice panel — shown in sidebar (desktop) and action tab (mobile)
  const VoicePanel = (
    <div className="mt-4">
      {/* Night phase notice for spectators and non-mafia */}
      {isNight && amSpectator && (
        <div className="mb-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/40">🌙 Night phase — Mafia private channel is hidden.</span>
        </div>
      )}
      {voice.forceMuted && voice.channel && !voice.listenOnly && (
        <div className="mb-2 px-3 py-1.5 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500/70 flex-shrink-0" />
          <p className="text-[10px] font-mono text-yellow-500/70 leading-tight">
            {voice.forceMutedReason ?? 'Muted by system'}
          </p>
        </div>
      )}
      <VoiceControls
        channel={voice.channel}
        status={voice.status}
        isMuted={voice.isMuted}
        cameraOn={voice.cameraOn}
        isLocalSpeaking={voice.isLocalSpeaking}
        peerCount={voice.peers.length}
        error={voice.error}
        muteLocked={micLocked}
        listenOnly={voice.listenOnly || (!amAlive && !(phase === 'final_words' && room.deathSpeakerId === myPlayer?.id)) || amSpectator}
        defaultChannel={voiceChannel}
        channelLabel={voiceChannelLabel}
        onJoin={amSpectator
          ? () => voice.joinVoiceListenOnly('room')
          : (ch, withCam) => voice.joinVoice(ch, withCam)}
        onLeave={voice.leaveVoice}
        onToggleMute={voice.toggleMute}
        onToggleCamera={voice.toggleCamera}
        onReset={voice.resetConnection}
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
            spectatorSocketIds={spectatorSocketIds}
          />
        </div>
      )}
    </div>
  );

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
            <div className="py-8 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-purple/60" />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-purple/60">Spectating</span>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(155,0,255,0.2), transparent)' }} />
              </div>
              <p className="text-white/40 text-sm font-mono">Roles are being revealed to players…</p>
              {Object.keys(room.activeRoleCounts ?? {}).length > 0 && (
                <div className="rounded-xl border border-neon-purple/15 bg-neon-purple/[0.04] p-3">
                  <p className="text-[10px] font-mono tracking-widest uppercase text-neon-purple/50 mb-2">Role Distribution</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(room.activeRoleCounts).map(([role, count]) => (
                      <span key={role} className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/10 text-white/40">
                        {t.game.roles[role as keyof typeof t.game.roles] ?? role} ×{count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
            {/* Mafia Radio — private night channel */}
            {isMafiaPlayer && amAlive && !amSpectator && (
              <div className="rounded-2xl border border-neon-red/20 overflow-hidden" style={{ background: 'rgba(30,0,8,0.7)' }}>
                <div className="flex items-center gap-2.5 px-3 py-2 border-b border-neon-red/10">
                  <span className="text-xs" style={{ filter: 'drop-shadow(0 0 4px rgba(255,45,85,0.8))' }}>📻</span>
                  <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-neon-red/70">Mafia Radio</span>
                  <span className="text-[9px] font-mono text-white/25 ml-auto">Only Mafia can hear this</span>
                </div>
                <div className="p-3">
                  <VoiceControls
                    channel={voice.channel}
                    status={voice.status}
                    isMuted={voice.isMuted}
                    cameraOn={voice.cameraOn}
                    isLocalSpeaking={voice.isLocalSpeaking}
                    peerCount={voice.peers.length}
                    error={voice.error}
                    defaultChannel="mafia"
                    channelLabel="◉ Mafia Radio"
                    onJoin={(ch, wc) => voice.joinVoice(ch, wc)}
                    onLeave={voice.leaveVoice}
                    onToggleMute={voice.toggleMute}
                    onToggleCamera={voice.toggleCamera}
                    onReset={voice.resetConnection}
                  />
                </div>
              </div>
            )}
            {/* Night message for non-Mafia alive players */}
            {!isMafiaPlayer && amAlive && !amSpectator && (
              <div className="rounded-xl border border-white/[0.06] px-4 py-3" style={{ background: 'rgba(10,6,28,0.6)' }}>
                <p className="text-[10px] font-mono tracking-widest uppercase text-white/25 mb-1">Voice</p>
                <p className="text-white/35 text-xs font-mono">Public voice is disabled at night.</p>
              </div>
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

        {phase === 'morning' && (
          <div className="space-y-4">
            <div className="py-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan/70" style={{ boxShadow: '0 0 6px rgba(0,196,204,0.8)' }} />
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-neon-cyan/70">
                  {t.game.phaseLabels.morning}
                </span>
                <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(0,196,204,0.25), transparent)' }} />
              </div>
              <div className="pl-4 space-y-3">
                {room.killedLastNight.length > 0 ? (
                  <div className="space-y-1.5">
                    {room.killedLastNight.map(k => (
                      <p key={k.id} className="text-white font-semibold text-sm">
                        <span className="text-neon-red">💀</span> {k.name} {t.game.day.eliminatedNight}
                      </p>
                    ))}
                  </div>
                ) : room.savedLastNight ? (
                  <p className="text-neon-green text-sm">💊 {t.game.day.doctorSaved}</p>
                ) : (
                  <p className="text-white/40 text-sm font-mono">The night passed quietly.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === 'speech' && (() => {
          const speaker = room.players.find(p => p.id === room.currentSpeakerId);
          const speakerIdx = room.players.filter(p => p.isAlive && !p.isSpectator)
            .findIndex(p => p.id === room.currentSpeakerId);
          const totalSpeakers = room.players.filter(p => p.isAlive && !p.isSpectator).length;
          const isMyTurn = room.currentSpeakerId === myPlayer?.id && myPlayer?.isAlive && !amSpectator;
          const myNomination = isMyTurn ? room.nominations?.[myPlayer.id] : null;
          const nominatedPlayer = myNomination ? room.players.find(p => p.id === myNomination) : null;
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
                  <div className="pl-4 space-y-1">
                    <p className="text-white font-semibold text-base">{speaker.name}</p>
                    <p className="text-white/35 text-xs font-mono">
                      {t.game.speech.speaker} {speakerIdx + 1} {t.game.speech.of} {totalSpeakers}
                    </p>
                    {room.currentSpeakerId === myPlayer?.id ? (
                      <p className="text-neon-green text-[10px] font-mono tracking-widest uppercase">It's your turn — mic is live</p>
                    ) : (
                      <p className="text-yellow-500/60 text-[10px] font-mono tracking-widest uppercase">Listening · mic muted</p>
                    )}
                  </div>
                ) : (
                  <p className="text-white/40 text-sm font-mono pl-4">{t.game.speech.loading}</p>
                )}
              </div>

              {/* Nomination panel — only for current speaker */}
              {isMyTurn && (
                <div className="p-3 rounded-xl border border-neon-red/20 bg-neon-red/5 space-y-2">
                  <p className="text-[10px] font-mono text-neon-red/50 uppercase tracking-widest">
                    ⚖️ {t.game.speech.nominateLabel}
                  </p>
                  {nominatedPlayer ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neon-red">
                        {nominatedPlayer.name}
                      </span>
                      <button
                        onClick={() => nominate(null)}
                        disabled={isLoading}
                        className="text-[10px] text-white/40 hover:text-neon-red font-mono transition-colors"
                      >
                        ✕ {t.game.speech.withdrawNomination}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {room.players
                        .filter(p => p.isAlive && !p.isSpectator && p.id !== myPlayer.id)
                        .map(p => (
                          <button
                            key={p.id}
                            onClick={() => nominate(p.id)}
                            disabled={isLoading}
                            className="px-2.5 py-1 rounded-lg border border-neon-red/20 text-neon-red/60 text-xs font-mono hover:border-neon-red/50 hover:text-neon-red/90 transition-all disabled:opacity-40"
                          >
                            {p.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* Show current nominations visible to everyone */}
              {Object.keys(room.nominations ?? {}).length > 0 && (
                <div className="p-3 rounded-xl border border-white/8 bg-white/3 space-y-1.5">
                  <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                    Nominations
                  </p>
                  {Object.entries(room.nominations ?? {}).map(([nominatorId, nomineeId]) => {
                    const nominator = room.players.find(p => p.id === nominatorId);
                    const nominee = room.players.find(p => p.id === nomineeId);
                    if (!nominator || !nominee) return null;
                    return (
                      <div key={nominatorId} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-white/50">{nominator.name}</span>
                        <span className="text-white/20">→</span>
                        <span className="text-neon-red/80 font-semibold">{nominee.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
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
              <div className="pl-4 flex items-center gap-3">
                <p className="text-white/40 text-sm font-mono">
                  {t.game.voting.alivePlaying.replace('{n}', String(alivePlayers))}
                </p>
                <span className="text-white/15 text-xs">·</span>
                <p className="text-white/30 text-xs font-mono">
                  {votedCount}/{aliveVoters.length} voted
                </p>
                {votedCount > 0 && (
                  <div className="flex-1 h-0.5 bg-white/[0.06] rounded-full overflow-hidden max-w-[60px]">
                    <div
                      className="h-full bg-neon-red/50 rounded-full transition-all duration-500"
                      style={{ width: `${(votedCount / Math.max(aliveVoters.length, 1)) * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            {!amSpectator && <VotingPanel />}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
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
        players={room.players}
        amHost={amHost}
        isMod={isMod}
        isSpectator={amSpectator}
        activeRoleCounts={room.activeRoleCounts}
        clanId={room.clanId}
        clanRoom={room.clanRoom}
        viewerClanId={myClanId}
        viewerClanRole={myClanRole}
        voice={{
          channel: voice.channel,
          status: voice.status,
          isMuted: voice.isMuted,
          cameraOn: voice.cameraOn,
          listenOnly: voice.listenOnly || (!amAlive && !(phase === 'final_words' && room.deathSpeakerId === myPlayer?.id)) || amSpectator,
          peerCount: voice.peers.length,
          forceMuted: voice.forceMuted,
          error: voice.error,
          defaultChannel: voiceChannel,
          onJoin: (ch, withCamera) => {
            if (amSpectator) { voice.joinVoiceListenOnly(ch ?? 'room'); return; }
            voice.joinVoice(ch ?? voiceChannel, withCamera);
          },
          onLeave: () => voice.leaveVoice(),
          onToggleMute: voice.toggleMute,
          onToggleCamera: voice.toggleCamera,
          onReset: () => {
            const hadCamera = voice.cameraOn;
            voice.leaveVoice();
            setTimeout(() => voice.joinVoice(voiceChannel, hadCamera), 800);
          },
        }}
        onLeaveRoom={() => { voice.leaveVoice(); leaveRoom(); }}
        onTerminateGame={amHost ? terminateGame : undefined}
        onShowRoleGuide={() => setShowRoleGuide(true)}
      />



      {/* Reconnect banner */}
      <AnimatePresence>
        {reconnectBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-xl border border-neon-cyan/30 bg-[rgba(0,20,30,0.95)] backdrop-blur-sm shadow-lg"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse flex-shrink-0" />
            <span className="text-xs font-mono text-neon-cyan/80">Reconnected · syncing game state</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role card modal */}
      <AnimatePresence>
        {showRoleCard && myRole && (() => {
          const roleInfo = (t.roleGuide.roles as Record<string, { desc: string; ability: string; win: string }>)[myRole.key];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6"
              onClick={() => setShowRoleCard(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                className="w-full max-w-xs rounded-3xl border p-6 space-y-5"
                style={{
                  background: `radial-gradient(ellipse 120% 80% at 50% -10%, ${myRole.glowColor}18 0%, rgba(6,3,20,0.98) 55%)`,
                  borderColor: `${myRole.glowColor}35`,
                  boxShadow: `0 0 40px ${myRole.glowColor}25`,
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Role name */}
                <div className="text-center">
                  <p className="text-[10px] font-mono tracking-[0.3em] uppercase mb-2" style={{ color: `${myRole.glowColor}80` }}>Your Role</p>
                  <h2
                    className="font-display text-3xl font-bold tracking-widest uppercase"
                    style={{ color: myRole.glowColor, textShadow: `0 0 20px ${myRole.glowColor}` }}
                  >
                    {myRole.name}
                  </h2>
                </div>

                {/* Divider */}
                <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${myRole.glowColor}40, transparent)` }} />

                {/* Description */}
                {roleInfo && (
                  <div className="space-y-4">
                    <p className="text-white/65 text-sm leading-relaxed text-center">{roleInfo.desc}</p>

                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 space-y-3">
                      <div>
                        <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: `${myRole.glowColor}70` }}>
                          {t.roleGuide.nightAbility}
                        </p>
                        <p className="text-white/55 text-xs">{roleInfo.ability}</p>
                      </div>
                      <div className="h-px bg-white/[0.05]" />
                      <div>
                        <p className="text-[10px] font-mono tracking-widest uppercase mb-1" style={{ color: `${myRole.glowColor}70` }}>
                          {t.roleGuide.winCondition}
                        </p>
                        <p className="text-white/55 text-xs">{roleInfo.win}</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setShowRoleCard(false)}
                  className="w-full py-2 rounded-xl border border-white/10 text-white/35 text-xs font-mono tracking-widest uppercase hover:text-white/60 hover:border-white/20 transition-all"
                >
                  {t.common.close}
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

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
            {/* More menu button — far-left first control */}
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
                {t.game.phaseLabels[phase as keyof typeof t.game.phaseLabels]}
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

              {/* Role badge — tap to open role card */}
              {myRole && !amSpectator && phase !== 'lobby' && phase !== 'game_over' && (
                <button
                  onClick={() => setShowRoleCard(true)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all active:scale-90 md:hidden"
                  style={{
                    background: `${myRole.glowColor}18`,
                    border: `1px solid ${myRole.glowColor}40`,
                  }}
                >
                  <span className="text-[11px] font-display font-bold tracking-widest uppercase" style={{ color: myRole.glowColor }}>
                    {myRole.name}
                  </span>
                </button>
              )}

              {/* Spectator count eye icon */}
              {(room.spectatorCount ?? 0) > 0 && (
                <div
                  className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg border border-neon-purple/20 bg-neon-purple/5 text-neon-purple/70 text-xs font-mono cursor-default"
                  title={`${room.spectatorCount} spectator${room.spectatorCount !== 1 ? 's' : ''} watching`}
                >
                  <span>👁</span>
                  <span className="font-bold">{room.spectatorCount}</span>
                </div>
              )}

              {/* Players list button — between role badge and Guide */}
              <button
                onClick={() => setShowPlayersPanel(true)}
                className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all active:scale-90"
                title="Players"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="3" y1="5" x2="15" y2="5" />
                  <line x1="3" y1="9" x2="15" y2="9" />
                  <line x1="3" y1="13" x2="15" y2="13" />
                </svg>
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

              {isMod && (
                <button
                  onClick={() => setShowModPanel(true)}
                  className="px-2 py-1 rounded-lg text-[11px] font-mono transition-all"
                  style={{ border: '1px solid rgba(0,229,255,0.3)', color: 'rgba(0,229,255,0.8)', background: 'rgba(0,229,255,0.06)' }}
                  title="Mod Panel"
                >
                  ⚡
                </button>
              )}
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
                players={activePlayers}
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
            {PhaseContent}
          </main>

          {/* Events + Chat sidebar */}
          <aside className="w-64 lg:w-72 flex-shrink-0 overflow-hidden p-4 border-l border-white/5 hidden lg:flex flex-col">
            {/* Tab switcher */}
            <div className="flex gap-1 mb-3 flex-shrink-0">
              {(amSpectator
                ? (['spectator', 'events'] as RightTab[])
                : (['events', 'chat'] as RightTab[])
              ).map(tab => (
                <button
                  key={tab}
                  onClick={() => setRightTab(tab)}
                  className={clsx(
                    'flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold tracking-widest uppercase transition-all relative',
                    rightTab === tab
                      ? tab === 'spectator'
                        ? 'bg-neon-purple/10 border border-neon-purple/30 text-neon-purple'
                        : 'bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan'
                      : 'border border-white/8 text-white/30 hover:text-white/60',
                  )}
                >
                  {tab === 'spectator' ? '👁 Theater'
                    : tab === 'events' ? 'Events'
                    : 'Chat'}
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
            <div className="flex-1 min-h-0 overflow-y-auto">
              {rightTab === 'spectator' ? (
                <SpectatorTheater room={room} myPlayer={myPlayer} />
              ) : rightTab === 'chat' ? (
                <ChatPanel compact />
              ) : (
                <GameEventLog messages={room.chat} className="h-full" />
              )}
            </div>
          </aside>
        </div>

        {/* ── MOBILE layout (<md) ───────────────────────────────────── */}
        <div className="md:hidden flex-1 overflow-hidden flex flex-col relative">

          {/* Main content area */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {(phase === 'game_over') ? (
              /* Game over fills whole area */
              <div className="flex-1 overflow-y-auto p-3">{PhaseContent}</div>
            ) : (phase === 'night' || phase === 'lobby') ? (
              /* Night/lobby: action panel + voice */
              <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20">
                {PhaseContent}
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
                {phase === 'night' && isMafiaPlayer && VoicePanel}
              </div>
            ) : (phase === 'voting') ? (
              /* Voting: full-screen vote panel — prominent like night phase */
              <div className="flex-1 overflow-y-auto p-3 pb-20">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4 px-1">
                  <motion.div
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    className="w-2 h-2 rounded-full bg-neon-red"
                    style={{ boxShadow: '0 0 8px rgba(255,45,85,0.9)' }}
                  />
                  <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-neon-red/80">
                    {t.game.voting.title}
                  </span>
                  <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(255,45,85,0.35), transparent)' }} />
                  <Timer seconds={room.timer ?? 0} max={room.maxTimer ?? 60} />
                </div>
                {/* VotingPanel — contains its own player list for selection + tally + confirm */}
                {!amSpectator && <VotingPanel />}
              </div>
            ) : (phase === 'final_words') ? (
              /* Final words: 30-second countdown — only the dying player can speak */
              <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6 pb-20">
                {(() => {
                  const dyingPlayer = room.players.find(p => p.id === room.deathSpeakerId);
                  const reason = room.finalWordsReason;
                  const badge =
                    reason === 'night_kill'       ? 'KILLED' :
                    reason === 'vote_elimination' ? 'ELIMINATED' : 'ELIMINATED';
                  return (
                    <>
                      <div className="text-center space-y-2">
                        <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-neon-red/60">Final Words</p>
                        <h2 className="text-2xl font-display font-bold text-white">
                          {dyingPlayer?.name ?? '—'}
                        </h2>
                        <span className="inline-block px-3 py-0.5 rounded-full border border-neon-red/50 bg-neon-red/10 text-neon-red text-[11px] font-mono tracking-widest uppercase">
                          {badge}
                        </span>
                        <p className="text-sm font-mono text-white/40">has 30 seconds to speak</p>
                      </div>
                      <div
                        className="w-24 h-24 rounded-full border-2 border-neon-red/40 flex items-center justify-center"
                        style={{ boxShadow: '0 0 30px rgba(255,45,85,0.2)' }}
                      >
                        <span className="text-3xl font-mono font-bold text-neon-red">{room.timer}</span>
                      </div>
                      {room.deathSpeakerId === myPlayer?.id && (
                        <div className="space-y-3 w-full max-w-xs">
                          <p className="text-center text-xs font-mono text-neon-red/70">Your mic is active — speak now</p>
                          {VoicePanel}
                        </div>
                      )}
                      {amHost && (
                        <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>
                          ⏭ {t.game.header.skip}
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              /* Grid view: day, speech, morning, role_reveal */
              <div className="flex-1 overflow-hidden">
                <PlayerGrid
                  players={gridPlayers}
                  phase={phase}
                  currentSpeakerId={room.currentSpeakerId}
                  myPlayerId={myPlayer?.id ?? null}
                  voteCounts={voteCounts}
                  selectedVoteId={myVoteTarget}
                  showRoles={amSpectator}
                  fillHeight
                  voice={tileVoice}
                  allyIds={allyIds}
                  onSelect={handlePlayerSelect}
                  belowHero={phase === 'speech' && !amSpectator && (() => {
                    const isMyTurn = room.currentSpeakerId === myPlayer?.id && amAlive;
                    const myNom = isMyTurn ? room.nominations?.[myPlayer!.id] : undefined;
                    const nominatedPlayer = myNom ? room.players.find(p => p.id === myNom) : null;
                    if (!isMyTurn) return null;
                    return (
                      <div className="rounded-2xl border border-neon-red/30 bg-neon-red/8 p-4 space-y-3">
                        <p className="text-[11px] font-mono text-neon-red/70 uppercase tracking-widest text-center">
                          ⚖️ {t.game.speech.nominateLabel}
                        </p>
                        {nominatedPlayer ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-base font-bold text-neon-red">{nominatedPlayer.name}</span>
                            <button
                              onClick={() => nominate(null)}
                              disabled={isLoading}
                              className="text-xs text-white/40 hover:text-neon-red font-mono transition-colors"
                            >
                              ✕ {t.game.speech.withdrawNomination}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 justify-center">
                            {room.players
                              .filter(p => p.isAlive && !p.isSpectator && p.id !== myPlayer!.id)
                              .map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => nominate(p.id)}
                                  disabled={isLoading}
                                  className="px-3 py-2 rounded-xl border border-neon-red/30 text-neon-red/70 text-sm font-mono font-semibold hover:border-neon-red/70 hover:text-neon-red hover:bg-neon-red/10 transition-all disabled:opacity-40"
                                >
                                  {p.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                />

                {/* Day skip vote — glass style */}
                {phase === 'day' && !amSpectator && amAlive && (() => {
                  const active = room.players.filter(p => p.isAlive && !p.isSpectator);
                  const skipNeeded = Math.min(3, Math.floor(active.length / 2) + 1);
                  const alreadyVoted = room.daySkipVoteCount ?? 0;
                  return (
                    <div className="flex-shrink-0 flex justify-center px-4 pb-4" style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))' }}>
                      <button
                        onClick={() => { daySkipVote(); navigator.vibrate?.(50); }}
                        disabled={isLoading}
                        className="px-6 py-3 rounded-2xl text-sm font-mono font-semibold transition-all active:scale-95 disabled:opacity-40"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          backdropFilter: 'blur(12px)',
                          color: alreadyVoted >= skipNeeded ? 'rgba(0,229,255,0.9)' : 'rgba(255,255,255,0.5)',
                          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                        }}
                      >
                        ⏭ Skip  ·  {alreadyVoted} / {skipNeeded}
                      </button>
                    </div>
                  );
                })()}

                {(amHost || (phase === 'speech' && room.currentSpeakerId === myPlayer?.id && amAlive)) && phase === 'speech' && (
                  <div className="flex-shrink-0 px-4 py-2 pb-20 text-center">
                    <Button size="sm" variant="ghost" loading={isLoading} onClick={skipPhase}>
                      {amHost ? <>⏭ {t.game.header.skip}</> : 'Pass →'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Floating chat bubble */}
          <button
            onClick={() => { setShowChat(true); setUnreadChat(0); }}
            className="fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={amSpectator ? {
              background: 'rgba(155,0,255,0.15)',
              border: '1.5px solid rgba(155,0,255,0.5)',
              boxShadow: '0 0 20px rgba(155,0,255,0.15), 0 4px 16px rgba(0,0,0,0.5)',
            } : {
              background: 'rgba(0,229,255,0.15)',
              border: '1.5px solid rgba(0,229,255,0.4)',
              boxShadow: '0 0 20px rgba(0,229,255,0.15), 0 4px 16px rgba(0,0,0,0.5)',
            }}
            aria-label={amSpectator ? 'Open spectator theater' : 'Open chat'}
          >
            {amSpectator ? (
              <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(155,0,255,0.9))' }}>👁</span>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="rgba(0,229,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {unreadChat > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-neon-red text-white text-[9px] flex items-center justify-center font-bold">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>

          {/* Chat overlay panel */}
          <AnimatePresence>
            {showChat && (
              <motion.div
                key="chat-overlay"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-50 flex flex-col"
                style={{ background: 'rgba(4,2,16,0.97)' }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
                  style={{ borderColor: 'rgba(255,255,255,0.08)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
                >
                  <span className={clsx(
                    'text-sm font-display uppercase tracking-widest',
                    amSpectator ? 'text-neon-purple/70' : 'text-white/60',
                  )}>
                    {amSpectator ? '👁 Spectator Theater' : 'Chat'}
                  </span>
                  <button
                    onClick={() => setShowChat(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-4">
                  {amSpectator && <SpectatorTheater room={room} myPlayer={myPlayer} />}
                  <ChatPanel />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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

      {/* In-game players panel */}
      <InGamePlayersPanel
        open={showPlayersPanel}
        onClose={() => setShowPlayersPanel(false)}
        players={activePlayers}
        phase={phase}
        currentSpeakerId={phase === 'speech' ? room.currentSpeakerId : null}
        myPlayerId={myPlayer?.id ?? null}
        speakingSocketIds={speakingSocketIds}
      />

      {reportProfileId && (
        <ReportModal
          targetProfileId={reportProfileId}
          targetName={room.players.find(p => p.profileId === reportProfileId)?.name ?? ''}
          roomId={room.id}
          onClose={() => setReportProfileId(null)}
          onSuccess={msg => { addToast(msg, 'success'); setReportProfileId(null); }}
        />
      )}

      <VoteRevealScreen breakdown={voteBreakdown} onDismiss={dismissVoteBreakdown} />
      <TutorialOverlay />

      {/* Mod panel overlay */}
      <AnimatePresence>
        {showModPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] overflow-y-auto"
            style={{ background: 'rgba(6,3,18,0.97)' }}
          >
            <div className="relative">
              <button
                onClick={() => setShowModPanel(false)}
                className="fixed top-4 right-4 z-[401] w-9 h-9 rounded-full flex items-center justify-center font-mono text-white/50 hover:text-white/90 transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                ✕
              </button>
              <ModDashboardPage />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
