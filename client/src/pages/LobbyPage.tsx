import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useGameStore } from '@/store/gameStore';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { VoiceControls } from '@/components/game/VoiceControls';
import { VoiceParticipants } from '@/components/game/VoiceParticipants';
import { RolePickerPanel } from '@/components/lobby/RolePickerPanel';
import { extractYouTubeId } from '@/components/community/YouTubeEmbed';
import { RoleInfoModal } from '@/components/ui/RoleInfoModal';
import { RoomMoreMenu } from '@/components/ui/RoomMoreMenu';
import { PlayerActionMenu } from '@/components/ui/PlayerActionMenu';
import { SendGiftModal } from '@/components/ui/SendGiftModal';
import { socket } from '@/lib/socket';
import type { PlayerPublic } from '@/types/index';
import { ModPanel } from '@/pages/ModDashboardPage';
import { useVoiceChat, registerVoiceGestureRetry } from '@/hooks/useVoiceChat';
import { useLivekitRoomVoice, useLiveKitGate } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { useGameSounds } from '@/hooks/useSoundFX';
import { PlayerName } from '@/components/ui/PlayerName';
import { LobbyItemsBar } from '@/components/game/LobbyItemsBar';
import { IncognitoPanel } from '@/components/game/IncognitoPanel';
import { useIncognitoStore } from '@/store/incognitoStore';
import { RoomFxLayer } from '@/components/game/RoomFxLayer';
import { roomSkinStyle } from '@/constants/perks';

const SURFACE = 'rounded-2xl border border-white/[0.06]';
const SURFACE_BG = { background: 'rgba(10, 6, 28, 0.92)' } as const;

export function LobbyPage() {
  const {
    room, myPlayer, amHost, toggleReady, kickPlayer, startGame,
    updateSettings, leaveRoom, transferHost, isLoading, autoStartCountdown,
    claimDonModerator, toSpectator, toPlayer,
  } = useGameStore(s => ({
    room: s.room,
    myPlayer: s.myPlayer(),
    amHost: s.amHost(),
    toggleReady: s.toggleReady,
    kickPlayer: s.kickPlayer,
    startGame: s.startGame,
    updateSettings: s.updateSettings,
    leaveRoom: s.leaveRoom,
    transferHost: s.transferHost,
    isLoading: s.isLoading,
    autoStartCountdown: s.autoStartCountdown,
    claimDonModerator: s.claimDonModerator,
    toSpectator: s.toSpectator,
    toPlayer: s.toPlayer,
  }));

  const { openProfile, openDmList, unreadDmCount } = useSocialStore();
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);
  const isOwner = useAuthStore(s => s.profile?.moderatorLevel === 'owner');
  const myLevel = useAuthStore(s => s.profile?.level ?? 1);
  const { fillBots, clearBots } = useGameStore(s => ({ fillBots: s.fillBots, clearBots: s.clearBots }));

  // ── Night music (settings card) ─────────────────────────────────────
  const [nmInput, setNmInput] = useState('');
  const [nmError, setNmError] = useState(false);
  const [nmPreview, setNmPreview] = useState<{ title: string; thumb: string } | null>(null);
  const nmVideoId = room?.settings.nightMusicVideoId ?? null;
  useEffect(() => {
    setNmPreview(null);
    if (!nmVideoId) return;
    let cancelled = false;
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://youtu.be/' + nmVideoId)}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setNmPreview({ title: d.title ?? '', thumb: d.thumbnail_url ?? '' }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [nmVideoId]);
  const handleNmInput = (raw: string) => {
    setNmInput(raw);
    if (!raw.trim()) { setNmError(false); return; }
    const id = extractYouTubeId(raw.trim());
    if (id) {
      setNmError(false);
      if (id !== nmVideoId) updateSettings({ nightMusicVideoId: id, nightMusicEnabled: true });
      setNmInput('');
    } else {
      setNmError(true);
    }
  };

  const handleLeave = () => { voice.leaveVoice(); leaveRoom(); };
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRoleGuide, setShowRoleGuide] = useState(false);
  const [showModPanel, setShowModPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSpectators, setShowSpectators] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const [playerRoles, setPlayerRoles] = useState<Record<string, { role: string; team: string; won: boolean }>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [friends, setFriends] = useState<Array<{ profileId: string; username: string; avatar: string; isOnline: boolean }>>([]);
  const [lobbyActionTarget, setLobbyActionTarget] = useState<PlayerPublic | null>(null);
  const [lobbyGiftTarget, setLobbyGiftTarget] = useState<{ profileId: string; name: string; avatar: string; avatarUrl: string | null } | null>(null);
  const [sentInvites, setSentInvites] = useState<Set<string>>(new Set());
  const t = useT();
  const voice = useVoiceChat();
  useGameSounds();
  const autoJoined = useRef(false);

  const amSpectator = myPlayer?.isSpectator ?? false;

  // The server is the authority on whether we are masked — it refuses the flag
  // from a free account, and it re-derives the alias on every reconnect. Mirror
  // it rather than trusting whatever the toggle last did.
  const syncIncognito = useIncognitoStore(s => s.syncFromRoom);
  useEffect(() => { syncIncognito(myPlayer); }, [myPlayer?.incognito, myPlayer?.myAlias, syncIncognito]);

  // LiveKit voice in the lobby: the room maps to a LiveKit room of the same id.
  // When enabled it REPLACES the legacy mesh here (mesh auto-join and controls
  // are guarded on livekitEnabled) so the mic is never double-captured.
  const { enabled: livekitEnabled, resolved: livekitResolved } = useLiveKitGate();
  const lobbyVoice = useLivekitRoomVoice({
    roomId: room?.id ?? null,
    identity: myPlayer?.id ?? null,
    active: livekitEnabled && !!room,
    listenOnly: amSpectator,
  });

  // Track unread lobby chat messages (mobile floating bubble badge)
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

  useEffect(() => {
    if (!room?.id || autoJoined.current || voice.channel) return;
    if (!livekitResolved) return;          // wait until we know which voice to use
    if (livekitEnabled) { autoJoined.current = true; return; } // LiveKit owns voice — skip mesh
    autoJoined.current = true;
    if (amSpectator) {
      voice.joinVoiceListenOnly('room');
    } else {
      // Try immediately (works on Android / pre-granted). If it fails silently
      // (iOS Safari, no pre-granted permission), wait for the first tap.
      voice.joinVoice('room', false, true).catch(() => {});
      registerVoiceGestureRetry(() => voice.joinVoice('room', false, false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, amSpectator, livekitResolved, livekitEnabled]);

  const profileIds = room?.players
    ? [...room.players.values()].filter(p => !p.isSpectator && p.profileId).map(p => p.profileId!)
    : [];
  const profileIdsKey = profileIds.sort().join(',');

  useEffect(() => {
    if (!profileIds.length || !room?.code) return;
    socket.emit('lobby:player_roles' as any, { profileIds, roomCode: room.code }, (res: any) => {
      if (res?.data) setPlayerRoles(res.data);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileIdsKey, room?.code]);

  const loadFriends = useCallback(() => {
    // Invite pool = friends + community follows (following + followers).
    socket.emit('friend:invitable_list' as any, (res: any) => {
      if (res?.data) setFriends(res.data);
    });
  }, []);

  if (!room) return null;
  // Host always first (#1), then everyone else in join order
  const activePlayers = [
    ...room.players.filter(p => !p.isSpectator && p.isHost),
    ...room.players.filter(p => !p.isSpectator && !p.isHost),
  ];
  const spectators = room.players.filter(p => p.isSpectator);
  // What every OTHER client's list contains: the server already strips invisible
  // spectators from their copies, and the only one it can ever leave in ours is
  // ourselves. So dropping our own hidden row reconstructs their view exactly.
  const visibleSpectatorCount = spectators.filter(s => !(s.id === myPlayer?.id && s.invisibleSpectator)).length;
  const playerCount = activePlayers.length;
  const minPlayers = room.settings.minPlayers;
  const canStart = amHost && playerCount >= minPlayers;
  const readyCount = activePlayers.filter(p => !p.isHost && p.isReady).length;
  const nonHostCount = activePlayers.filter(p => !p.isHost).length;
  const allReady = nonHostCount > 0 && readyCount === nonHostCount;
  const readyPct = nonHostCount > 0 ? (readyCount / nonHostCount) * 100 : 0;

  function roleColor(team: string) {
    return team === 'mafia' ? 'rgba(239,68,68,0.65)'
      : team === 'yakuza' ? 'rgba(251,146,60,0.65)'
      : team === 'cult' ? 'rgba(168,85,247,0.65)'
      : team === 'neutral' ? 'rgba(250,204,21,0.65)'
      : 'rgba(34,211,238,0.55)';
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://voidmafia.one/join/${room.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const url = `https://voidmafia.one/join/${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Void Mafia', text: `Join my game — code: ${room.code}`, url });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  // Room Skin perk: the host's palette dresses the room for everyone in it.
  // Only the page ground and the ambient glow change — card surfaces, text and
  // every state colour (ready / host / danger) stay exactly as they were, so no
  // skin can make the lobby unreadable.
  const skin = roomSkinStyle(room.skin);

  return (
    <div
      className="min-h-screen relative overflow-hidden pb-20"
      style={{ background: skin.page, transition: 'background 0.4s ease' }}
    >
      {/* Ambient — single top glow only */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: skin.glow }}
      />

      {/* Entrance banners and thrown stickers (server-broadcast, everyone sees
          the same thing at the same moment). */}
      <RoomFxLayer />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-3">

        {/* ── Header ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2.5"
        >
          {/* Row 1 — toolbar (left) + room code (right) */}
          <div className="flex items-center justify-between gap-3">
            {/* Left toolbar — leave / more / mod / messages */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Leave room */}
              <button
                onClick={() => setShowLeaveConfirm(true)}
                disabled={isLoading}
                title={playerCount > 1 ? 'Leave room' : 'Close room'}
                className="p-2 rounded-xl transition-all active:scale-90 disabled:opacity-30"
                style={{ border: '1px solid rgba(255,60,60,0.20)', color: 'rgba(255,80,80,0.60)', background: 'rgba(255,40,40,0.05)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
              {/* More menu */}
              <button
                onClick={() => setShowMoreMenu(true)}
                className="p-2 rounded-xl transition-all hover:bg-white/5 active:scale-95"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
                title="More options"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" />
                </svg>
              </button>
              {/* Mod panel */}
              {isMod && (
                <button
                  onClick={() => setShowModPanel(true)}
                  className="p-2 rounded-xl transition-colors"
                  style={{ border: '1px solid rgba(0,229,255,0.25)', color: 'rgba(0,229,255,0.7)', background: 'rgba(0,229,255,0.06)' }}
                  title="Mod Panel"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </button>
              )}
              {/* Messages */}
              <button
                onClick={openDmList}
                className="relative p-2 rounded-xl transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.28)' }}
                title="Messages"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {unreadDmCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 text-void text-[7px] font-bold rounded-full min-w-[13px] h-3.5 flex items-center justify-center px-0.5 leading-none"
                    style={{ background: '#ff0080' }}
                  >
                    {unreadDmCount > 9 ? '9+' : unreadDmCount}
                  </span>
                )}
              </button>
            </div>

            {/* Room code (right) */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-sm font-bold text-neon-cyan/80 tracking-[0.12em] truncate">
                {room.code}
              </span>
              <button onClick={handleCopy} className={clsx(
                'text-[11px] px-1.5 py-0.5 rounded border font-mono transition-all shrink-0',
                copied
                  ? 'border-neon-green/35 bg-neon-green/[0.07] text-neon-green/80'
                  : 'border-white/[0.08] text-white/22 hover:border-white/18 hover:text-white/45',
              )}>
                {copied ? '✓' : 'Copy'}
              </button>
              <button onClick={handleShare} className={clsx(
                'text-[11px] px-1.5 py-0.5 rounded border font-mono transition-all shrink-0',
                shared
                  ? 'border-neon-cyan/35 bg-neon-cyan/[0.07] text-neon-cyan/80'
                  : 'border-white/[0.08] text-white/22 hover:border-white/18 hover:text-white/45',
              )}>
                {shared ? '✓' : 'Share'}
              </button>
            </div>
          </div>

          {/* Row 2 — status (left) + room name / ranked (right) */}
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={clsx(
                'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                allReady && canStart ? 'bg-neon-green animate-pulse' : 'bg-white/[0.18]',
              )} />
              <span className="text-[11px] font-mono text-white/35 whitespace-nowrap">
                {allReady && canStart
                  ? t.lobby.allReady
                  : t.lobby.joinedOf.replace('{n}', String(playerCount)).replace('{m}', String(minPlayers))}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {room.name && (
                <p className="text-[11px] font-display font-bold text-white/45 truncate max-w-[110px]">{room.name}</p>
              )}
              {room.settings.isPrivate && (
                <p className="text-[11px] text-white/22 font-mono">Private</p>
              )}
              {room.settings.ranked && (
                <span
                  className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md"
                  style={{ color: '#9b00ff', background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.25)' }}
                >
                  ⚔️ Ranked
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Items (perks) ────────────────────────────────────── */}
        {/* Top of the lobby on purpose: this is where invisibility and the
            anonymous mask actually take effect, so it's where you should be
            able to buy them and flip them on. */}
        <LobbyItemsBar isSpectator={amSpectator} liveInvisible={!!myPlayer?.invisibleSpectator} isHost={amHost} />

        {/* ── Incognito (verified) ─────────────────────────────── */}
        {/* Beside the perk strip rather than inside it: the perks are bought
            with coins and this one comes with the badge, and putting them in
            one row would imply the wrong thing about both. */}
        <div className="flex flex-col items-start"><IncognitoPanel /></div>

        {/* ── Main grid ────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left column — players + actions */}
          <div className="lg:col-span-2 space-y-3">

            {/* ── Player list ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className={SURFACE}
              style={SURFACE_BG}
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                <span className="text-[11px] font-mono text-white/35">
                  {t.lobby.players}
                  <span className="ml-2 text-white/50">{playerCount}</span>
                </span>
                <div className="flex items-center gap-3">
                  {amHost && (
                    <button
                      onClick={() => { loadFriends(); setShowInvite(true); }}
                      className="flex items-center gap-1 text-[11px] font-mono transition-colors text-yellow-400/55 hover:text-yellow-400/90"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="19" y1="8" x2="19" y2="14"/>
                        <line x1="22" y1="11" x2="16" y2="11"/>
                      </svg>
                      <span>Invite</span>
                    </button>
                  )}
                  {spectators.length > 0 && (
                    <button
                      onClick={() => setShowSpectators(s => !s)}
                      className="flex items-center gap-1 text-[12px] font-mono text-white/30 hover:text-white/55 transition-colors"
                      title={myPlayer?.invisibleSpectator
                        ? `${visibleSpectatorCount} spectator(s) — you are invisible and not counted for anyone else`
                        : 'Spectators'}
                    >
                      <span>{myPlayer?.invisibleSpectator ? '🕵️' : '👁'}</span>
                      {/* Your own invisible row inflates this number by one, and
                          only in your copy. Show what everyone else sees, with
                          your hidden self split out. */}
                      <span>{myPlayer?.invisibleSpectator
                        ? `${visibleSpectatorCount} +შენ`
                        : spectators.length}</span>
                    </button>
                  )}
                {nonHostCount > 0 && (
                  <div className="flex items-center gap-2.5">
                    <span className="text-[12px] font-mono text-white/22">
                      {readyCount}/{nonHostCount} ready
                    </span>
                    <div className="w-16 h-0.5 bg-white/[0.07] rounded-full overflow-hidden">
                      <motion.div
                        className={clsx('h-full rounded-full', allReady ? 'bg-neon-green' : 'bg-neon-cyan/50')}
                        animate={{ width: `${readyPct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}
                </div>
              </div>

              {/* Rows */}
              <div className="px-2 py-2">
                {activePlayers.map((player, i) => {
                  const isMe = player.id === myPlayer?.id;
                  const num = i + 1;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.06 + i * 0.03 }}
                      onClick={() => {
                        if (!player.profileId) return;
                        if (isMe) { openProfile(player.profileId); }
                        else { setLobbyActionTarget(player as PlayerPublic); }
                      }}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors cursor-pointer',
                        isMe
                          ? 'bg-white/[0.03] hover:bg-white/[0.05]'
                          : 'hover:bg-white/[0.025]',
                      )}
                    >
                      {/* Sequential number */}
                      <span
                        className="flex-shrink-0 w-5 text-center font-mono text-[12px] font-bold select-none"
                        style={{ color: num === 1 ? 'rgba(255,180,0,0.55)' : 'rgba(255,255,255,0.18)' }}
                      >
                        {num}
                      </span>
                      <Avatar name={player.name} isHost={player.isHost} size="sm" src={player.avatarUrl ?? undefined} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={clsx(
                            'text-sm font-medium truncate',
                            player.isModerator ? 'text-neon-green/75'
                            : player.isHost ? 'text-yellow-400/75'
                            : isMe ? 'text-white/90'
                            : 'text-white/60',
                          )}>
                            {/* Your own row shows the ALIAS while you are
                                masked. Showing your real name here was correct
                                and useless: the one thing you need to see is
                                what the table sees, and a list that looks
                                unchanged reads as a mask that is not working. */}
                            {player.incognito && player.myAlias
                              ? <span style={{ color: '#c4b5fd' }}>🕶 {player.myAlias}</span>
                              : <PlayerName profileId={player.profileId} name={player.name} />}
                          </span>
                          {isMe && (
                            <span className="text-[12px] font-mono text-white/18 border border-white/[0.08] rounded px-1 py-px">
                              you
                            </span>
                          )}
                          {player.incognito && (
                            <span className="text-[12px] font-mono rounded px-1 py-px"
                              style={{ color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.28)' }}>
                              {player.name}
                            </span>
                          )}
                          {/* You are a moderator, so you are seeing a name the
                              rest of the table cannot. Without this the feature
                              looks broken to exactly the people who cannot use
                              it — which is how it was reported. */}
                          {player.maskedToOthers && (
                            <span className="text-[12px] font-mono rounded px-1 py-px"
                              style={{ color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.28)' }}
                              title="მოდერატორის ხედი — სხვები ხედავენ ფსევდონიმს">
                              🕶 {player.aliasShown}
                            </span>
                          )}
                          {player.isModerator && (
                            <span className="text-[12px] font-mono text-neon-green/50 border border-neon-green/15 rounded px-1 py-px">
                              mod
                            </span>
                          )}
                          {!player.isConnected && (
                            <span className="text-[12px] font-mono text-white/18 border border-white/[0.07] rounded px-1 py-px">
                              reconnecting
                            </span>
                          )}
                        </div>
                        {player.profileId && playerRoles[player.profileId] && (
                          <p className="text-[11px] font-mono mt-0.5" style={{ color: roleColor(playerRoles[player.profileId]!.team) }}>
                            was {playerRoles[player.profileId]!.role}
                          </p>
                        )}
                      </div>

                      {/* Status */}
                      <div className="shrink-0 text-right">
                        {player.isHost ? (
                          <span className="text-[12px] font-mono text-yellow-400/50">Host</span>
                        ) : player.isReady ? (
                          <span className="flex items-center gap-1.5 text-[12px] font-mono text-neon-green/60">
                            <span className="w-1 h-1 rounded-full bg-neon-green/60" />
                            Ready
                          </span>
                        ) : (
                          <span className="text-[12px] font-mono text-white/18">—</span>
                        )}
                      </div>

                      {/* Host controls */}
                      {amHost && !isMe && (
                        <div className="flex items-center gap-1 ml-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          {confirmTransferId === player.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[12px] text-white/22 font-mono">make host?</span>
                              <button
                                onClick={() => { transferHost(player.id); setConfirmTransferId(null); }}
                                disabled={isLoading}
                                className="text-[12px] px-1.5 py-0.5 rounded border border-yellow-400/25 text-yellow-400/60 hover:bg-yellow-400/8 transition-colors"
                              >✓</button>
                              <button
                                onClick={() => setConfirmTransferId(null)}
                                className="text-[12px] px-1 text-white/18 hover:text-white/45 transition-colors"
                              >✕</button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmTransferId(player.id)}
                                title="Transfer host"
                                className="flex flex-col items-center gap-0.5 rounded px-1.5 py-0.5 text-yellow-400/50 hover:text-yellow-400 hover:bg-yellow-400/10 transition-colors group"
                              >
                                <span className="text-[16px] leading-none">♛</span>
                                <span className="text-[8px] font-mono uppercase tracking-wide opacity-70 group-hover:opacity-100">Host</span>
                              </button>
                              <button
                                onClick={() => kickPlayer(player.id)}
                                className="w-6 h-6 flex items-center justify-center rounded text-white/10 hover:text-neon-red/60 transition-colors text-xs font-mono font-bold"
                                title="Kick"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Spectator list (collapsible) */}
              {showSpectators && spectators.length > 0 && (
                <div className="px-4 pb-3 border-t border-white/[0.04]">
                  <p className="text-[12px] font-mono text-white/20 uppercase tracking-[0.2em] pt-2 mb-1.5">Watching</p>
                  <div className="space-y-0.5">
                    {spectators.map(s => {
                      // The server sends an invisible spectator's row to that
                      // spectator ONLY — everyone else's list has no such row.
                      // Without saying so, seeing your own name here reads as
                      // "the perk isn't working".
                      const hiddenSelf = s.id === myPlayer?.id && !!s.invisibleSpectator;
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-1 py-1 rounded-md"
                          style={hiddenSelf ? { border: '1px dashed rgba(155,0,255,0.35)', background: 'rgba(155,0,255,0.07)' } : undefined}>
                          <span className="text-[12px] text-white/25">{hiddenSelf ? '🕵️' : '👁'}</span>
                          <span className="text-[11px] font-mono" style={{ color: hiddenSelf ? '#d9b8ff' : 'rgba(255,255,255,0.4)' }}>{s.name}</span>
                          {hiddenSelf && (
                            <span className="text-[10px] font-mono ml-auto" style={{ color: 'rgba(217,184,255,0.65)' }}>
                              უჩინარი · მხოლოდ შენ ხედავ
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {myPlayer?.invisibleSpectator && (
                    <p className="text-[10px] font-mono text-white/25 leading-snug pt-1.5">
                      სხვა მოთამაშეების სიაში ეს ჩანაწერი საერთოდ არ არსებობს — არც სახელი, არც დამკვირვებლების რიცხვში.
                    </p>
                  )}
                </div>
              )}

              {/* Need more players */}
              {playerCount < minPlayers && (
                <div className="mx-4 mb-3 pt-2.5 border-t border-white/[0.04] flex items-center gap-2.5">
                  <div className="flex gap-0.5">
                    {Array.from({ length: minPlayers }).map((_, i) => (
                      <div key={i} className={clsx(
                        'w-1 h-1 rounded-full transition-colors',
                        i < playerCount ? 'bg-neon-cyan/40' : 'bg-white/[0.07]',
                      )} />
                    ))}
                  </div>
                  <span className="text-[12px] font-mono text-white/22">
                    {minPlayers - playerCount} more player{minPlayers - playerCount !== 1 ? 's' : ''} needed
                  </span>
                </div>
              )}
            </motion.div>

            {/* ── Don Mode lobby section ─────────────────────── */}
            {room.settings.donMode && (() => {
              const modPlayer = room.donModeratorId
                ? room.players.find(p => p.id === room.donModeratorId) ?? null
                : null;
              const iAmModerator = myPlayer?.id === room.donModeratorId;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border p-4 space-y-3"
                  style={{ borderColor: 'rgba(155,0,255,0.35)', background: 'linear-gradient(160deg, rgba(30,6,55,0.75), rgba(10,4,24,0.9))', boxShadow: '0 0 24px rgba(155,0,255,0.1)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl" style={{ filter: 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' }}>♛</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold text-sm tracking-[0.18em] uppercase" style={{ color: '#c084fc' }}>{t.lobbyPage.donModeTitle}</p>
                      <p className="font-mono text-[11px] text-white/35">
                        {t.lobbyPage.donModeExact10}{room.settings.donModerator ? t.lobbyPage.donModePlusModerator : ''}{t.lobbyPage.donModeDeck}
                      </p>
                    </div>
                  </div>

                  {/* წამყვანის slot — appears when the host enables moderator play */}
                  {room.settings.donModerator && (
                    modPlayer ? (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(192,132,252,0.4)' }}>
                        <Avatar name={modPlayer.name} size="sm" src={modPlayer.avatarUrl ?? undefined} />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[12px] font-bold text-white/85 truncate">♛ {modPlayer.name}</p>
                          <p className="font-mono text-[10px]" style={{ color: 'rgba(192,132,252,0.7)' }}>{t.lobbyPage.gameModerator}</p>
                        </div>
                        {(iAmModerator || amHost) && (
                          <button
                            onClick={() => claimDonModerator(false)}
                            disabled={isLoading}
                            className="px-2.5 py-1.5 rounded-lg font-mono text-[11px] text-white/40 border border-white/10 hover:text-red-400/70 hover:border-red-400/30 transition-all disabled:opacity-40"
                          >
                            {t.lobbyPage.removeModerator}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => claimDonModerator(true)}
                        disabled={isLoading || amSpectator}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-[12.5px] font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                        style={{ background: 'rgba(155,0,255,0.15)', border: '1.5px dashed rgba(192,132,252,0.5)', color: '#c084fc' }}
                      >
                        {t.lobbyPage.becomeModerator}
                      </button>
                    )
                  )}
                </motion.div>
              );
            })()}

            {/* ── Action bar ─────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="space-y-2"
            >
              {/* Row 1: main action */}
              {!amHost && !amSpectator && (
                <Button
                  fullWidth
                  variant={myPlayer?.isReady ? 'neon-green' : 'neon-cyan'}
                  loading={isLoading}
                  onClick={() => {
                    toggleReady();
                    if (!livekitEnabled && !voice.channel) voice.joinVoice('room').catch(() => {});
                  }}
                >
                  {myPlayer?.isReady ? '✓ Ready' : t.lobby.ready}
                </Button>
              )}

              {amSpectator && (
                <div className="space-y-2">
                  <Button
                    fullWidth
                    variant="primary"
                    loading={isLoading}
                    onClick={() => toPlayer().catch(() => {})}
                  >
                    {t.lobbyPage.joinGameCta}
                  </Button>
                  <div className="flex items-center justify-center gap-2 py-1.5 text-white/28 text-[11px] font-mono">
                    👁 {t.lobby.watchingSpectator}
                  </div>
                </div>
              )}

              {amHost && (
                <div className="flex gap-2">
                  <Button
                    fullWidth
                    variant="primary"
                    loading={isLoading}
                    disabled={!canStart}
                    onClick={() => startGame()}
                  >
                    {canStart ? t.lobby.startGame : `Need ${minPlayers - playerCount} more`}
                  </Button>
                  <button
                    onClick={() => setShowSettings(s => !s)}
                    className={clsx(
                      'px-3 py-2 rounded-xl border text-[11px] font-mono whitespace-nowrap transition-all shrink-0',
                      showSettings
                        ? 'border-white/18 bg-white/[0.04] text-white/55'
                        : 'border-white/[0.07] bg-white/[0.02] text-white/28 hover:border-white/14 hover:text-white/50',
                    )}
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => amHost ? setShowLeaveConfirm(true) : handleLeave()}
                    disabled={isLoading}
                    className="p-2 rounded-xl border border-white/[0.06] text-white/20 hover:text-neon-red/55 hover:border-neon-red/20 transition-colors disabled:opacity-30 shrink-0"
                    title={playerCount > 1 ? 'Leave' : 'Close room'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                  </button>
                </div>
              )}

              {/* Non-host: view settings + leave */}
              {!amHost && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex-1 py-2 rounded-xl border border-white/[0.08] bg-white/[0.02] text-[11px] font-mono text-white/45 hover:text-white/70 hover:border-white/16 transition-all"
                  >
                    👁 Settings
                  </button>
                  <button
                    onClick={() => setShowLeaveConfirm(true)}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-xl border border-white/[0.06] text-[11px] font-mono text-white/18 hover:text-neon-red/50 hover:border-neon-red/20 transition-colors disabled:opacity-30"
                  >
                    Leave
                  </button>
                </div>
              )}

              {/* Owner bot tools — row 2 */}
              {amHost && isOwner && (
                <div className="flex gap-2">
                  {[10, 12].map(target => {
                    const need = target - playerCount;
                    if (need <= 0) return null;
                    return (
                      <button
                        key={target}
                        onClick={() => fillBots(need)}
                        disabled={isLoading}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-neon-purple/30 text-neon-purple/60 text-[11px] font-mono hover:border-neon-purple/60 hover:text-neon-purple/90 transition-all disabled:opacity-40"
                      >
                        🤖 +{need} → {target}p
                      </button>
                    );
                  })}
                  {[...room.players.values()].some(p => p.isBot) && (
                    <button
                      onClick={() => clearBots()}
                      disabled={isLoading}
                      className="px-3 py-1.5 rounded-xl border border-red-500/30 text-red-400/50 text-[11px] font-mono hover:border-red-500/60 hover:text-red-400/80 transition-all disabled:opacity-40"
                    >
                      ✕ bots
                    </button>
                  )}
                </div>
              )}

            </motion.div>

            {/* ── Auto-start countdown ────────────────────────── */}
            <AnimatePresence>
              {autoStartCountdown !== null && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-neon-green/18 bg-neon-green/[0.035]"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green/80 animate-ping" />
                  <span className="font-mono text-sm text-neon-green/75">
                    Starting in <span className="font-bold text-neon-green">{autoStartCountdown}s</span>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Settings overlay (pop-up; everyone can view, host edits) ── */}
            {createPortal(
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  key="settings-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowSettings(false)}
                  className="fixed inset-0 z-[1300] flex items-stretch justify-center sm:items-center sm:p-4"
                  style={{ background: 'rgba(2,1,10,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 28, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 28, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                    onClick={e => e.stopPropagation()}
                    className="relative w-full h-full sm:h-auto sm:max-w-lg sm:max-h-[88vh] flex flex-col overflow-hidden rounded-none sm:rounded-2xl border border-white/10"
                    style={{ background: 'rgba(8,5,22,0.98)', boxShadow: '0 20px 80px rgba(0,0,0,0.6)' }}
                  >
                    {/* Header with X (top-right) */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 flex-shrink-0 border-b border-white/8" style={{ background: 'rgba(12,7,30,0.92)' }}>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-sm tracking-[0.2em] uppercase text-white/85">{t.lobbyPage.settingsTitle}</h3>
                        <p className="text-[11px] font-mono text-white/30 truncate">
                          {amHost ? t.lobbyPage.settingsAutoSave : t.lobbyPage.settingsViewMode}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowSettings(false)}
                        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all active:scale-90"
                        title={t.lobbyPage.close}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
                        </svg>
                      </button>
                    </div>

                    {/* Read-only banner for non-hosts */}
                    {!amHost && (
                      <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0" style={{ background: 'rgba(155,0,255,0.08)', borderBottom: '1px solid rgba(155,0,255,0.15)' }}>
                        <span className="text-sm">🔒</span>
                        <span className="text-[11px] font-mono text-neon-purple/80">{t.lobbyPage.onlyHostCanEdit}</span>
                      </div>
                    )}

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <div className={`${SURFACE} p-4`} style={SURFACE_BG}>
                      <label className="block text-[12px] font-mono text-white/28 uppercase tracking-widest mb-2.5">
                        {t.lobby.passwordSection}
                      </label>
                      {amHost ? (
                        <input
                          type="text"
                          maxLength={64}
                          placeholder={t.lobby.passwordOpen}
                          value={room.settings.password ?? ''}
                          onChange={e => updateSettings({ password: e.target.value })}
                          className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-sm font-mono text-white/65 placeholder-white/15 focus:outline-none focus:border-neon-cyan/28 transition-colors"
                        />
                      ) : (
                        <p className="text-sm font-mono text-white/45">{room.settings.password ? t.lobbyPage.protectedRoom : t.lobby.passwordOpen}</p>
                      )}
                      {room.settings.password && amHost && (
                        <p className="text-[12px] font-mono text-white/28 mt-2">
                          {t.lobby.passwordHint}
                        </p>
                      )}
                    </div>

                    {/* ── Host Privileges ─────────────────────────── */}
                    <div className={`${SURFACE} p-4`} style={SURFACE_BG}>
                      <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-3">
                        Host Privileges
                      </p>
                      {!amHost ? (
                        <div className="w-full flex items-center justify-between gap-3 py-1 opacity-70">
                          <p className="text-[13px] font-mono text-white/55">⏭ Skip speech turns</p>
                          <div className={clsx('relative rounded-full flex-shrink-0', room.settings.hostSkipPrivilege ? 'bg-neon-cyan/50' : 'bg-white/10')} style={{ height: '22px', minWidth: '40px' }}>
                            <span className="absolute top-0.5 rounded-full bg-white/70" style={{ width: '18px', height: '18px', left: room.settings.hostSkipPrivilege ? '20px' : '2px' }} />
                          </div>
                        </div>
                      ) : myLevel < 13 ? (
                        <div className="py-1 opacity-60">
                          <div className="w-full flex items-center justify-between gap-3">
                            <div className="text-left">
                              <p className="text-[13px] font-mono text-white/40">🔒 ⏭ Skip speech turns</p>
                              <p className="text-[12px] font-mono text-white/25 mt-0.5">
                                {t.lobbyPage.requiresLvl13.replace('{n}', String(13 - myLevel))}
                              </p>
                            </div>
                            <div className="relative rounded-full flex-shrink-0 bg-white/10"
                              style={{ height: '22px', minWidth: '40px' }}>
                              <span className="absolute top-0.5 left-0.5 rounded-full bg-white/40"
                                style={{ width: '18px', height: '18px' }} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => updateSettings({ hostSkipPrivilege: !room.settings.hostSkipPrivilege })}
                          className="w-full flex items-center justify-between gap-3 py-1"
                        >
                          <div className="text-left">
                            <p className="text-[13px] font-mono text-white/70">⏭ Skip speech turns</p>
                            <p className="text-[12px] font-mono text-white/30 mt-0.5">
                              {room.settings.hostSkipPrivilege
                                ? 'Host can skip any player\'s speech minute'
                                : 'Only the speaker can pass their own turn'}
                            </p>
                          </div>
                          <div className={clsx(
                            'relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors duration-200',
                            room.settings.hostSkipPrivilege ? 'bg-neon-cyan/70' : 'bg-white/10',
                          )}
                            style={{ height: '22px', minWidth: '40px' }}
                          >
                            <span className={clsx(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200',
                              room.settings.hostSkipPrivilege ? 'left-5' : 'left-0.5',
                            )} style={{ width: '18px', height: '18px' }} />
                          </div>
                        </button>
                      )}
                    </div>

                    {/* ── Ranked Mode ─────────────────────────────── */}
                    <div className={`${SURFACE} p-4`} style={SURFACE_BG}>
                      <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest mb-3">
                        Ranked Mode
                      </p>
                      {!amHost ? (
                        <div className="w-full flex items-center justify-between gap-3 py-1 opacity-70">
                          <p className="text-[13px] font-mono text-white/55">⚔️ Ranked Match</p>
                          <div className={clsx('relative rounded-full flex-shrink-0', room.settings.ranked ? 'bg-neon-purple/50' : 'bg-white/10')} style={{ height: '22px', minWidth: '40px' }}>
                            <span className="absolute top-0.5 rounded-full bg-white/70" style={{ width: '18px', height: '18px', left: room.settings.ranked ? '20px' : '2px' }} />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => updateSettings({ ranked: !room.settings.ranked })}
                          className="w-full flex items-center justify-between gap-3 py-1"
                        >
                          <div className="text-left">
                            <p className="text-[13px] font-mono text-white/70">⚔️ Ranked Match</p>
                            <p className="text-[12px] font-mono text-white/30 mt-0.5">
                              {room.settings.ranked
                                ? 'ELO rating will be updated for all players'
                                : 'Enable to affect ELO ratings'}
                            </p>
                          </div>
                          <div className={clsx(
                            'relative w-10 h-5.5 rounded-full flex-shrink-0 transition-colors duration-200',
                            room.settings.ranked ? 'bg-neon-purple/70' : 'bg-white/10',
                          )}
                            style={{ height: '22px', minWidth: '40px' }}
                          >
                            <span className={clsx(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200',
                              room.settings.ranked ? 'left-5' : 'left-0.5',
                            )} style={{ width: '18px', height: '18px' }} />
                          </div>
                        </button>
                      )}
                    </div>

                    {/* ── Night Music ──────────────────────────────── */}
                    <div className={`${SURFACE} p-4`} style={SURFACE_BG}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div>
                          <p className="text-[12px] font-mono text-white/28 uppercase tracking-widest">{t.lobbyPage.nightMusicTitle}</p>
                          <p className="text-[11px] font-mono text-white/30 mt-1">
                            {t.lobbyPage.nightMusicHint}
                          </p>
                        </div>
                        {/* Enable toggle (host only, needs a link) */}
                        <button
                          onClick={() => amHost && nmVideoId && updateSettings({ nightMusicEnabled: !room.settings.nightMusicEnabled })}
                          disabled={!amHost || !nmVideoId || isLoading}
                          className="disabled:opacity-50 flex-shrink-0"
                        >
                          <div className={clsx(
                            'relative rounded-full transition-colors duration-200',
                            room.settings.nightMusicEnabled && nmVideoId ? 'bg-neon-cyan/70' : 'bg-white/10',
                          )} style={{ height: '22px', minWidth: '40px' }}>
                            <span className="absolute top-0.5 rounded-full bg-white transition-all duration-200"
                              style={{ width: '18px', height: '18px', left: room.settings.nightMusicEnabled && nmVideoId ? '20px' : '2px' }} />
                          </div>
                        </button>
                      </div>

                      {amHost && (
                        <input
                          type="text"
                          value={nmInput}
                          onChange={e => handleNmInput(e.target.value)}
                          placeholder={t.lobbyPage.youtubeLinkPlaceholder}
                          className="w-full bg-white/[0.03] border rounded-lg px-3 py-2 text-sm font-mono text-white/65 placeholder-white/15 focus:outline-none transition-colors"
                          style={{ borderColor: nmError ? 'rgba(255,45,85,0.5)' : 'rgba(255,255,255,0.07)' }}
                        />
                      )}
                      {nmError && (
                        <p className="text-[11px] font-mono mt-1.5" style={{ color: '#ff2d55' }}>{t.lobbyPage.invalidYoutubeLink}</p>
                      )}

                      {/* Current track preview */}
                      {nmVideoId && (
                        <div className="flex items-center gap-2.5 mt-2.5 px-2.5 py-2 rounded-lg"
                          style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
                          {nmPreview?.thumb
                            ? <img src={nmPreview.thumb} alt="" className="w-10 h-7 rounded object-cover flex-shrink-0" />
                            : <span className="text-base flex-shrink-0">🎵</span>}
                          <p className="flex-1 min-w-0 font-mono text-[11px] text-white/55 truncate">
                            {nmPreview?.title || `ID: ${nmVideoId} ✓`}
                          </p>
                          {amHost && (
                            <button
                              onClick={() => updateSettings({ nightMusicVideoId: null, nightMusicEnabled: false })}
                              disabled={isLoading}
                              className="flex-shrink-0 font-mono text-[12px] text-white/30 hover:text-red-400/70 transition-colors"
                              title={t.lobbyPage.deleteAction}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {room.settings.donMode ? (
                      /* ── Don Mode settings — fixed deck, only the წამყვანი choice ── */
                      <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'rgba(155,0,255,0.3)', background: 'rgba(20,0,40,0.5)' }}>
                        <div>
                          <h4 className="text-xs font-display font-bold uppercase tracking-widest" style={{ color: 'rgba(200,130,255,0.85)' }}>
                            {t.lobbyPage.donModeTitleSettings}
                          </h4>
                          <p className="text-[12px] font-mono text-white/30 mt-0.5">
                            {t.lobbyPage.donModeRolesFixed}
                          </p>
                        </div>

                        {/* წამყვანით / წამყვანის გარეშე */}
                        <button
                          onClick={() => amHost && updateSettings({ donModerator: !room.settings.donModerator })}
                          disabled={!amHost || isLoading}
                          className="w-full flex items-center justify-between gap-3 py-1 disabled:cursor-default"
                        >
                          <div className="text-left">
                            <p className={clsx('text-[13px] font-mono', amHost ? 'text-white/70' : 'text-white/45')}>{t.lobbyPage.donModeratorPlayLabel}</p>
                            <p className="text-[12px] font-mono text-white/30 mt-0.5">
                              {room.settings.donModerator
                                ? t.lobbyPage.donModeratorOnDesc
                                : t.lobbyPage.donModeratorOffDesc}
                            </p>
                          </div>
                          <div className={clsx(
                            'relative rounded-full flex-shrink-0 transition-colors duration-200',
                            room.settings.donModerator ? 'bg-neon-purple/70' : 'bg-white/10',
                          )} style={{ height: '22px', minWidth: '40px' }}>
                            <span className="absolute top-0.5 rounded-full bg-white transition-all duration-200"
                              style={{ width: '18px', height: '18px', left: room.settings.donModerator ? '20px' : '2px' }} />
                          </div>
                        </button>

                        <div className="space-y-1 text-[11px] font-mono text-white/30 pl-1 pt-1 border-t border-white/[0.06]">
                          <p>{t.lobbyPage.donFlowPlanningNight}</p>
                          <p>{t.lobbyPage.donFlowIndividualSpeeches}</p>
                          <p>{t.lobbyPage.donFlowChecks}</p>
                          <p>{t.lobbyPage.donFlowTie}</p>
                          <p>{t.lobbyPage.donFlowModerator}</p>
                        </div>
                      </div>
                    ) : (
                      <RolePickerPanel
                        settings={room.settings}
                        playerCount={playerCount}
                        onUpdate={updateSettings}
                        isLoading={isLoading}
                        readOnly={!amHost}
                      />
                    )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body)}

            {/* ── Voice ───────────────────────────────────────── */}
            {livekitEnabled ? (
              <LiveKitVoiceBarView voice={lobbyVoice} />
            ) : (
            <VoiceControls
              channel={voice.channel}
              status={voice.status}
              isMuted={voice.isMuted}
              forceMuted={voice.forceMuted}
              cameraOn={voice.cameraOn}
              isLocalSpeaking={voice.isLocalSpeaking}
              peerCount={voice.peers.length}
              error={voice.error}
              listenOnly={voice.listenOnly || amSpectator}
              defaultChannel="room"
              hideCamera
              hideLeave
              isRefreshing={voice.isRefreshing}
              onJoin={amSpectator
                ? () => voice.joinVoiceListenOnly('room')
                : (ch, wc) => voice.joinVoice(ch, wc)}
              onLeave={voice.leaveVoice}
              onToggleMute={voice.toggleMute}
              onToggleCamera={voice.toggleCamera}
              onReset={voice.resetConnection}
            />
            )}
            {voice.channel && voice.peers.length > 0 && (
              <div className="px-1">
                <VoiceParticipants
                  localName={myPlayer?.name ?? 'You'}
                  isLocalSpeaking={voice.isLocalSpeaking}
                  isMuted={voice.isMuted}
                  peers={voice.peers}
                  spectatorSocketIds={new Set(room.players.filter(p => p.isSpectator).map(p => p.socketId))}
                />
              </div>
            )}
          </div>

          {/* ── Chat column (desktop) ───────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`hidden lg:flex lg:col-span-1 ${SURFACE} p-0 min-h-[360px] flex-col overflow-hidden`}
            style={SURFACE_BG}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] flex-shrink-0">
              <span className="text-[11px] font-mono text-white/35">Chat</span>
              <span className="text-[12px] font-mono text-white/15">lobby</span>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <ChatPanel />
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Mobile chat preview strip (sticky bottom bar) ──────── */}
      {!showChat && (() => {
        const filtered = room.chat.filter(m => !m.isSystem);
        const recentMsg = filtered.length > 0 ? filtered[filtered.length - 1] : null;
        const hasUnread = unreadChat > 0;
        return (
          <motion.button
            animate={hasUnread ? { borderColor: ['rgba(255,45,85,0.35)', 'rgba(255,45,85,0.75)', 'rgba(255,45,85,0.35)'] } : {}}
            transition={hasUnread ? { repeat: Infinity, duration: 1.2 } : {}}
            onClick={() => { setShowChat(true); setUnreadChat(0); }}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-3 px-4 active:opacity-80 transition-opacity"
            style={{
              paddingTop: '10px',
              paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
              background: hasUnread ? 'rgba(20,4,10,0.97)' : 'rgba(6,2,20,0.95)',
              borderTop: hasUnread ? '1px solid rgba(255,45,85,0.45)' : '1px solid rgba(0,229,255,0.12)',
              boxShadow: hasUnread ? '0 -6px 24px rgba(255,45,85,0.18)' : '0 -4px 20px rgba(0,0,0,0.45)',
            }}
            aria-label="Open chat"
          >
            {/* Icon + badge */}
            <div className="relative shrink-0">
              <svg
                width="18" height="18" viewBox="0 0 22 22" fill="none"
                stroke={hasUnread ? 'rgba(255,45,85,0.9)' : 'rgba(0,229,255,0.55)'}
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {hasUnread && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 rounded-full bg-neon-red text-[8px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </div>

            {/* Last message preview */}
            <div className="flex-1 min-w-0 text-left">
              {recentMsg ? (
                <p className="text-[12px] font-mono truncate leading-snug">
                  <span className={hasUnread ? 'text-neon-red/80 font-semibold' : 'text-white/35'}>
                    {recentMsg.senderName}:{' '}
                  </span>
                  <span className={hasUnread ? 'text-white/70' : 'text-white/40'}>
                    {recentMsg.text}
                  </span>
                </p>
              ) : (
                <p className="text-[12px] font-mono text-white/20">{t.lobbyPage.lobbyChat}</p>
              )}
            </div>

            {/* Tap hint */}
            <span className="text-[10px] font-mono shrink-0" style={{ color: hasUnread ? 'rgba(255,45,85,0.5)' : 'rgba(255,255,255,0.15)' }}>
              {t.lobbyPage.openChat}
            </span>
          </motion.button>
        );
      })()}

      {/* Mobile chat overlay panel */}
      <AnimatePresence>
        {showChat && (
          <motion.div
            key="lobby-chat-overlay"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.25 }}
            className="lg:hidden fixed inset-0 z-50 flex flex-col"
            style={{ background: 'rgba(4,2,16,0.97)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
              style={{ borderColor: 'rgba(255,255,255,0.08)', paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
            >
              <span className="text-sm font-display uppercase tracking-widest text-white/60">Chat</span>
              <button
                onClick={() => setShowChat(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-all"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 p-3">
              <ChatPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RoleInfoModal open={showRoleGuide} onClose={() => setShowRoleGuide(false)} />

      <RoomMoreMenu
        open={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        phase="lobby"
        roomCode={room.code}
        players={room.players}
        amHost={amHost}
        isMod={isMod}
        isSpectator={amSpectator}
        activeRoleCounts={room.activeRoleCounts}
        clanId={room.clanId}
        clanRoom={room.clanRoom}
        viewerClanId={useAuthStore.getState().myClanId}
        viewerClanRole={useAuthStore.getState().myClanRole}
        voice={{
          channel: voice.channel,
          status: voice.status,
          isMuted: voice.isMuted,
          cameraOn: voice.cameraOn,
          listenOnly: amSpectator,
          peerCount: voice.peers.length,
          forceMuted: voice.forceMuted,
          error: voice.error,
          defaultChannel: 'room',
          onJoin: (ch, withCamera) => {
            if (amSpectator) { voice.joinVoiceListenOnly(ch ?? 'room'); return; }
            voice.joinVoice(ch ?? 'room', withCamera);
          },
          onLeave: () => voice.leaveVoice(),
          onToggleMute: voice.toggleMute,
          onToggleCamera: voice.toggleCamera,
          onReset: voice.channel ? () => {
            const hadCamera = voice.cameraOn;
            voice.leaveVoice();
            setTimeout(() => voice.joinVoice('room', hadCamera), 800);
          } : undefined,
        }}
        onLeaveRoom={handleLeave}
        onShowRoleGuide={() => setShowRoleGuide(true)}
        onKickPlayer={amHost ? kickPlayer : undefined}
      />

      {/* Mod panel overlay */}
      <ModPanel open={showModPanel} onClose={() => setShowModPanel(false)} />

      {/* Leave / switch confirm — centered modal */}
      {createPortal(
        <AnimatePresence>
          {showLeaveConfirm && (
            <motion.div
              className="fixed inset-0 z-[200] flex items-center justify-center p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLeaveConfirm(false)}
            >
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }} />
              <motion.div
                className="relative w-full max-w-[300px] rounded-2xl overflow-hidden"
                style={{ background: 'rgba(8,3,20,0.98)', border: '1px solid rgba(155,0,255,0.18)', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}
                initial={{ scale: 0.85, opacity: 0, y: 14 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.85, opacity: 0, y: 14 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26 }}
                onClick={e => e.stopPropagation()}
              >
                <div className="px-5 pt-5 pb-3 text-center">
                  <p className="font-display font-bold text-white/90 text-[16px]">
                    {playerCount > 1 ? t.lobbyPage.leaveDialogTitle : 'Close this room?'}
                  </p>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {/* Leave the room — red */}
                  <button
                    onClick={() => { setShowLeaveConfirm(false); handleLeave(); }}
                    disabled={isLoading}
                    className="w-full py-3 rounded-xl font-mono font-bold text-sm transition-all active:scale-[0.97] disabled:opacity-40"
                    style={{ background: 'rgba(255,40,60,0.14)', border: '1px solid rgba(255,60,80,0.42)', color: 'rgba(255,120,130,0.96)' }}
                  >
                    🚪 {t.lobbyPage.leaveRoomCta}
                  </button>
                  {/* Switch to spectators — blue */}
                  {!amSpectator && (
                    <button
                      onClick={() => { setShowLeaveConfirm(false); toSpectator().catch(() => {}); }}
                      disabled={isLoading}
                      className="w-full py-3 rounded-xl font-mono font-bold text-sm transition-all active:scale-[0.97] disabled:opacity-40"
                      style={{ background: 'rgba(0,150,255,0.12)', border: '1px solid rgba(0,180,255,0.42)', color: 'rgba(90,200,255,0.96)' }}
                    >
                      👁 {t.lobbyPage.switchToSpectatorsCta}
                    </button>
                  )}
                  {/* Cancel */}
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="w-full py-2.5 rounded-xl font-mono text-[13px] text-white/40 border border-white/10 hover:text-white/70 hover:border-white/20 transition-all"
                  >
                    {t.lobbyPage.cancel}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Invite friends modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[180] flex items-end justify-center pb-6 px-4"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl overflow-hidden"
              style={{ background: 'rgba(8,4,22,0.98)', border: '1px solid rgba(250,204,21,0.2)' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-display font-bold text-white/80">Invite Friends</span>
                <button onClick={() => setShowInvite(false)} className="text-white/30 hover:text-white/60 text-lg leading-none">✕</button>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {friends.filter(f => f.isOnline).length === 0 ? (
                  <p className="text-center text-[13px] font-mono text-white/25 py-8">No friends online</p>
                ) : (
                  friends.filter(f => f.isOnline).map(f => {
                    const sent = sentInvites.has(f.profileId);
                    return (
                      <div key={f.profileId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                          style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
                          {f.avatar || f.username[0]}
                        </div>
                        <span className="flex-1 text-sm font-medium text-white/80 truncate">{f.username}</span>
                        <button
                          disabled={sent}
                          onClick={() => {
                            socket.emit('room:invite' as any, { friendProfileId: f.profileId }, () => {});
                            setSentInvites(s => new Set([...s, f.profileId]));
                          }}
                          className={clsx(
                            'text-[12px] px-3 py-1 rounded-lg font-mono border transition-all',
                            sent
                              ? 'border-neon-green/25 text-neon-green/50 cursor-default'
                              : 'border-yellow-400/30 text-yellow-400/70 hover:border-yellow-400/55 hover:text-yellow-400 hover:bg-yellow-400/[0.07]',
                          )}
                        >
                          {sent ? '✓ Sent' : 'Invite'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player action menu (lobby) */}
      <AnimatePresence>
        {lobbyActionTarget && (
          <PlayerActionMenu
            player={lobbyActionTarget}
            isHostOrMod={amHost || isMod}
            onClose={() => setLobbyActionTarget(null)}
            onOpenProfile={profileId => { openProfile(profileId); setLobbyActionTarget(null); }}
            onSendGift={(profileId, name, avatar, avatarUrl) => {
              setLobbyGiftTarget({ profileId, name, avatar, avatarUrl });
              setLobbyActionTarget(null);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lobbyGiftTarget && (
          <SendGiftModal
            recipientId={lobbyGiftTarget.profileId}
            recipientName={lobbyGiftTarget.name}
            recipientAvatar={lobbyGiftTarget.avatar}
            recipientAvatarUrl={lobbyGiftTarget.avatarUrl}
            onClose={() => setLobbyGiftTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
