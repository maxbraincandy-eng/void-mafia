import { useEffect, useRef, useState, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { copyText } from '@/lib/clipboard';
import { useAuthStore } from '@/store/authStore';
import { useSxvaMafiaStore } from '@/store/sxvaMafiaStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import {
  getLiveKitRemoteVideo, getLiveKitLocalVideo, getLiveKitSpeaking, setLiveKitCamera,
  setLiveKitVideoQuality,
} from '@/services/livekitVoice';
import { tableQualityPlan } from '@/lib/videoQuality';
import { nextBell, NO_BELL, type BellMemory } from '@/lib/tableBell';
import { SeatEmblem, assignEmblems } from './SeatEmblem';
import { ringShape, fitTile } from './ringShape';
import { VoidCardBack } from './VoidCardBack';
import { XM_ROLE_META, XM_TEAM_META, type XmSafeSeat, type XmSafeState, type XmRole } from '@/types/sxvaMafia';
import { GameInviteButton } from '@/components/social/GameInviteButton';

/**
 * სხვა მაფია (Other Mafia) — a from-scratch, video-first "table mafia".
 * Every player is a webcam tile in the grid; the active speaker's tile glows and
 * runs its own countdown; a moderator ("host") sits centre-stage, drives the
 * phases and hands out fouls. Prop-less overlay reading the store, like the
 * other match games. Shares nothing with the platform's original mafia engine.
 */

const RED = '#ff3b47';
/** The cult's colour, used wherever a convert is marked. */
const CULT = XM_TEAM_META.cult.color;

/**
 * Black or white on top of this colour, whichever can actually be read.
 *
 * The role palette runs from #ff3b47 to #7fe0a0 to #c084fc, and white text was
 * hardcoded on all of it — washed out on the mint and the candlelight. This
 * works out both contrast ratios the way WCAG defines them and takes the
 * better one, rather than guessing at a luminance cutoff, so a role added
 * later gets a readable button without anyone remembering to check.
 */
function ink(hex: string): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / 0.05;
  return onBlack > onWhite ? '#0d0512' : '#fff';
}
// Tasteful per-seat avatar tints for when a webcam isn't showing.
const AV = ['#7c5cff', '#3f8cff', '#2fb8a0', '#e0803c', '#d84f7a', '#5cbe6a', '#c78cff', '#4aa0d8', '#e0b23c', '#5c7cff'];
// A fixed twinkling starfield for the night overlay (computed once).
const STARS = Array.from({ length: 54 }, (_, i) => ({ x: (i * 37 + 13) % 100, y: (i * 53 + 7) % 100, s: 1 + ((i * 7) % 3) * 0.7, d: ((i * 11) % 40) / 10 }));

function fmt(sec: number): string { const s = Math.max(0, sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
/**
 * A candidate's window is about five seconds, and `0:02` is a clumsy way to
 * write two. Minutes appear only if there are ever any.
 */
function secs(sec: number): string { const s = Math.max(0, sec); return s >= 60 ? fmt(s) : String(s); }

/** Viewport-width gate: the centre-stage ring only makes sense on wider screens. */
function useWide(bp = 760): boolean {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth >= bp : true);
  useEffect(() => { const on = () => setW(window.innerWidth >= bp); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, [bp]);
  return w;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** ± stepper for one role count in the host's lobby composition panel. */
function RoleStepper({ emoji, label, value, min, max, onChange }: { emoji: string; label: string; value: number; min: number; max: number; onChange: (delta: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[12.5px] text-white/85">{emoji} {label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(-1)} disabled={value <= min} className="w-7 h-7 rounded-lg font-bold text-white disabled:opacity-25 leading-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>−</button>
        <span className="font-mono text-[15px] font-bold text-white w-5 text-center">{value}</span>
        <button onClick={() => onChange(1)} disabled={value >= max} className="w-7 h-7 rounded-lg font-bold text-white disabled:opacity-25 leading-none" style={{ background: `${RED}22`, border: `1px solid ${RED}44` }}>+</button>
      </div>
    </div>
  );
}


const PHASE_LABEL: Record<XmSafeState['phase'], string> = {
  lobby: 'მოლოდინი', assign: 'როლების დარიგება', mafia_meet: 'პირველი ღამე', night: 'ღამე', day_announce: 'დილა',
  speech: 'დღე — საუბრები', vote: 'კენჭისყრა', last_words: 'გამომშვიდობების სიტყვა', finished: 'დასასრული',
  // სპორტული მაფია
  plan_night: 'დაგეგმვის ღამე', tribunal_defense: 'ტრიბუნალი — თავის მართლება', tribunal_vote: 'ტრიბუნალის განაჩენი',
};

// ── Live <video> bound to a MediaStream (self is muted + mirrored) ─────────────
function VideoTile({ stream, mirror, muted }: { stream: MediaStream | null; mirror?: boolean; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; return () => { if (ref.current) ref.current.srcObject = null; }; }, [stream]);
  if (!stream) return null;
  return <video ref={ref} autoPlay playsInline muted={muted}
    className="absolute inset-0 w-full h-full object-cover" style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}

// ── One participant's webcam tile ──────────────────────────────────────────────
// MODULE-LEVEL & memoised so it never remounts on the parent's per-second re-render —
// that remount was what made the video flicker on/off. It re-renders only when its
// own props change; the <video> element keeps its stream unless the stream ref changes.
interface SeatTileProps {
  seat: XmSafeSeat | null; isHostTile?: boolean; fill?: boolean;
  match: XmSafeState; myId: string; stream: MediaStream | null; isSpeaking: boolean;
  foulMode: boolean; isHost: boolean; speechLeft: number; onFoul: (uid: string) => void; grabbing?: boolean;
  emblem?: number;
  /** Seconds left on the candidate currently up for a vote. */
  voteLeft: number;
}
const SeatTile = memo(function SeatTile({ seat, isHostTile, fill, match, myId, stream, isSpeaking, foulMode, isHost, speechLeft, onFoul, grabbing, emblem, voteLeft }: SeatTileProps) {
  const uid = isHostTile ? match.hostId : seat!.userId;
  const name = isHostTile ? match.hostName : seat!.nickname;
  const isMe = uid === myId;
  const turnSpeaking = !isHostTile && seat!.isSpeaking && match.phase === 'speech';
  const dead = !isHostTile && !seat!.alive;
  const mate = !isHostTile && match.mateIds.includes(uid);
  const rm = seat?.role ? XM_ROLE_META[seat.role] : null;
  const conn = isHostTile ? match.hostConnected : seat!.connected;
  // Your people are ringed — in your side's colour, so a convert's ring is the
  // cult's candlelight rather than the mafia's red.
  const mateColor = match.myCult ? CULT : '#ff6b6b';
  /*
   * The name the moderator is asking about RIGHT NOW.
   *
   * Every nominee wore the same "კენჭზე" chip, so the board could not say which
   * of three the table was being asked to raise hands for — the only place that
   * existed was one line in the middle of the stage card. With five seconds to
   * answer, "which one?" is not a question anybody should have to go looking
   * for.
   */
  const onFloor = !isHostTile && match.phase === 'vote' && match.voteCandidate?.userId === uid;
  const glow = turnSpeaking ? RED : onFloor ? '#ffcc33' : grabbing ? '#ffcc33' : isSpeaking ? '#39d98a' : mate ? mateColor : 'transparent';
  const canFoul = isHost && foulMode && !isHostTile && seat!.alive;
  const avatarColor = isHostTile ? RED : AV[((seat?.seat ?? 0)) % AV.length]!;

  return (
    <div className={`relative overflow-hidden select-none ${turnSpeaking ? 'xm-pulse' : onFloor ? 'xm-vote-pulse' : ''}`}
      style={{
        aspectRatio: fill ? undefined : '4/3', width: fill ? '100%' : undefined, height: fill ? '100%' : undefined,
        borderRadius: 14, background: '#0b0b12',
        border: `1.5px solid ${glow === 'transparent' ? 'rgba(255,255,255,0.09)' : glow}`,
        boxShadow: turnSpeaking || onFloor ? undefined : grabbing ? '0 0 18px #ffcc3388' : isSpeaking ? '0 0 15px #39d98a55' : '0 2px 10px rgba(0,0,0,0.4)',
        opacity: dead ? 0.55 : 1,
        cursor: canFoul ? 'pointer' : 'default',
        // pulse animation reads these CSS variables
        ['--xm-glow' as any]: `${RED}`,
      }}
      onClick={() => { if (canFoul) onFoul(seat!.userId); }}>
      <VideoTile stream={stream} mirror={isMe} muted={isMe} />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 34%, ${avatarColor}1f, #0a0810 72%)` }}>
          {dead ? (
            <span className="text-3xl" style={{ filter: 'grayscale(0.4) opacity(0.8)' }}>🕴️</span>
          ) : (
            <div className="rounded-full flex items-center justify-center font-display font-black text-white"
              style={{ width: '42%', aspectRatio: '1', fontSize: '1.5rem', background: `linear-gradient(155deg, ${avatarColor}, #16111f)`, border: '1px solid rgba(255,255,255,0.1)', boxShadow: 'inset 0 -6px 14px rgba(0,0,0,0.45), 0 3px 10px rgba(0,0,0,0.45)' }}>
              {/*
                An emblem, not an initial: at twelve seats two players share a
                letter as often as not, and an uppercased Georgian letter is a
                tofu box in most fonts. See SeatEmblem.
              */}
              {isHostTile
                ? <span style={{ fontSize: '1.4rem' }}>🎬</span>
                : <SeatEmblem seed={seat?.userId ?? name} index={emblem} size="66%" color="rgba(255,255,255,0.92)" />}
            </div>
          )}
        </div>
      )}
      {/* glassy top highlight */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 22%)', borderRadius: 14 }} />

      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-lg font-mono text-[10px] font-bold backdrop-blur-sm"
        style={{ background: isHostTile ? `${RED}e6` : 'rgba(0,0,0,0.55)', color: '#fff' }}>
        {isHostTile ? 'H · ჰოსტი' : `#${seat!.seat}`}
      </div>
      {turnSpeaking && (
        <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold"
          style={{ background: RED, color: '#fff', fontVariantNumeric: 'tabular-nums', boxShadow: `0 0 12px ${RED}` }}>{fmt(speechLeft)}</div>
      )}
      {onFloor && (
        <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-lg font-mono text-[11px] font-black"
          style={{ background: '#ffcc33', color: '#000', fontVariantNumeric: 'tabular-nums' }}>{Math.max(0, voteLeft)}</div>
      )}
      {grabbing && !turnSpeaking && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-lg font-mono text-[10px] font-bold" style={{ background: '#ffcc33', color: '#000' }}>🎙 ფოლი</div>
      )}
      {!isHostTile && seat!.isNominated && !turnSpeaking && !onFloor && match.phase !== 'finished' && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-lg font-mono text-[9px] font-bold" style={{ background: '#ffcc33', color: '#000' }}>კენჭზე</div>
      )}
      {!isHostTile && seat!.fouls > 0 && !dead && (
        <div className="absolute bottom-8 right-1.5 flex gap-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-2 h-2 rounded-full" style={{ background: i < seat!.fouls ? '#ffcc33' : 'rgba(255,255,255,0.16)', boxShadow: i < seat!.fouls ? '0 0 4px #ffcc33' : undefined }} />
          ))}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 pt-3 pb-1.5 flex items-center gap-1.5"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}>
        {!conn && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" style={{ boxShadow: '0 0 5px #ff0000' }} />}
        <span className="font-mono text-[11px] text-white truncate flex-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{name}{isMe && ' (შენ)'}</span>
        {rm && <span className="text-[12px] flex-shrink-0" title={rm.label}>{rm.emoji}</span>}
      </div>
      {dead && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(70,0,8,0.45)', borderRadius: 14 }}>
          {/*
            The cross.
            Across a twelve-tile table a small badge is something you have to
            read; a struck-through tile is something you see. Drawn as an SVG
            rather than rotated borders so it always meets the real corners.
          */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100">
            <line x1="2" y1="2" x2="98" y2="98" stroke={RED} strokeOpacity="0.5" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
            <line x1="98" y1="2" x2="2" y2="98" stroke={RED} strokeOpacity="0.5" strokeWidth="1.1" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px #ff0000)' }}>💀</span>
          <span className="font-mono text-[9px] font-black tracking-widest mt-1 px-2 py-0.5 rounded" style={{ color: '#fff', background: `${RED}cc` }}>
            {seat!.eliminatedBy === 'mafia' ? 'მოკლული' : seat!.eliminatedBy === 'fouls' ? '4 ფაული' : 'გარიცხული'}
          </span>
        </div>
      )}
      {/*
        The stamp.
        A vote in table mafia is a hand in the air — public, and seen at the
        moment it goes up. A tally somewhere else is not the same thing.
      */}
      {!isHostTile && seat!.hasVoted && !dead && (
        <motion.div
          initial={{ scale: 1.5, opacity: 0, rotate: -18 }}
          animate={{ scale: 1, opacity: 1, rotate: -12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div className="relative rounded-full"
            style={{
              width: '46%', aspectRatio: '1',
              border: `3px solid ${RED}`, background: 'rgba(0,0,0,0.35)',
              boxShadow: `0 0 18px ${RED}88, inset 0 0 18px ${RED}44`,
            }}>
            {/* SVG, not a glyph: the tick has to scale with the tile, and a
                font-size in rem does not — at twelve seats it came out a speck. */}
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
              <path d="M26 54 L43 71 L75 35" fill="none" stroke={RED} strokeWidth="11"
                strokeLinecap="round" strokeLinejoin="round" />
              <text x="50" y="26" textAnchor="middle" fill={RED}
                style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'monospace' }}>VOTED</text>
            </svg>
          </div>
        </motion.div>
      )}
      {canFoul && <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,204,51,0.16)', borderRadius: 14 }}><span className="font-display font-bold text-white text-sm px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.5)' }}>⚠️ ფაული</span></div>}
    </div>
  );
});

/**
 * "The host removed you."
 *
 * Mounted next to the game rather than inside it: being removed closes the
 * table, so a notice rendered within it would unmount in the same tick and the
 * player would be left staring at the lobby wondering what happened.
 */
export function SxvaMafiaKickedNotice() {
  const kicked = useSxvaMafiaStore(s => s.kicked);
  const clearKicked = useSxvaMafiaStore(s => s.clearKicked);
  if (!kicked) return null;
  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.72)', zIndex: 3020 }}>
      <div className="w-full max-w-xs rounded-3xl p-6 text-center"
        style={{ background: 'rgba(14,8,18,0.99)', border: `1px solid ${RED}44` }}>
        <p className="text-4xl mb-3">🚫</p>
        <p className="font-display font-bold text-white text-[15px]">ჰოსტმა გაგრიცხა თამაშიდან</p>
        <p className="font-mono text-[11px] text-white/45 mt-2">ამ ოთახში დაბრუნება ვეღარ მოხერხდება.</p>
        <button onClick={clearKicked}
          className="mt-5 w-full py-3 rounded-2xl font-display font-bold text-white text-[14px]"
          style={{ background: RED }}>
          გასაგებია
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function SxvaMafiaGame() {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const store = useSxvaMafiaStore();
  const { match, leaveMatch, error, clearError } = store;

  const [now, setNow] = useState(Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  /**
   * The room the table actually has.
   *
   * The ring used to be capped at `cols × 186px` — 744px on a 1440px screen,
   * with the rest of the width empty and the bottom row clipped by the host
   * bar. Measuring lets the grid take the space it has and, more importantly,
   * never take more.
   */
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      // Only on a real change: the grid is sized from this box, so writing the
      // same numbers back on every observation is a re-render for nothing.
      setStageBox(prev => (prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.visualViewport?.removeEventListener('resize', measure); };
  }, [match?.phase]);

  const [foulMode, setFoulMode] = useState(false);
  const [hostTarget, setHostTarget] = useState<string | null>(null);
  // Owner-only testing aids. The server enforces this; the flag only decides
  // whether the controls are worth drawing.
  const isOwner = profile?.moderatorLevel === 'owner';
  /** The current composition, so a stepper only has to say what it changes. */
  const roleCfg = {
    don: match?.setup.don ?? 0, mafia: match?.setup.mafia ?? 0, sheriff: match?.setup.sheriff ?? 0,
    doctor: match?.setup.doctor ?? 0, maniac: match?.setup.maniac ?? 0, cult: match?.setup.cult ?? 0,
  };
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [cinematic, setCinematic] = useState<{ type: 'night' | 'morning'; key: number } | null>(null);
  const prevPhase = useRef<string>('');
  const cameraInit = useRef(false);
  const cineKey = useRef(0);
  const wide = useWide(760);

  // Auto-dismiss the cinematic overlay shortly after it appears.
  useEffect(() => { if (!cinematic) return; const t = setTimeout(() => setCinematic(null), 1700); return () => clearTimeout(t); }, [cinematic]);

  /*
   * "You are in the cult now."
   *
   * The server holds a convert's membership back until the next night falls, so
   * the moment `myCult` turns true is the moment they are meant to find out —
   * and it has to land like something happened to them, not appear as a quiet
   * badge they might scroll past. It fires once per conversion: the flag only
   * flips false→true when the reveal happens, and it flips back if the leader
   * dies and the cult comes apart, so a second conversion would announce itself
   * again, correctly.
   *
   * The leader is excluded — they have known since they took the card.
   */
  const [cultReveal, setCultReveal] = useState(false);
  const prevMyCult = useRef(false);
  useEffect(() => {
    const now = Boolean(match?.myCult) && match?.myRole !== 'cult';
    if (now && !prevMyCult.current) { setCultReveal(true); SFX.voteStart?.(); haptic('heavy'); }
    prevMyCult.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.myCult, match?.myRole]);

  // LiveKit video room (one per match). Floor control: with it on, only the
  // player who currently "holds the floor" (active speaker / last-words / host)
  // may talk; everyone else is muted. Dead players & spectators always listen.
  const { enabled: lkEnabled } = useLiveKitGate();
  const floorControl = match?.settings.floorControl ?? true;
  const iHoldFloor = !!match && (
    match.amHost || match.phase === 'lobby' ||
    (match.phase === 'speech' && match.speakingUserId === myId) ||
    (match.phase === 'last_words' && match.lastWordsUserId === myId)
  );
  const amActiveTalker = !!match && (match.amHost || match.myAlive) && !match.amSpectator;
  // A player's 6-second "foul" temporarily lifts their floor-control mute.
  const iHaveFloor = !!match && match.floorGrabUserId === myId && match.floorGrabUntil > now;
  const listenOnly = !!match && (match.amSpectator || (!match.amHost && !match.myAlive) || (floorControl && !iHoldFloor && !iHaveFloor && !match.amHost));
  const voice = useLivekitRoomVoice({
    roomId: match?.id ? `sxvamafia_${match.id}` : null,
    identity: myId || null,
    active: lkEnabled && !!match && match.phase !== 'finished',
    listenOnly,
  });

  // Auto-open the mic the moment you gain the floor (start of your turn).
  const prevFloor = useRef(false);
  useEffect(() => {
    if (iHoldFloor && !prevFloor.current && !listenOnly && voice.connected && !match?.amHost) voice.setMic(true);
    prevFloor.current = iHoldFloor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iHoldFloor, listenOnly, voice.connected]);

  // Auto-open the mic when a 6-second "foul" interjection begins.
  const prevGrab = useRef(false);
  useEffect(() => {
    if (iHaveFloor && !prevGrab.current && voice.connected) voice.setMic(true);
    prevGrab.current = iHaveFloor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iHaveFloor, voice.connected]);

  // Turn the camera on once we're connected (video-first game).
  useEffect(() => {
    if (voice.connected && amActiveTalker && !cameraInit.current) { cameraInit.current = true; setLiveKitCamera(true).catch(() => {}); }
    if (!match) cameraInit.current = false;
  }, [voice.connected, amActiveTalker, match]);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 400); return () => clearInterval(iv); }, []);

  // SFX on phase changes
  useEffect(() => {
    if (!match) return;
    const p = match.phase;
    if (p !== prevPhase.current) {
      if (p === 'mafia_meet') { SFX.voteStart?.(); haptic('heavy'); }
      else if (p === 'night') { SFX.voteStart?.(); haptic('heavy'); setCinematic({ type: 'night', key: ++cineKey.current }); }
      else if (p === 'day_announce' && prevPhase.current === 'night') { setCinematic({ type: 'morning', key: ++cineKey.current }); }
      else if (p === 'speech') { SFX.gameStart?.(); haptic('tap'); }
      else if (p === 'vote') { SFX.voteStart?.(); haptic('selection'); }
      else if (p === 'finished') SFX.gameOver?.();
      setFoulMode(false);
      prevPhase.current = p;
    }
  }, [match?.phase]);

  /*
   * The table bell.
   *
   * A moderator watching twelve tiles does not also watch a clock, and a
   * speaker who has run over does not know it. So the clock says so out loud,
   * once, the moment it reaches zero — and again, quieter, when the floor
   * actually moves.
   *
   * Rung per speaker rather than per tick: `now` advances every 400 ms, and
   * without the guard the bell would ring on every one of them for as long as
   * the state took to come back.
   */
  const bell = useRef<BellMemory>(NO_BELL);
  useEffect(() => {
    const r = nextBell(bell.current, {
      phase: match?.phase ?? '', speaker: match?.speakingUserId ?? null,
      endsAt: match?.speechEndsAt ?? 0, now,
    });
    bell.current = r.mem;
    if (r.play === 'timeUp') { SFX.speechTimeUp?.(); haptic('tap'); }
    else if (r.play === 'next') SFX.speechNext?.();
  }, [match?.phase, match?.speakingUserId, match?.speechEndsAt, now]);

  if (!match) return null;

  const isHost = match.amHost;
  const intro = match.phase === 'speech' && match.introRound;
  const phaseTitle = intro ? 'გაცნობის წრე' : PHASE_LABEL[match.phase];
  const speechLeft = match.speechEndsAt ? Math.round((match.speechEndsAt - now) / 1000) : 0;
  const nightLeft = match.nightEndsAt ? Math.round((match.nightEndsAt - now) / 1000) : 0;
  const voteLeft = match.voteEndsAt ? Math.round((match.voteEndsAt - now) / 1000) : 0;
  const lwLeft = match.lastWordsEndsAt ? Math.round((match.lastWordsEndsAt - now) / 1000) : 0;

  const remoteVideo = getLiveKitRemoteVideo();
  const localVideo = getLiveKitLocalVideo();
  const speaking = getLiveKitSpeaking();
  const streamFor = (uid: string): MediaStream | null => uid === myId ? localVideo : (remoteVideo.get(uid) ?? null);

  const doLeave = () => { SFX.click?.(); voice.leave(); leaveMatch(); };

  const aliveSeats = match.seats.filter(s => s.alive);
  const nightRole = match.myRole;
  /** Converted, and told. The leader has their own role for that. */
  const iAmCult = match.myCult && match.myRole !== 'cult';
  const canActNight = match.phase === 'night' && match.myAlive && !match.amSpectator;

  // Stable tile factory — passes per-tile props to the module-level SeatTile so
  // it never remounts (which was the source of the video flicker).
  /*
   * Tapping a seat in foul mode opens the moderator's sheet rather than
   * stamping a foul straight away.
   *
   * A foul is a ruling, not a reflex: it decides whether somebody is out of the
   * round at four, and the old one-tap version had no way back from a misplaced
   * tap on a video tile. One extra tap buys an undo and an explicit removal.
   */
  const onFoul = (uid: string) => { SFX.click?.(); haptic('selection'); setHostTarget(uid); };
  /* One mark per seat at this table — see assignEmblems. */
  const emblems = useMemo(
    () => assignEmblems((match?.seats ?? []).map(s => s.userId)),
    [match?.seats.map(s => s.userId).join(',')],
  );

  const renderSeat = (seat: XmSafeSeat | null, extra: { isHostTile?: boolean; fill?: boolean } = {}) => {
    const uid = extra.isHostTile ? match!.hostId : seat!.userId;
    const grabbing = !extra.isHostTile && match!.floorGrabUserId === uid && match!.floorGrabUntil > now;
    return <SeatTile key={extra.isHostTile ? 'host' : seat!.userId} seat={seat} match={match!} myId={myId}
      stream={streamFor(uid)} isSpeaking={speaking.has(uid)} grabbing={grabbing} foulMode={foulMode} isHost={isHost} speechLeft={speechLeft} voteLeft={voteLeft} onFoul={onFoul} emblem={emblems.get(uid)} {...extra} />;
  };

  // ── target chips for actions (mini-avatar pills) ────────────────────────────
  const Chips = ({ seats, onPick, active, accent = RED }: { seats: XmSafeSeat[]; onPick: (uid: string) => void; active?: string | null; accent?: string }) => (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {seats.map(s => {
        const c = AV[s.seat % AV.length]!;
        const on = active === s.userId;
        return (
          <button key={s.userId} onClick={() => { SFX.click?.(); haptic('selection'); onPick(s.userId); }}
            className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full font-mono text-[12px] transition-all active:scale-95"
            style={{ background: on ? `${accent}2a` : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? accent : 'rgba(255,255,255,0.14)'}`, color: '#fff' }}>
            <span className="rounded-full flex items-center justify-center font-black text-white flex-shrink-0" style={{ width: 20, height: 20, fontSize: 10, background: `linear-gradient(150deg, ${c}, #16111f)` }}>{(s.nickname || '?').trim().charAt(0).toUpperCase()}</span>
            <span className="truncate" style={{ maxWidth: 120 }}>#{s.seat} {s.nickname}</span>
          </button>
        );
      })}
    </div>
  );

  // ── host control bar ────────────────────────────────────────────────────────
  const HostBar = () => {
    const btn = (label: string, on: () => void, primary = false) => (
      <button onClick={() => { SFX.click?.(); on(); }}
        className="px-3 py-2 rounded-xl font-display font-bold text-[13px] whitespace-nowrap"
        style={{ background: primary ? `linear-gradient(135deg, ${RED}, #b81020)` : 'rgba(255,255,255,0.06)', color: '#fff', border: primary ? 'none' : '1px solid rgba(255,255,255,0.14)' }}>{label}</button>
    );
    return (
      /*
        Wrap, do not scroll.
        A horizontal scroller quietly cuts the last button in half and there is
        nothing on screen that says it can be scrolled — "პირველი ღამე" was
        arriving with its second word missing.
      */
      <div className="flex flex-wrap items-center justify-center gap-2 pb-1">
        {match.phase === 'lobby' && btn(match.seats.length < 4 ? `საჭიროა ${4 - match.seats.length} მოთ.` : '🎬 დაწყება', () => store.start(), true)}
        {/*
          Testing aids, owner only. A game that needs four players cannot be
          tested by one, and bots take cards, act at night and vote on their
          own so the whole loop can be watched by the host alone.
        */}
        {isOwner && match.phase === 'lobby' && (
          <>
            <button onClick={() => { SFX.click?.(); store.addBot(); }}
              disabled={match.seats.length >= match.maxSeats}
              className="px-3 py-2 rounded-xl font-mono text-[12px] whitespace-nowrap disabled:opacity-35"
              style={{ background: 'rgba(168,85,247,0.16)', border: '1px solid rgba(168,85,247,0.45)', color: '#c4a2ff' }}>
              🤖 ბოტი
            </button>
            {match.seats.some(s => s.userId.startsWith('bot_')) && (
              <button onClick={() => { SFX.click?.(); store.clearBots(); }}
                className="px-3 py-2 rounded-xl font-mono text-[12px] whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }}>
                ბოტების მოცილება
              </button>
            )}
          </>
        )}
        {match.phase === 'assign' && (() => {
          const all = match.cards.length > 0 && match.cards.every(c => c.claimedById);
          return <>{btn('🔀 თავიდან დარიგება', () => store.reshuffle())}
            <button onClick={() => { SFX.click?.(); if (all) store.beginMeet(); }} disabled={!all}
              className="px-3 py-2 rounded-xl font-display font-bold text-[13px] whitespace-nowrap disabled:opacity-40"
              style={{ background: all ? `linear-gradient(135deg, ${RED}, #b81020)` : 'rgba(255,255,255,0.06)', color: '#fff', border: all ? 'none' : '1px solid rgba(255,255,255,0.14)' }}>
              {all ? '🌙 პირველი ღამე' : `ირჩევენ (${match.cards.filter(c => c.claimedById).length}/${match.cards.length})`}
            </button></>;
        })()}
        {match.phase === 'mafia_meet' && btn('🔫 ღამის მოქმედება', () => store.endMeet(), true)}
        {match.phase === 'night' && btn('☀️ ღამის დასრულება', () => store.endNight(), true)}
        {match.phase === 'day_announce' && (match.announce ? btn('🗣 საუბრების დაწყება', () => store.beginDay(), true) : btn('🌙 ღამე', () => store.beginNight(), true))}
        {match.phase === 'speech' && <>{btn('⏭ შემდეგი', () => store.nextSpeaker(), true)}{btn('+30წ', () => store.extendSpeech(30))}</>}
        {/*
          The moderator's control of the vote: next name, or stop and count.
          On the last candidate "next" is what closes it, and everyone still
          silent is counted for that name — so the button says so.
        */}
        {match.phase === 'vote' && match.voteCandidate && btn(
          match.voteIsLast ? '⚖️ დათვლა (ავტო-ხმა)' : `➡️ შემდეგი (${match.voteIdx + 1}/${match.voteTotal})`,
          () => store.nextCandidate(),
          true,
        )}
        {match.phase === 'vote' && btn('✅ ხმების დათვლა', () => store.endVote())}
        {match.phase === 'last_words' && btn('➡️ გაგრძელება', () => store.endLastWords(), true)}

        {/* ── სპორტული მაფია ─────────────────────────────────────────────── */}
        {match.phase === 'plan_night' && btn('🌅 დაგეგმვა დასრულდა — დღე', () => store.endPlanNight(), true)}
        {match.phase === 'tribunal_defense' && match.tribunal && btn(
          match.tribunal.defenseIdx < match.tribunal.onTrial.length - 1
            ? `➡️ შემდეგი (${match.tribunal.defenseIdx + 1}/${match.tribunal.onTrial.length})`
            : '⚖️ განაჩენზე გადასვლა',
          () => store.nextDefense(),
          true,
        )}
        {match.phase === 'tribunal_vote' && btn('⚖️ განაჩენის დათვლა', () => store.endTribunal(), true)}
        {/* Ending a game and closing the room both live behind ✕ — they are
            ways out, not phase controls, and the bar is for running the game. */}
        {(match.phase === 'speech' || match.phase === 'night' || match.phase === 'day_announce') &&
          <button onClick={() => { SFX.click?.(); setFoulMode(f => !f); }} className="px-3 py-2 rounded-xl font-display font-bold text-[13px] whitespace-nowrap"
            style={{ background: foulMode ? '#ffcc33' : 'rgba(255,255,255,0.06)', color: foulMode ? '#000' : '#fff', border: '1px solid rgba(255,255,255,0.14)' }}>⚠️ ფაული {foulMode ? 'ჩართ.' : ''}</button>}
        {match.phase === 'finished' && !match.dissolved && btn('🔄 ხელახლა', () => store.rematch(), true)}
      </div>
    );
  };

  // ── player action panel ──────────────────────────────────────────────────────
  const PlayerPanel = () => {
    if (match.amSpectator) return <p className="text-center font-mono text-[12px] text-white/40">👁 შენ მაყურებელი ხარ</p>;
    if (!match.myAlive) return <p className="text-center font-mono text-[12px] text-white/40">💀 შენ თამაშიდან გახვედი — უყურე დანარჩენებს</p>;

    if (match.phase === 'night' && canActNight) {
      /*
       * What the team has pressed, and whether it agrees.
       *
       * The agreement line is the rule, shown: the shot only lands if every
       * living member names the same person, and a team that cannot see they
       * have split would keep missing without ever knowing why.
       */
      const split = match.mafiaPicks.length > 1
        && new Set(match.mafiaPicks.map(p => p.targetId)).size > 1;
      const consensus = match.mafiaPicks.length > 0 ? (
        <div className="mt-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,59,71,0.08)', border: '1px solid rgba(255,59,71,0.22)' }}>
          <p className="font-mono text-[10px] text-white/45 mb-0.5">🔫 გუნდის არჩევანი:</p>
          {match.mafiaPicks.map(p => <p key={p.userId} className="font-mono text-[11px]" style={{ color: '#ff8a92' }}>{p.nickname} → {p.targetName}</p>)}
          {split && (
            <p className="font-mono text-[10.5px] mt-1" style={{ color: '#ffcc33' }}>
              ⚠️ სხვადასხვა სამიზნეა — თუ არ შეთანხმდებით, გასროლა ააცდენს
            </p>
          )}
        </div>
      ) : null;
      /* A converted sheriff or doctor keeps their night action — the reminder
         of whose side it now serves rides along under it. */
      const cultNote = iAmCult ? (
        <p className="text-center font-mono text-[11px] mt-2 px-2 py-1 rounded-lg"
          style={{ color: CULT, background: `${CULT}14`, border: `1px solid ${CULT}44` }}>🕯 შენ კულტში ხარ</p>
      ) : null;
      if (nightRole === 'doctor') {
        const meta = XM_ROLE_META.doctor;
        return (<div>
          <p className="text-center font-mono text-[11px] mb-2" style={{ color: meta.color }}>💉 ვის გადაარჩენ ამაღამ?</p>
          {/* Last night's patient is off the list — the rule, shown rather than
              explained after the fact by a refusal. */}
          <Chips seats={aliveSeats.filter(s => s.userId !== match.healBlockedId)} onPick={store.doctorHeal} />
          {match.healBlockedId && (
            <p className="text-center font-mono text-[10px] mt-1.5 text-white/35">
              ერთი და იმავე ადამიანს ზედიზედ ორჯერ ვერ გადაარჩენ
            </p>
          )}
          {cultNote}
        </div>);
      }
      if (nightRole === 'maniac') {
        const meta = XM_ROLE_META.maniac;
        return (<div>
          <p className="text-center font-mono text-[11px] mb-2" style={{ color: meta.color }}>🔪 აირჩიე მსხვერპლი — მარტო ხარ</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.maniacKill} />
        </div>);
      }
      if (nightRole === 'cult') {
        const meta = XM_ROLE_META.cult;
        return (<div>
          <p className="text-center font-mono text-[11px] mb-2" style={{ color: meta.color }}>🕯 ვის მოიმხრობ?</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId && !s.cult)} onPick={store.cultConvert} />
          <p className="text-center font-mono text-[10px] mt-1.5 text-white/35">
            მაფია და მანიაკი არ მოიმხრობა — გაიგებ დილით
          </p>
          {match.nightPrivate && <p className="text-center font-mono text-[13px] mt-2 text-white">{match.nightPrivate}</p>}
        </div>);
      }
      if (nightRole === 'sheriff') {
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: '#4fb8ff' }}>🔎 შეამოწმე ერთი მოთამაშე (მაფიაა თუ არა)</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.sheriffCheck} />
          {match.nightPrivate && <p className="text-center font-mono text-[13px] mt-2 text-white">{match.nightPrivate}</p>}
          {cultNote}</div>);
      }
      if (nightRole === 'don') {
        /*
         * Check first, then shoot.
         *
         * Both at once meant the night could resolve the instant the check
         * landed, and the one piece of information the don gets all night went
         * past on its way to the morning. Now the answer is on screen while the
         * kill is still being chosen — which is also the order it is useful in.
         */
        // Tonight's check, not last night's — see iCheckedTonight.
        const checked = match.iCheckedTonight;
        return (<div className="space-y-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,204,51,0.07)', border: '1px solid rgba(255,204,51,0.28)' }}>
            <p className="text-center font-mono text-[11px] mb-2" style={{ color: '#ffcc33' }}>
              1️⃣ 🎩 ჯერ შეამოწმე — შერიფია თუ არა
            </p>
            {checked ? (
              <p className="text-center font-display font-bold text-[15px] text-white">{match.nightPrivate}</p>
            ) : (
              <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.donCheck} />
            )}
          </div>

          <div className="rounded-xl px-3 py-2.5" style={{ background: checked ? `${RED}0f` : 'rgba(255,255,255,0.02)', border: `1px solid ${checked ? RED + '44' : 'rgba(255,255,255,0.08)'}`, opacity: checked ? 1 : 0.45 }}>
            <p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>2️⃣ 🔫 მაფიის მსხვერპლი</p>
            {checked
              ? <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
              : <p className="text-center font-mono text-[11px] text-white/40">ჯერ შემოწმება</p>}
            {checked && consensus}
          </div>
        </div>);
      }
      if (nightRole === 'mafia') {
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>🔫 აირჩიე მსხვერპლი (მაფიასთან ერთად)</p>
          <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
          {consensus}
          {match.iActedTonight && <p className="text-center font-mono text-[11px] mt-2 text-white/50">✅ არჩევანი გააკეთე</p>}</div>);
      }
      return (<div>
        <p className="text-center font-mono text-[12px] text-white/40 animate-pulse">🌙 ღამეა — თვალები დახუჭე</p>
        {iAmCult && <p className="text-center font-mono text-[11px] mt-2" style={{ color: CULT }}>🕯 შენ კულტში ხარ</p>}
      </div>);
    }

    if (match.phase === 'speech') {
      const myTurn = match.speakingUserId === myId;
      if (myTurn) {
        if (intro) return <p className="text-center font-mono text-[12px]" style={{ color: RED }}>🤝 შენი გაცნობის წუთი ({fmt(speechLeft)}) — წარადგინე თავი</p>;
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>🗣 შენი წუთია ({fmt(speechLeft)}) — დაასახელე კენჭისყრაზე (არჩევითი)</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.nominate} />
          {match.iNominated && <p className="text-center font-mono text-[11px] mt-2 text-white/50">დაასახელე ✓</p>}</div>);
      }
      const spk = match.seats.find(s => s.userId === match.speakingUserId);
      return <p className="text-center font-mono text-[12px] text-white/50">{intro ? '🤝 გაცნობა' : '🗣 საუბრობს'} #{spk?.seat} {spk?.nickname} — {fmt(speechLeft)}</p>;
    }

    if (match.phase === 'vote') {
      const total = Math.max(1, Object.values(match.voteTally).reduce((a, b) => a + b, 0));
      return (<div>
        <div className="flex items-center justify-center gap-2 mb-2">
          <p className="font-display font-bold text-[12px]" style={{ color: '#ffcc33' }}>{match.voteRevote ? '🔁 ხელახალი კენჭისყრა' : '⚖️ ვის გავრიცხავთ?'}</p>
          <span className="font-mono font-bold text-[13px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,204,51,0.15)', color: '#ffcc33', fontVariantNumeric: 'tabular-nums' }}>{secs(voteLeft)}</span>
        </div>

        {/*
          One candidate at a time, the way a moderator runs it out loud.
          The button says whose name is on the floor, because a vote you cast
          without being sure who it was for is a vote you will regret.
        */}
        {match.voteCandidate ? (
          <div className="max-w-sm mx-auto">
            <p className="text-center font-mono text-[11px] text-white/45 mb-1.5">
              კანდიდატი {match.voteIdx + 1}/{match.voteTotal}
              {match.voteIsLast && ' · ბოლო — ვინც არ მისცემს, ავტომატურად ჩაეთვლება'}
            </p>

            <button
              onClick={() => { SFX.click?.(); haptic('selection'); store.castVote(match.voteCandidate!.userId); }}
              disabled={!!match.myVote || !match.myAlive || match.voteCandidate.userId === match.myUserId}
              className="w-full rounded-2xl px-3 py-4 font-display font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-45"
              style={{
                background: match.myVote === match.voteCandidate.userId ? RED : 'rgba(255,255,255,0.06)',
                border: `1.5px solid ${match.myVote === match.voteCandidate.userId ? RED : 'rgba(255,255,255,0.18)'}`,
                color: '#fff',
              }}
            >
              {match.myVote === match.voteCandidate.userId
                ? `✓ ხმა მიცემულია — #${match.voteCandidate.seat}`
                : match.myVote
                  ? 'შენ უკვე მიეცი ხმა'
                  : match.voteCandidate.userId === match.myUserId
                    ? 'შენს კანდიდატურაზეა კენჭისყრა'
                    : `✋ ხმას ვაძლევ #${match.voteCandidate.seat} ${match.voteCandidate.nickname}`}
            </button>

            <p className="text-center font-mono text-[11px] text-white/35 mt-2">
              ხმა მისცა: {match.seats.filter(x => x.hasVoted).length}/{match.seats.filter(x => x.alive).length}
            </p>
          </div>
        ) : (
          <p className="text-center font-mono text-[12px] text-white/40">კანდიდატები არ არიან</p>
        )}
      </div>);
    }

    /*
      სპორტული მაფია — the planning night.

      The mafia see each other and agree an order; everyone else waits. This is
      the only coordination the team gets all game, which is worth saying on the
      screen rather than assuming they have read the rules.
    */
    if (match.phase === 'plan_night') {
      if (amMafia) {
        return (<div>
          <p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>
            🌑 დაგეგმვის ღამე — შეათანხმეთ თანმიმდევრობა
          </p>
          <p className="text-center font-mono text-[10.5px] leading-relaxed text-white/45">
            ამ ღამეს არავინ კვდება. შემდეგი ღამიდან <b style={{ color: '#ffcc33' }}>ერთმანეთის არჩევანს ვერ ნახავთ</b> —
            ქილი მხოლოდ მაშინ შედგება, თუ სამივე ერთსა და იმავე მოთამაშეს დააჭერს.
          </p>
          {match.mateIds.length > 0 && (
            <p className="text-center font-mono text-[12px] mt-2.5" style={{ color: '#ff8a92' }}>
              შენი გუნდი: {match.seats.filter(x => match.mateIds.includes(x.userId)).map(x => `#${x.seat} ${x.nickname}`).join(', ')}
            </p>
          )}
        </div>);
      }
      return <p className="text-center font-mono text-[12px] text-white/40 animate-pulse">🌑 დაგეგმვის ღამე — თვალები დახუჭე</p>;
    }

    /* სპორტული მაფია — a tied vote goes to trial. */
    if (match.phase === 'tribunal_defense' && match.tribunal) {
      const t = match.tribunal;
      const speaking = t.onTrial[t.defenseIdx];
      const isMe = speaking?.userId === myId;
      return (<div>
        <p className="text-center font-display font-bold text-[13px] mb-1" style={{ color: '#ffcc33' }}>⚖️ ტრიბუნალი</p>
        <p className="text-center font-mono text-[12px]" style={{ color: isMe ? RED : 'rgba(255,255,255,0.6)' }}>
          {isMe
            ? `🎤 შენი თავის მართლება (${fmt(Math.round((t.defenseEndsAt - now) / 1000))})`
            : `🎤 თავს იმართლებს #${speaking?.seat} ${speaking?.nickname}`}
        </p>
        <p className="text-center font-mono text-[10.5px] text-white/35 mt-1.5">
          {t.defenseIdx + 1}/{t.onTrial.length} · შემდეგ ქალაქი გადაწყვეტს
        </p>
      </div>);
    }

    /*
      The verdict.

      Both, or neither — the vote already failed to separate them, so asking
      "which one" again would be asking the room to change its mind with no new
      information. The accused do not get a button: their fate is the question.
    */
    if (match.phase === 'tribunal_vote' && match.tribunal) {
      const t = match.tribunal;
      const names = t.onTrial.map(x => `#${x.seat} ${x.nickname}`).join(' და ');
      if (t.iAmOnTrial) {
        return (<div>
          <p className="text-center font-display font-bold text-[13px]" style={{ color: '#ffcc33' }}>⚖️ ქალაქი წყვეტს</p>
          <p className="text-center font-mono text-[11px] text-white/45 mt-1.5">
            შენს ბედზე სხვები ხმას აძლევენ — შენ ვერ მონაწილეობ
          </p>
          <p className="text-center font-mono text-[10.5px] text-white/30 mt-2">
            {t.votesCast}/{t.votesTotal} უკვე გადაწყვიტა
          </p>
        </div>);
      }
      if (!t.canVote) {
        return <p className="text-center font-mono text-[12px] text-white/40">⚖️ ტრიბუნალი — {names}</p>;
      }
      const choice = (verdict: 'punish' | 'free', label: string, color: string) => (
        <button
          onClick={() => { SFX.click?.(); haptic('selection'); store.tribunalVote(verdict); }}
          disabled={t.myVerdict !== null}
          className="flex-1 rounded-2xl px-3 py-3.5 font-display font-bold text-[14px] transition-all active:scale-[0.98] disabled:opacity-45"
          style={{
            background: t.myVerdict === verdict ? color : 'rgba(255,255,255,0.06)',
            border: `1.5px solid ${t.myVerdict === verdict ? color : 'rgba(255,255,255,0.18)'}`,
            color: '#fff',
          }}>
          {label}
        </button>
      );
      return (<div className="max-w-sm mx-auto">
        <p className="text-center font-display font-bold text-[13px]" style={{ color: '#ffcc33' }}>⚖️ ორივე დავსაჯოთ?</p>
        <p className="text-center font-mono text-[11px] text-white/50 mt-1 mb-3">{names}</p>
        <div className="flex gap-2">
          {choice('punish', '⚔️ დასჯა', RED)}
          {choice('free', '🕊 გათავისუფლება', '#39d98a')}
        </div>
        <p className="text-center font-mono text-[10.5px] text-white/30 mt-2.5">
          {t.myVerdict ? 'ხმა მიცემულია · ' : ''}{t.votesCast}/{t.votesTotal}
        </p>
      </div>);
    }

    if (match.phase === 'last_words') {
      const isMe = match.lastWordsUserId === myId;
      return <p className="text-center font-mono text-[12px]" style={{ color: isMe ? RED : 'rgba(255,255,255,0.5)' }}>
        {isMe ? `🎤 შენი გამომშვიდობების სიტყვა (${fmt(lwLeft)})` : `🎤 ${match.lastWordsName} გამოსამშვიდობებელ სიტყვას ამბობს`}</p>;
    }

    if (match.phase === 'assign') return <p className="text-center font-mono text-[12px] text-white/50 animate-pulse">როლი მიიღე — შეამოწმე ქვემოთ 👇</p>;
    return null;
  };

  // stage / phase hero text
  const stageSub = (() => {
    if (match.phase === 'speech') { const s = match.seats.find(x => x.userId === match.speakingUserId); return s ? `#${s.seat} ${s.nickname} ${intro ? 'წარადგენს თავს' : 'საუბრობს'} · ${fmt(speechLeft)}` : ''; }
    if (match.phase === 'vote') return `კენჭისყრა · ${secs(voteLeft)}წმ`;
    if (match.phase === 'last_words') return `${match.lastWordsName ?? ''} · ${fmt(lwLeft)}`;
    if (match.phase === 'day_announce') {
      if (!match.announce) return 'დღე დასრულდა — ღამდება';
      const killed = match.announce.killed;
      // A list, because with a maniac at the table two people can die in one night.
      return killed.length
        ? `ღამით მოკლეს: ${killed.map(k => `#${k.seat} ${k.nickname}`).join(', ')}`
        : 'ღამე მშვიდად ჩაიარა';
    }
    if (match.phase === 'night') return 'ქალაქს სძინავს…';
    if (match.phase === 'assign') return 'როლები დარიგდა';
    return '';
  })();

  // ── Centre-stage ring layout ───────────────────────────────────────────────
  const inPlay = match.phase !== 'lobby' && match.phase !== 'finished';
  /*
   * The ring runs on a phone too now.
   *
   * It used to be gated on screen width, so a phone got a flat two-column grid
   * with the host squeezed into a thumbnail underneath — which loses the one
   * thing the layout is for: the moderator sits at the head of the table and
   * everybody else is arranged around them. That reads better on a small screen
   * than on a large one, because there is less room to spare.
   *
   * The eight-seat floor stays, and it is geometry rather than taste: the stage
   * takes what the two side columns leave, so a board under three tiles wide has
   * no middle. See MIN_ACROSS in ringShape.
   */
  const useRing = inPlay && match.phase !== 'mafia_meet' && match.seats.length >= 8;
  const amMafia = match.myRole === 'mafia' || match.myRole === 'don';
  const mafiaTeam = match.seats.filter(s => s.role === 'mafia' || s.role === 'don');

  /*
   * The shape of the room, and from it the shape of a seat.
   *
   * A laptop stage is about 2:1 and a webcam is 16:9, so tiles are landscape.
   * A phone is the other way round, and four landscape tiles across 340 points
   * come out 79 by 44 — a slit. Portrait tiles on a portrait screen are 81 by
   * 107, which is a face.
   *
   * Measured rather than assumed from a breakpoint, because the thing that
   * decides this is the box the ring actually got, not the width of the window
   * around it. Until the first measurement lands the window's own orientation
   * is a good enough stand-in — it gets the portrait/landscape call right, which
   * is all that is needed to avoid a visible reflow.
   */
  const boxAspect = stageBox.w > 0 && stageBox.h > 0
    ? stageBox.w / stageBox.h
    : (typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 2);
  const portraitStage = boxAspect < 1;
  const TILE_ASPECT = portraitStage ? 3 / 4 : 16 / 9;
  const ring = ringShape(match.seats.length, { boxAspect, tileAspect: TILE_ASPECT });

  /*
   * The board's measurements, worked out once.
   *
   * Hoisted out of the render branch because they are not only a layout: how
   * wide a tile is decides which simulcast layer to ask each publisher for, and
   * that has to be readable from an effect. See the subscription effect below.
   */
  const RING_GAP = portraitStage ? 6 : 10;
  const ringAcross = Math.max(ring.top, ring.bottom);
  const ringTile = fitTile({
    availW: Math.max(280, stageBox.w), availH: Math.max(280, stageBox.h),
    cols: ringAcross, rows: ring.side + 2, gap: RING_GAP,
    mode: portraitStage ? 'fill' : 'webcam',
  });
  /** What the stage between the two side columns is left with. */
  const ringStageW = Math.max(0, ringTile.w * (ringAcross - 2) + RING_GAP * (ringAcross - 3));

  const seatIdsKey = match.seats.map(s => s.userId).join(',');

  const stageIcon = intro ? '🤝' : match.phase === 'night' ? '🌙' : match.phase === 'vote' ? '⚖️'
    : match.phase === 'last_words' ? '🎤' : match.phase === 'day_announce' ? ((match.announce?.killed.length ?? 0) > 0 ? '💀' : '🌅')
    : match.phase === 'speech' ? '🗣️' : '🎭';
  const stageBig = match.phase === 'speech' ? fmt(speechLeft) : match.phase === 'vote' ? secs(voteLeft) : match.phase === 'last_words' ? fmt(lwLeft) : '';
  const nightMood = match.phase === 'night';

  /**
   * The centre of the table.
   *
   * On a wide screen the host's camera fills it, the way a moderator sits at
   * the head of a real table — the phase, the clock and who is speaking sit on
   * top of the picture rather than instead of it. Without a camera it falls
   * back to the phase icon, so a text-only server still reads.
   */
  const StageCard = (
    <div className="relative w-full h-full rounded-2xl overflow-hidden flex flex-col"
      style={{ background: nightMood ? 'linear-gradient(160deg,#0a1030,#05060f)' : 'linear-gradient(160deg,#25080e,#0a0609)', border: `1.5px solid ${nightMood ? '#3a4a8a66' : RED + '44'}`, boxShadow: 'inset 0 0 44px rgba(0,0,0,0.55)' }}>

      {/* The host, as big as the stage allows. */}
      {streamFor(match.hostId) ? (
        <div className="absolute inset-0">
          <VideoTile stream={streamFor(match.hostId)} mirror={match.hostId === myId} muted={match.hostId === myId} />
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 34%, rgba(0,0,0,0.15) 62%, rgba(0,0,0,0.82) 100%)' }} />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* A watermark, not a subject: the clock is drawn over this. */}
          <motion.span key={match.phase + stageIcon} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.1 }}
            style={{ fontSize: portraitStage ? 64 : 132, filter: 'grayscale(1)' }}>{stageIcon}</motion.span>
        </div>
      )}

      {/* Phase, on top of the picture. On a phone the stage is about 170 points
          across, so the same type set for a laptop wraps to three lines and
          buries the host. */}
      <div className={`relative text-center px-1.5 ${portraitStage ? 'pt-1.5' : 'pt-2.5 px-3'}`}>
        <p className="font-mono tracking-[0.25em] text-white/45" style={{ fontSize: portraitStage ? 8.5 : 10 }}>რაუნდი {match.round}</p>
        <p className="font-display font-black text-white mt-0.5 leading-tight" style={{ fontSize: portraitStage ? 13 : 19, textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>{phaseTitle}</p>

        {match.phase === 'vote' && match.voteCandidate && (
          <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
            <span className="font-mono px-2 py-0.5 rounded-full max-w-full truncate"
              style={{ fontSize: portraitStage ? 10 : 12, background: `${RED}22`, border: `1px solid ${RED}88`, color: '#fff' }}>
              #{match.voteCandidate.seat} {match.voteCandidate.nickname}
            </span>
            <span className="font-mono px-2 py-0.5 rounded-full"
              style={{ fontSize: portraitStage ? 9 : 11, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }}>
              {match.voteIdx + 1}/{match.voteTotal}{match.voteIsLast ? ' · ავტო-ხმა' : ''}
            </span>
          </div>
        )}

        {(match.phase === 'speech' || match.nextSpeaker) && (
          <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
            {match.speakingUserId && (() => {
              const sp = match.seats.find(x => x.userId === match.speakingUserId);
              return sp ? (
                <span className="font-mono px-2 py-0.5 rounded-full"
                  style={{ fontSize: portraitStage ? 9.5 : 11, background: 'rgba(0,229,255,0.14)', border: '1px solid rgba(0,229,255,0.45)', color: '#7fe6ff' }}>
                  საუბრობს #{sp.seat}
                </span>
              ) : null;
            })()}
            {match.nextSpeaker && (
              <span className="font-mono px-2 py-0.5 rounded-full"
                style={{ fontSize: portraitStage ? 9.5 : 11, background: 'rgba(255,204,51,0.12)', border: '1px solid rgba(255,204,51,0.4)', color: '#ffcc33' }}>
                შემდეგი #{match.nextSpeaker.seat}
              </span>
            )}
          </div>
        )}
      </div>

      {/* The clock, when one is running. */}
      <div className="relative flex-1 flex flex-col items-center justify-center pointer-events-none">
        {stageBig && (
          <span className="font-mono font-black" style={{ fontSize: portraitStage ? 27 : 40, color: RED, fontVariantNumeric: 'tabular-nums', lineHeight: 1, textShadow: '0 2px 14px rgba(0,0,0,0.85)' }}>{stageBig}</span>
        )}
        {stageSub && !stageBig && (
          <p className="font-mono px-2 text-center leading-snug" style={{ fontSize: portraitStage ? 10 : 12, color: 'rgba(255,255,255,0.78)', textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>{stageSub}</p>
        )}
        {match.phase === 'vote' && match.nominations.length > 0 && (
          <p className="font-mono mt-1 px-1 text-center leading-snug" style={{ fontSize: portraitStage ? 10 : 12, color: '#ffcc33' }}>{match.nominations.map(n => `#${n.seat}:${match.voteTally[n.userId] ?? 0}`).join('  ')}</p>
        )}
      </div>

      {/* Who is running the table. */}
      <div className={`relative flex items-center gap-1.5 ${portraitStage ? 'px-1.5 pb-1.5' : 'px-3 pb-2.5'}`}>
        <span className="font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ fontSize: portraitStage ? 9 : 11, background: `${RED}e6`, color: '#fff' }}>H</span>
        <span className="font-mono truncate" style={{ fontSize: portraitStage ? 10 : 12, color: match.hostConnected ? '#fff' : '#ff6b6b', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
          {match.hostName}{!match.hostConnected && ' · გათიშ.'}
        </span>
        {foulMode && <span className="ml-auto font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#ffcc33', color: '#000' }}>⚠️ ფაული</span>}
      </div>
    </div>
  );

  return createPortal(
    <motion.div className="fixed inset-0 z-[560] flex flex-col select-none"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -5%, #2a0a10 0%, #08060a 60%)', fontFamily: 'Rajdhani, "Noto Sans Georgian", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      <style>{`
        @keyframes xmPulseKf { 0%,100% { box-shadow: 0 0 14px rgba(255,59,71,0.5); } 50% { box-shadow: 0 0 32px rgba(255,59,71,0.95); } }
        .xm-pulse { animation: xmPulseKf 1.35s ease-in-out infinite; }
        /* The candidate being asked about. Faster than the speaking pulse —
           there are five seconds to answer, not sixty. */
        @keyframes xmVotePulseKf { 0%,100% { box-shadow: 0 0 14px rgba(255,204,51,0.55); } 50% { box-shadow: 0 0 30px rgba(255,204,51,0.95); } }
        .xm-vote-pulse { animation: xmVotePulseKf 0.9s ease-in-out infinite; }
        @keyframes xmFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .xm-float { animation: xmFloat 3s ease-in-out infinite; }
        @keyframes xmTwinkle { 0%,100% { opacity: 0.15; } 50% { opacity: 0.95; } }
      `}</style>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2" style={{ borderBottom: `1px solid ${RED}22` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-black text-white leading-none" style={{ fontSize: 15 }}>მაფია ჰოსტით 🎬</p>
            <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ color: RED, letterSpacing: 2 }}>{match.code}</span>
              {match.phase !== 'lobby' && <> · რაუნდი {match.round} · {phaseTitle}</>}
              {match.spectatorCount > 0 && <> · 👁 {match.spectatorCount}</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {match.phase !== 'lobby' && (
              <button onClick={() => { SFX.click?.(); setJournalOpen(true); }} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }} title="ჟურნალი">📜</button>
            )}
            {!listenOnly && (
              <button onClick={() => { SFX.click?.(); voice.toggleMic(); }} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: voice.micEnabled ? `${RED}22` : 'rgba(255,255,255,0.06)', border: `1px solid ${voice.micEnabled ? RED : 'rgba(255,255,255,0.15)'}` }}>{voice.micEnabled ? '🎙' : '🔇'}</button>
            )}
            {amActiveTalker && (
              <button onClick={() => { SFX.click?.(); setLiveKitCamera(!voice.cameraOn).catch(() => {}); }} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: voice.cameraOn ? `${RED}22` : 'rgba(255,255,255,0.06)', border: `1px solid ${voice.cameraOn ? RED : 'rgba(255,255,255,0.15)'}` }}>{voice.cameraOn ? '📹' : '📷'}</button>
            )}
            {match.myRole && (
              /* A convert's badge sits on their own role button, tinted and with
                 the candle beside it — so the reveal card is not the only place
                 they can ever see it, and they can reopen the details there. */
              <button onClick={() => { SFX.click?.(); setRoleOpen(true); }} className="px-2 h-8 rounded-full flex items-center justify-center text-sm gap-0.5"
                style={{
                  background: iAmCult ? `${CULT}22` : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${iAmCult ? CULT : 'rgba(255,255,255,0.15)'}`,
                }}>
                {XM_ROLE_META[match.myRole].emoji}{iAmCult && <span className="text-[11px]">🕯</span>}
              </button>
            )}
            <button onClick={() => setConfirmLeave(true)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
          </div>
        </div>
      </div>

      {/* Compact stage banner — only when NOT using the centre-stage ring */}
      {!useRing && match.phase !== 'lobby' && match.phase !== 'finished' && match.phase !== 'mafia_meet' && match.phase !== 'assign' && (
        <div className="flex-shrink-0 px-4 py-2 text-center" style={{ background: match.phase === 'night' ? 'rgba(10,10,40,0.5)' : 'rgba(255,59,71,0.06)' }}>
          <p className="font-display font-bold text-white" style={{ fontSize: 15 }}>{stageIcon} {phaseTitle}</p>
          {stageSub && <p className="font-mono text-[12px] mt-0.5" style={{ color: match.phase === 'speech' || match.phase === 'last_words' ? RED : 'rgba(255,255,255,0.6)' }}>{stageSub}</p>}
        </div>
      )}

      {/* Audio unlock (mobile) */}
      {voice.audioBlocked && (
        <button onClick={() => voice.unlockAudio()} className="flex-shrink-0 mx-4 my-1 py-2 rounded-xl font-mono text-[12px]" style={{ background: `${RED}22`, color: '#fff', border: `1px solid ${RED}` }}>🔊 დააჭირე ხმის ჩასართავად</button>
      )}

      {/* Grid / stage */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col">
        {!lkEnabled && match.phase !== 'finished' && <p className="flex-shrink-0 text-center font-mono text-[11px] text-white/40 mb-2">📡 ვიდეო ამ სერვერზე გათიშულია — თამაში ტექსტურ რეჟიმში მიდის</p>}
        {match.phase === 'finished' ? (
          <FinishedView match={match} onLeave={doLeave} onRematch={() => { SFX.click?.(); store.rematch(); }} isHost={isHost} />
        ) : match.phase === 'assign' ? (
          // ── The deal: face-down cards; each player takes one to learn their role ──
          <div className="min-h-full flex flex-col items-center justify-center py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] mb-1" style={{ color: `${RED}cc` }}>დარიგება</p>
            <p className="font-display font-black text-white mb-1" style={{ fontSize: 20 }}>აიღე ბარათი მაგიდიდან</p>
            <p className="font-mono text-[12px] text-white/50 mb-4 text-center px-4">
              {match.amSpectator ? '👁 მაყურებელი ხარ' : match.myCardIndex != null ? '🎴 შენი ბარათი აღებულია — ეს შენი როლია' : isHost ? 'მოთამაშეები ირჩევენ ბარათებს…' : 'დააჭირე ერთ დახურულ ბარათს და ნახე შენი როლი'}
            </p>
            <div className="grid gap-2.5 justify-center w-full" style={{ gridTemplateColumns: `repeat(${Math.min(match.cards.length, wide ? 6 : 4)}, minmax(0, 82px))`, maxWidth: 560 }}>
              {match.cards.map(c => {
                const mine = c.index === match.myCardIndex;
                const claimed = c.claimedById != null;
                const canPick = !claimed && !match.amSpectator && !isHost && match.myCardIndex == null;
                const rm = mine && match.myRole ? XM_ROLE_META[match.myRole] : null;
                return (
                  <motion.button key={c.index} disabled={!canPick} whileTap={canPick ? { scale: 0.94 } : undefined}
                    onClick={() => { if (canPick) { SFX.click?.(); haptic('selection'); store.pickCard(c.index); } }}
                    className="relative rounded-xl flex flex-col items-center justify-center"
                    style={{
                      aspectRatio: '3/4',
                      border: `2px solid ${rm ? rm.color : claimed ? 'rgba(255,255,255,0.12)' : 'rgba(168,85,247,0.45)'}`,
                      // The unclaimed back is the VOID card's own colour, not the
                      // table's red — it is the deck, not a role.
                      background: rm ? `linear-gradient(160deg, ${rm.color}22, #0a0609)`
                        : claimed ? 'rgba(255,255,255,0.03)'
                        : 'linear-gradient(160deg, #1b0f33, #0b0714)',
                      cursor: canPick ? 'pointer' : 'default',
                      boxShadow: rm ? `0 0 16px ${rm.color}55` : canPick ? '0 4px 16px rgba(168,85,247,0.28)' : 'none',
                    }}>
                    {rm ? (
                      <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className="flex flex-col items-center px-1">
                        <span style={{ fontSize: 30 }}>{rm.emoji}</span>
                        <span className="font-display font-black mt-1 text-center leading-tight" style={{ fontSize: 12, color: rm.color }}>{rm.label}</span>
                        <span className="font-mono text-[8px] text-white/40 mt-0.5">{rm.team === 'mafia' ? 'მაფია' : 'ქალაქი'}</span>
                      </motion.div>
                    ) : claimed ? (
                      <div className="flex flex-col items-center w-full">
                        <VoidCardBack size="52%" dim />
                        <span className="font-mono text-[11px] text-white/50 mt-1">#{c.claimedBySeat}</span>
                      </div>
                    ) : (
                      <VoidCardBack size="66%" live={canPick} />
                    )}
                  </motion.button>
                );
              })}
            </div>
            <p className="font-mono text-[11px] text-white/40 mt-4">აღებულია {match.cards.filter(c => c.claimedById).length}/{match.cards.length}</p>
            {match.myCardIndex != null && !match.amSpectator && (
              <button onClick={() => { SFX.click?.(); setRoleOpen(true); }} className="mt-3 px-4 py-2 rounded-xl font-mono text-[12px]" style={{ background: `${RED}22`, border: `1px solid ${RED}44`, color: '#fff' }}>🎭 როლის ბარათი</button>
            )}
          </div>
        ) : match.phase === 'mafia_meet' ? (
          // ── First night: the mafia get acquainted (separate screen) ─────────
          <div className="min-h-full flex items-center justify-center">
            {(amMafia || isHost) ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg text-center">
                <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-4xl mb-1">🌙🔫</motion.p>
                <p className="font-display font-black" style={{ fontSize: 22, color: RED }}>პირველი ღამე</p>
                <p className="font-mono text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {isHost ? 'მაფია თვალებს ახელს და ერთმანეთს ცნობს' : 'გაიცანი შენი გუნდი — მხოლოდ თქვენ ხედავთ ერთმანეთს'}
                </p>
                <div className="mt-5 grid gap-3 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 150px))', maxWidth: 470, marginInline: 'auto' }}>
                  {mafiaTeam.map((s, i) => {
                    const rm = XM_ROLE_META[s.role!];
                    const isMe = s.userId === myId;
                    const st = streamFor(s.userId);
                    return (
                      <motion.div key={s.userId} initial={{ opacity: 0, y: 14, rotateY: 30 }} animate={{ opacity: 1, y: 0, rotateY: 0 }} transition={{ delay: 0.1 + i * 0.12 }}
                        className="relative overflow-hidden xm-float" style={{ aspectRatio: '3/4', borderRadius: 14, background: '#0b0b12', border: `2px solid ${rm.color}`, boxShadow: `0 0 22px ${rm.color}66, inset 0 0 30px ${rm.color}18` }}>
                        <VideoTile stream={st} mirror={isMe} muted={isMe} />
                        {!st && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(circle at 50% 34%, ${rm.color}22, #0a0810 72%)` }}>
                            <div className="rounded-full flex items-center justify-center" style={{ width: '48%', aspectRatio: '1', fontSize: '1.7rem', background: `linear-gradient(155deg, ${rm.color}, #16111f)`, boxShadow: 'inset 0 -6px 14px rgba(0,0,0,0.45)' }}>{rm.emoji}</div>
                          </div>
                        )}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.07), transparent 22%)' }} />
                        <div className="absolute bottom-0 left-0 right-0 px-2 pt-3 pb-1.5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92), transparent)' }}>
                          <p className="font-mono text-[11px] text-white truncate">#{s.seat} {s.nickname}{isMe && ' (შენ)'}</p>
                          <p className="font-mono text-[10px] font-bold" style={{ color: rm.color }}>{rm.emoji} {rm.label}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {amMafia && mafiaTeam.length === 1 && <p className="font-mono text-[12px] mt-4 text-white/50">შენ ერთადერთი მაფია ხარ — მარტო იმოქმედებ.</p>}
                <p className="font-mono text-[11px] mt-5 text-white/35 animate-pulse">{isHost ? 'დააჭირე „ღამის მოქმედება"-ს გასაგრძელებლად' : 'ჰოსტი მალე გააგრძელებს…'}</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="text-5xl mb-3">🌙</motion.p>
                <p className="font-display font-bold text-white text-lg">პირველი ღამე</p>
                <p className="font-mono text-[12px] mt-1 text-white/45">თვალები დახუჭე — მაფია ერთმანეთს ცნობს…</p>
              </motion.div>
            )}
          </div>
        ) : (match.phase === 'night' || match.phase === 'plan_night') && (match.amSpectator || !match.myAlive || (match.myRole === 'citizen' && match.phase === 'night') || (match.phase === 'plan_night' && !amMafia)) ? (
          // ── Night for townsfolk: a starry sky while the special roles act ─────
          <div className="min-h-full flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 20%, #0e1638, #05060f 75%)' }}>
            {STARS.map((st, i) => (
              <span key={i} className="absolute rounded-full" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, background: '#fff', animation: `xmTwinkle ${2.4 + st.d}s ease-in-out ${st.d}s infinite`, boxShadow: '0 0 3px #fff' }} />
            ))}
            <motion.div animate={{ y: [0, -7, 0], rotate: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }} style={{ fontSize: 64, filter: 'drop-shadow(0 0 18px rgba(255,220,120,0.5))' }}>🌙</motion.div>
            <p className="font-display font-black text-white mt-3" style={{ fontSize: 22, letterSpacing: 1 }}>ქალაქს სძინავს</p>
            <p className="font-mono text-[12px] mt-1.5" style={{ color: 'rgba(180,200,255,0.6)' }}>დახუჭე თვალები — ღამე მოქმედებს…</p>
            {/* A convert has no night action, so this sky is their whole night —
                and without this line it would be the same sky as a citizen's. */}
            {iAmCult && match.myAlive && (
              <p className="font-mono text-[11px] mt-4 px-3 py-1.5 rounded-lg"
                style={{ color: CULT, background: `${CULT}14`, border: `1px solid ${CULT}44` }}>🕯 შენ კულტში ხარ</p>
            )}
            {!match.myAlive && <p className="font-mono text-[11px] mt-4 text-white/30">💀 შენ თამაშიდან გახვედი</p>}
          </div>
        ) : useRing ? (
          // ── Centre-stage table: players ring the stage ──────────────────────
          (() => {
            /*
             * Fit the ring to the box, on both axes.
             *
             * Tiles are 16:9 because that is the shape a webcam is; a grid sized
             * off width alone runs off the bottom of the screen, which is
             * exactly what it was doing — the last row sat underneath the host
             * bar. So take the smaller of what the width allows and what the
             * height allows, and centre the result.
             */
            // A phone has four tiles across 340 points; ten of those points
            // between each pair is a tenth of the board spent on nothing.
            // Measured above, so the video subscriptions can read the same
            // numbers the layout uses.
            const GAP = RING_GAP;
            const across = ringAcross;
            const { w: tileW, h: tileH } = ringTile;
            const boardW = tileW * across + GAP * (across - 1);
            const midH = tileH * ring.side + GAP * (ring.side - 1);

            /*
             * Seats run clockwise from the top-left, the way they are numbered:
             * across the top, down the right, back along the bottom, up the
             * left. Slicing rather than placing by index keeps that order a
             * property of the list instead of arithmetic at every cell.
             *
             * Sorted here rather than trusted: the server does keep the array in
             * seat order, but "#1 is the top-left corner and it runs clockwise"
             * is a promise this layout makes, and it should not rest on an
             * invariant maintained three files away in another process.
             */
            const seats = [...match.seats].sort((a, b) => a.seat - b.seat);
            const topSeats = seats.slice(0, ring.top);
            const rightSeats = seats.slice(ring.top, ring.top + ring.side);
            const bottomSeats = seats.slice(ring.top + ring.side, ring.top + ring.side + ring.bottom).reverse();
            const leftSeats = seats.slice(ring.top + ring.side + ring.bottom).reverse();

            const row = (list: typeof seats) => (
              <div style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
                {list.map(s => <div key={s.userId} style={{ width: tileW, height: tileH }}>{renderSeat(s, { fill: true })}</div>)}
              </div>
            );
            const column = (list: typeof seats) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, justifyContent: 'center', width: tileW }}>
                {list.map(s => <div key={s.userId} style={{ width: tileW, height: tileH }}>{renderSeat(s, { fill: true })}</div>)}
              </div>
            );

            return (
          <div ref={stageRef} data-stagebox className="flex-1 min-h-0 flex items-center justify-center">
            {lkEnabled && <VideoQualityTuner seatIds={seatIdsKey} seatWidth={tileW} hostId={match.hostId} hostWidth={ringStageW} rev={voice.rev} />}
            <div style={{ width: boardW, display: 'flex', flexDirection: 'column', gap: GAP }}>
              {row(topSeats)}
              {/* The stage takes whatever the side columns leave, so it is
                  centred by construction rather than by a magic width. */}
              <div style={{ display: 'flex', gap: GAP, height: midH, alignItems: 'stretch' }}>
                {column(leftSeats)}
                <div style={{ flex: 1, minWidth: 0 }}>{StageCard}</div>
                {column(rightSeats)}
              </div>
              {row(bottomSeats)}
            </div>
          </div>
            );
          })()
        ) : match.phase !== 'lobby' ? (
          /*
           * In-play without the ring — the mafia's first night, or a table too
           * small to have a middle (see MIN_ACROSS). Host in the grid with
           * everyone else rather than a thumbnail underneath, so the whole table
           * is on one screen.
           *
           * Sized to the box, not stretched to it: `gridAutoRows: 1fr` over a
           * fixed height was giving each row an equal share of whatever was
           * left, so the tiles changed shape with the number of rows and again
           * every time somebody died. fitTile gives one frame to everybody and
           * keeps the whole grid on screen, which matters here more than
           * anywhere — a mafia table you have to scroll is a table you cannot
           * read.
           */
          (() => {
            const GAP = 8;
            const cols = portraitStage ? 2 : 3;
            const seats = [...match.seats].sort((a, b) => a.seat - b.seat);
            const tile = fitTile({
              availW: Math.max(280, stageBox.w), availH: Math.max(280, stageBox.h),
              cols, rows: Math.ceil((seats.length + 1) / cols), gap: GAP,
              mode: portraitStage ? 'fill' : 'webcam',
            });
            return (
              <div ref={stageRef} data-stagebox className="flex-1 min-h-0 flex items-center justify-center">
                {lkEnabled && <VideoQualityTuner seatIds={seatIdsKey} seatWidth={tile.w} hostId={match.hostId} hostWidth={tile.w} rev={voice.rev} />}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${tile.w}px)`, gap: GAP, justifyContent: 'center' }}>
                  {seats.map(s => (
                    <div key={s.userId} style={{ width: tile.w, height: tile.h }}>{renderSeat(s, { fill: true })}</div>
                  ))}
                  <div style={{ width: tile.w, height: tile.h }}>{renderSeat(null, { isHostTile: true, fill: true })}</div>
                </div>
              </div>
            );
          })()
        ) : (
          // ── Lobby: 2-column grid + setup panels (host tile last) ──
          <div className="max-w-3xl mx-auto">
            <div className="grid gap-2.5 mx-auto" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 380 }}>
              {match.seats.map(s => renderSeat(s))}
              {renderSeat(null, { isHostTile: true })}
            </div>
            {match.phase === 'lobby' && (
              <>
                {/* The code is the whole invitation, and the top bar prints it
                    at 10px next to five other things. Here it is the thing on
                    the screen, and tapping it copies. */}
                <button
                  onClick={async () => {
                    SFX.click?.(); haptic('selection');
                    if (await copyText(match.code)) { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1600); }
                  }}
                  className="mx-auto mt-4 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all active:scale-[0.97]"
                  style={{ background: `${RED}12`, border: `1px solid ${RED}3a` }}
                >
                  <span className="font-mono font-bold" style={{ fontSize: 22, letterSpacing: '0.34em', color: '#ff8a92' }}>{match.code}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: codeCopied ? '#7fe0a0' : 'rgba(255,255,255,0.35)' }}>
                    {codeCopied ? '✓ დაკოპირდა' : '⧉ კოპირება'}
                  </span>
                </button>
                <p className="text-center font-mono text-[12px] text-white/40 mt-3">
                  {isHost ? 'გააზიარე კოდი და დაელოდე მოთამაშეებს (მინ. 4). ჰოსტი მოთამაშე არ არის — ის მართავს თამაშს.' : 'დაელოდე, სანამ ჰოსტი დაიწყებს…'}
                </p>

                {/* Four players minimum plus a host, and a code only reaches
                    whoever is already listening. */}
                <div className="flex justify-center mt-3"><GameInviteButton game="sxvamafia" code={match.code} /></div>

                {/*
                  სპორტული მაფია — the tournament ruleset.

                  Its own card above the composition, because turning it on
                  takes the composition away: sport is ten players, one don, two
                  mafia, one sheriff, and a host who does not get to adjust
                  that. A toggle buried among the steppers would look like one
                  more thing to tune.
                */}
                <div className="mt-4 max-w-sm mx-auto rounded-2xl p-4"
                  style={{
                    background: match.sportRequested ? 'rgba(255,204,51,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${match.sportRequested ? 'rgba(255,204,51,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                  <button
                    onClick={() => { if (isHost) { SFX.click?.(); store.setSport(!match.sportRequested); } }}
                    disabled={!isHost}
                    className="w-full flex items-center gap-3 text-left"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: isHost ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 22 }}>🏆</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-display font-bold text-[13px]" style={{ color: match.sportRequested ? '#ffcc33' : '#fff' }}>
                        სპორტული მაფია
                      </span>
                      <span className="block font-mono text-[10px] text-white/40 mt-0.5">
                        10 მოთამაშე · 1 დონი · 2 მაფია · 1 შერიფი
                      </span>
                    </span>
                    {/* A switch, not a checkbox: it changes the whole ruleset. */}
                    <span style={{
                      width: 40, height: 22, borderRadius: 999, flexShrink: 0, position: 'relative',
                      background: match.sportRequested ? '#ffcc33' : 'rgba(255,255,255,0.12)',
                      transition: 'background 160ms',
                    }}>
                      <span style={{
                        position: 'absolute', top: 3, left: match.sportRequested ? 21 : 3,
                        width: 16, height: 16, borderRadius: '50%', background: '#140f22',
                        transition: 'left 160ms',
                      }} />
                    </span>
                  </button>

                  {match.sportRequested && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,204,51,0.2)' }}>
                      <p className="font-mono text-[10px] leading-relaxed text-white/50">
                        • მაფია ერთმანეთის არჩევანს <b style={{ color: '#ffcc33' }}>ვერ ხედავს</b> — სამივემ ერთსა და იმავეს უნდა დააჭიროს<br />
                        • შერიფისთვის <b style={{ color: '#ffcc33' }}>დონი მშვიდობიანია</b><br />
                        • ხმების გაყოფისას — <b style={{ color: '#ffcc33' }}>ტრიბუნალი</b>, და არა ხელახალი კენჭისყრა<br />
                        • თამაში იწყება დაგეგმვის ღამით
                      </p>
                      {/* Says which half is missing rather than leaving the host
                          to work out why the start button will not fire. */}
                      {match.sportBlockedReason && (
                        <p className="font-mono text-[10.5px] mt-2.5 px-2.5 py-2 rounded-lg"
                          style={{ color: '#ff8a92', background: 'rgba(255,60,80,0.1)', border: '1px solid rgba(255,60,80,0.3)' }}>
                          ⚠️ {match.sportBlockedReason}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Role composition (host configurable, others read-only) */}
                <div className="mt-4 max-w-sm mx-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${RED}22`, opacity: match.sportRequested ? 0.45 : 1, pointerEvents: match.sportRequested ? 'none' : 'auto' }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="font-display font-bold text-white text-[13px]">🎭 როლების შემადგენლობა</p>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: match.roleConfigCustom ? `${RED}22` : 'rgba(255,255,255,0.06)', color: match.roleConfigCustom ? RED : 'rgba(255,255,255,0.5)' }}>{match.roleConfigCustom ? 'მორგებული' : 'ავტო'}</span>
                  </div>
                  {isHost ? (
                    <div className="space-y-2.5">
                      <RoleStepper emoji="🎩" label="დონი" value={match.setup.don} min={0} max={Math.min(2, match.seats.length - match.setup.mafia - match.setup.sheriff)}
                        onChange={d => store.setRoles({ ...roleCfg, don: clamp(match.setup.don + d, 0, 2) })} />
                      <RoleStepper emoji="🔫" label="მაფია" value={match.setup.mafia} min={0} max={Math.min(9, match.seats.length - match.setup.don - match.setup.sheriff)}
                        onChange={d => store.setRoles({ ...roleCfg, mafia: clamp(match.setup.mafia + d, 0, 9) })} />
                      <RoleStepper emoji="🔎" label="შერიფი" value={match.setup.sheriff} min={0} max={Math.min(2, match.seats.length - match.setup.don - match.setup.mafia)}
                        onChange={d => store.setRoles({ ...roleCfg, sheriff: clamp(match.setup.sheriff + d, 0, 2) })} />

                      {/*
                        The optional roles, off by default.
                        Each one changes the game a great deal — a maniac makes
                        the mafia's parity meaningless, a cult can take the table
                        out from under everybody — so they are something the host
                        turns on, not something that appears on its own.
                      */}
                      <div className="pt-1.5 mt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="font-mono text-[10px] text-white/30 mb-2 tracking-wider">დამატებითი როლები</p>
                        <div className="space-y-2.5">
                          <RoleStepper emoji="💉" label="ექიმი" value={match.setup.doctor} min={0} max={2}
                            onChange={d => store.setRoles({ ...roleCfg, doctor: clamp(match.setup.doctor + d, 0, 2) })} />
                          <RoleStepper emoji="🔪" label="მანიაკი" value={match.setup.maniac} min={0} max={2}
                            onChange={d => store.setRoles({ ...roleCfg, maniac: clamp(match.setup.maniac + d, 0, 2) })} />
                          <RoleStepper emoji="🕯" label="კულტის ლიდერი" value={match.setup.cult} min={0} max={1}
                            onChange={d => store.setRoles({ ...roleCfg, cult: clamp(match.setup.cult + d, 0, 1) })} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="font-mono text-[12.5px] text-white/85">🧑 მშვიდობიანი</span>
                        <span className="font-mono text-[14px] text-white/55">{match.setup.citizen} <span className="text-[10px] text-white/30">(ავტო)</span></span>
                      </div>
                      {match.roleConfigCustom && <button onClick={() => { SFX.click?.(); store.setRoles(null); }} className="w-full mt-1 py-1.5 rounded-lg font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.14)' }}>↺ ავტოზე დაბრუნება</button>}
                    </div>
                  ) : (
                    <p className="font-mono text-[13px] text-white/70 text-center">🎩 {match.setup.don} · 🔫 {match.setup.mafia} · 🔎 {match.setup.sheriff} · 🧑 {match.setup.citizen}</p>
                  )}
                  <p className="font-mono text-[10px] text-white/30 mt-2.5 text-center">მაფიის გუნდი {match.setup.don + match.setup.mafia} · ქალაქი {match.setup.sheriff + match.setup.citizen} · სულ {match.seats.length}</p>
                </div>

                {/* Timers & floor control (host only) */}
                {isHost && (
                  <div className="mt-3 max-w-sm mx-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${RED}22` }}>
                    <p className="font-display font-bold text-white text-[13px] mb-2.5">⏱ ტაიმერები & წესები</p>
                    <div className="space-y-2.5">
                      <RoleStepper emoji="🗣" label="საუბრის წუთი" value={match.settings.speechSeconds} min={20} max={180}
                        onChange={d => store.setSettings({ speechSeconds: clamp(match.settings.speechSeconds + d * 10, 20, 180) })} />
                      <RoleStepper emoji="🌙" label="ღამის დრო" value={match.settings.nightSeconds} min={20} max={120}
                        onChange={d => store.setSettings({ nightSeconds: clamp(match.settings.nightSeconds + d * 10, 20, 120) })} />
                      {/* Per candidate, not per vote: this is how long the
                          moderator gives the table to put hands up for one
                          name. Steps of one, because the whole range is five. */}
                      <RoleStepper emoji="⚖️" label="ხმა (თითო კანდიდატზე)" value={match.settings.voteSeconds} min={3} max={30}
                        onChange={d => store.setSettings({ voteSeconds: clamp(match.settings.voteSeconds + d, 3, 30) })} />
                      <RoleStepper emoji="🎤" label="ბოლო სიტყვა" value={match.settings.lastWordsSeconds} min={15} max={120}
                        onChange={d => store.setSettings({ lastWordsSeconds: clamp(match.settings.lastWordsSeconds + d * 5, 15, 120) })} />
                      <button onClick={() => { SFX.click?.(); store.setSettings({ floorControl: !match.settings.floorControl }); }}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span className="font-mono text-[12.5px] text-white/85">🎙 მიკროფონის კონტროლი</span>
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: match.settings.floorControl ? `${RED}33` : 'rgba(255,255,255,0.08)', color: match.settings.floorControl ? '#ff8a92' : 'rgba(255,255,255,0.5)' }}>{match.settings.floorControl ? 'ჩართული' : 'გამორთ.'}</span>
                      </button>
                    </div>
                    <p className="font-mono text-[10px] text-white/30 mt-2 text-center">ჩართულ რეჟიმში მხოლოდ მოსაუბრეს აქვს ხმა</p>
                  </div>
                )}

                {/* Host transfer (host only) */}
                {isHost && match.seats.length > 0 && (
                  <div className="mt-3 max-w-sm mx-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${RED}22` }}>
                    <p className="font-display font-bold text-white text-[13px] mb-2.5">👑 მოთამაშეები</p>
                    <div className="space-y-1.5">
                      {match.seats.map(s => (
                        <div key={s.userId} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="font-mono text-[12px] text-white truncate flex-1">#{s.seat} {s.nickname}</span>
                          <button onClick={() => { SFX.click?.(); store.transferHost(s.userId); }} className="px-2 py-1 rounded-md font-mono text-[11px] flex-shrink-0" style={{ background: `${RED}22`, border: `1px solid ${RED}44`, color: '#ff8a92' }}>👑</button>
                          <button onClick={() => { SFX.click?.(); setConfirmKick(s.userId); }} className="px-2 py-1 rounded-md font-mono text-[11px] flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)' }} title="გარიცხვა">🚫</button>
                        </div>
                      ))}
                    </div>
                    <p className="font-mono text-[10px] text-white/30 mt-2 text-center">👑 ჰოსტად დანიშვნა · 🚫 ოთახიდან გაძევება</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {match.phase !== 'finished' && (
        <div className="flex-shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2" style={{ borderTop: `1px solid ${RED}22`, background: 'rgba(0,0,0,0.3)' }}>
          <div className="max-w-2xl mx-auto">
            {/* 6-second "foul": a muted player grabs the mic out of turn */}
            {!isHost && !match.amSpectator && match.myAlive && floorControl && !iHoldFloor &&
              (['speech', 'vote', 'last_words', 'day_announce'] as string[]).includes(match.phase) && (() => {
                const someoneElse = !!match.floorGrabUserId && match.floorGrabUserId !== myId && match.floorGrabUntil > now;
                const elseSeat = someoneElse ? match.seats.find(s => s.userId === match.floorGrabUserId) : null;
                const left = Math.max(0, Math.ceil((match.floorGrabUntil - now) / 1000));
                return (
                  <button onClick={() => { if (!iHaveFloor && !someoneElse) { SFX.click?.(); haptic('selection'); store.grabFloor(); } }} disabled={someoneElse}
                    className="w-full mb-2 py-2.5 rounded-xl font-display font-bold text-[13px] transition-all active:scale-[0.98] disabled:opacity-60"
                    style={{ background: iHaveFloor ? '#ffcc33' : someoneElse ? 'rgba(255,255,255,0.05)' : `${RED}22`, color: iHaveFloor ? '#000' : '#fff', border: `1px solid ${iHaveFloor ? '#ffcc33' : someoneElse ? 'rgba(255,255,255,0.14)' : RED + '55'}` }}>
                    {iHaveFloor ? `🎙 ლაპარაკობ — ${left}წმ` : someoneElse ? `🔇 #${elseSeat?.seat} ${elseSeat?.nickname} საუბრობს (${left}წმ)` : '🎙 ფოლი — რიგგარეშე 6 წამი'}
                  </button>
                );
              })()}
            {isHost ? <HostBar /> : <PlayerPanel />}
            {isHost && match.phase !== 'lobby' && match.phase !== 'assign' && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}><PlayerPanelReadonly match={match} onShot={t => store.hostShot(t)} /></div>
            )}
          </div>
        </div>
      )}

      {/* Cinematic phase transition */}
      <AnimatePresence>
        {cinematic && (
          <motion.div key={cinematic.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[575] flex flex-col items-center justify-center pointer-events-none"
            style={{ background: cinematic.type === 'night' ? 'radial-gradient(ellipse at center, #0a1030 0%, #04040a 100%)' : 'radial-gradient(ellipse at center, #3a1508 0%, #0a0609 100%)' }}>
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 12 }} style={{ fontSize: 72 }}>{cinematic.type === 'night' ? '🌙' : '🌅'}</motion.span>
            <motion.p initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="font-display font-black text-white mt-2" style={{ fontSize: 26, letterSpacing: 2 }}>
              {cinematic.type === 'night' ? 'ღამე ჩამოწვა' : 'დილა დგება'}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Journal / protocol */}
      <AnimatePresence>
        {journalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[586] flex items-end sm:items-center justify-center" style={{ background: 'rgba(4,4,10,0.7)' }} onClick={() => setJournalOpen(false)}>
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[70vh] flex flex-col" style={{ background: 'rgba(16,10,14,0.99)', border: `1px solid ${RED}33` }}>
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <p className="font-display font-bold text-white text-[15px]">📜 თამაშის ჟურნალი</p>
                <button onClick={() => setJournalOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
              </div>
              <div className="overflow-y-auto space-y-1.5">
                {match.log.length === 0 ? <p className="font-mono text-[12px] text-white/40 text-center py-6">ჯერ ჩანაწერი არ არის</p> : [...match.log].reverse().map((e, i) => (
                  <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-[13px] flex-shrink-0">{e.phase === 'night' ? '🌙' : e.phase === 'day' ? '☀️' : e.phase === 'foul' ? '⚠️' : '🎬'}</span>
                    <span className="font-mono text-[12px] text-white/80">{e.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Role card */}
      <AnimatePresence>
        {roleOpen && match.myRole && (
          <RoleCard
            role={match.myRole}
            cult={match.myCult}
            mates={match.seats.filter(s => match.mateIds.includes(s.userId))}
            note={match.nightPrivate}
            onClose={() => setRoleOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* The night you find out. */}
      <AnimatePresence>
        {cultReveal && <CultRevealCard mates={match.seats.filter(s => match.mateIds.includes(s.userId))} onClose={() => setCultReveal(false)} />}
      </AnimatePresence>

      {/* Moderator: fouls and removals. Outside the toast's AnimatePresence,
          which filters its children and drops a portalled dialog entirely. */}
      {/* Moderator's ruling sheet for one player. */}
      {hostTarget && (() => {
        const target = match.seats.find(x => x.userId === hostTarget);
        if (!target) return null;
        const close = () => setHostTarget(null);
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-end justify-center" onClick={close}
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', zIndex: 3000 }}>
            <motion.div initial={{ y: 30 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl p-5"
              style={{ background: 'rgba(14,8,18,0.99)', border: `1px solid ${RED}33`, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
              <p className="font-display font-bold text-white text-base">#{target.seat} {target.nickname}</p>

              <div className="flex items-center gap-1.5 mt-2 mb-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <span key={i} className="w-3 h-3 rounded-full"
                    style={{ background: i < target.fouls ? '#ffcc33' : 'rgba(255,255,255,0.14)',
                             boxShadow: i < target.fouls ? '0 0 6px #ffcc33' : undefined }} />
                ))}
                <span className="font-mono text-[11px] text-white/40 ml-1">{target.fouls}/4 ფაული</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { SFX.click?.(); haptic('selection'); store.giveFoul(target.userId, -1); }}
                  disabled={target.fouls === 0}
                  className="flex-1 py-3 rounded-2xl font-display font-bold text-[14px] text-white disabled:opacity-30"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>
                  − ფაული
                </button>
                <button
                  onClick={() => { SFX.click?.(); haptic('error'); store.giveFoul(target.userId, 1); }}
                  disabled={!target.alive}
                  className="flex-1 py-3 rounded-2xl font-display font-bold text-[14px] text-black disabled:opacity-30"
                  style={{ background: '#ffcc33' }}>
                  + ფაული
                </button>
              </div>

              <button
                onClick={() => { SFX.click?.(); setConfirmKick(target.userId); }}
                className="w-full mt-2 py-3 rounded-2xl font-display font-bold text-[14px]"
                style={{ background: `${RED}22`, border: `1px solid ${RED}55`, color: '#ff8a92' }}>
                🚫 თამაშიდან გარიცხვა
              </button>

              <button onClick={close}
                className="w-full mt-2 py-2.5 rounded-2xl font-mono text-[12px] text-white/50">
                დახურვა
              </button>
            </motion.div>
          </motion.div>
        );
      })()}

      {/* Removing somebody is not undoable, so it is asked twice. */}
      {confirmKick && (() => {
        const target = match.seats.find(x => x.userId === confirmKick);
        // Portalled: the sheet underneath is a fixed, animated layer of its
        // own, and a confirmation nested inside that stacking context ends up
        // behind its backdrop — visible, blurred, and unreadable.
        return createPortal(
          <div className="fixed inset-0 flex items-center justify-center p-6"
            style={{ background: 'rgba(0,0,0,0.78)', zIndex: 3010 }} onClick={() => setConfirmKick(null)}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-xs rounded-3xl p-5 text-center"
              style={{ background: 'rgba(14,8,18,0.99)', border: `1px solid ${RED}44` }}>
              <p className="font-display font-bold text-white text-[15px]">
                {target?.nickname} გაირიცხოს?
              </p>
              <p className="font-mono text-[11px] text-white/45 mt-2 leading-relaxed">
                {match.phase === 'lobby'
                  ? 'ის გავა ოთახიდან და ვეღარ დაბრუნდება.'
                  : 'ის გავა თამაშიდან როგორც გარიცხული და ვეღარ დაბრუნდება.'}
              </p>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setConfirmKick(null)}
                  className="flex-1 py-2.5 rounded-2xl font-mono text-[12px] text-white/60"
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                  გაუქმება
                </button>
                <button
                  onClick={() => {
                    SFX.click?.(); haptic('error');
                    store.kick(confirmKick);
                    setConfirmKick(null); setHostTarget(null);
                  }}
                  className="flex-1 py-2.5 rounded-2xl font-display font-bold text-[13px] text-white"
                  style={{ background: RED }}>
                  გარიცხვა
                </button>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={clearError}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl font-mono text-[12px] z-[580]" style={{ background: 'rgba(255,60,80,0.95)', color: '#fff' }}>{error}</motion.div>
        )}
      </AnimatePresence>

      {/*
        Closing the table — the second step, and the reason the first one used
        to do nothing.

        The button that opens this set `confirmEnd` and nothing rendered it, so
        pressing "მაგიდის გაუქმება" flipped a boolean no one was reading. It is
        two steps on purpose: ending a hand is recoverable and closing a room is
        not, so the irreversible one asks again.
      */}
      <AnimatePresence>
        {confirmEnd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[595] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.9)' }} onClick={() => setConfirmEnd(false)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(20,10,14,0.99)', border: `1px solid ${RED}66` }}>
              <p className="text-3xl mb-2">🗑</p>
              <p className="font-display font-bold text-white text-[15px]">მაგიდის გაუქმება?</p>
              <p className="font-mono text-[11px] text-white/50 mt-2 leading-relaxed">
                ოთახი დაიხურება ყველასთვის და კოდი {match.code} აღარ იმუშავებს. ამის დაბრუნება არ შეიძლება.
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmEnd(false)}
                  className="flex-1 py-2.5 rounded-xl font-mono text-[12px]"
                  style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  არა
                </button>
                <button onClick={() => { SFX.click?.(); haptic('heavy'); setConfirmEnd(false); voice.leave(); store.dissolve(); }}
                  className="flex-1 py-2.5 rounded-xl font-mono text-[12px] text-white"
                  style={{ background: RED }}>
                  დიახ, დახურე
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave confirm */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[590] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.85)' }} onClick={() => setConfirmLeave(false)}>
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.92 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl p-5" style={{ background: 'rgba(20,10,14,0.99)', border: `1px solid ${RED}44` }}>

              {/*
                For the host this is a choice, not a question.
                Ending the game and closing the room are different decisions —
                one keeps the room, the code and the seats; the other throws
                everybody out to reassemble. They should never be one button.
              */}
              {isHost ? (
                <>
                  <p className="font-display font-bold text-white text-[15px] text-center">რას აკეთებ?</p>

                  {match.phase !== 'lobby' && (
                    <button
                      onClick={() => { SFX.click?.(); setConfirmLeave(false); store.endGame(); }}
                      className="w-full mt-4 py-3 rounded-xl text-left px-3.5"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)' }}>
                      <span className="font-display font-bold text-white text-[13.5px]">⏹ ხელის დასრულება — ლობი</span>
                      <span className="block font-mono text-[10.5px] text-white/40 mt-0.5">ოთახი და კოდი რჩება, ყველა ლობიში ბრუნდება</span>
                    </button>
                  )}

                  <button
                    onClick={() => { SFX.click?.(); setConfirmLeave(false); setConfirmEnd(true); }}
                    className="w-full mt-2 py-3 rounded-xl text-left px-3.5"
                    style={{ background: `${RED}18`, border: `1px solid ${RED}55` }}>
                    <span className="font-display font-bold text-[13.5px]" style={{ color: '#ff8a92' }}>✕ მაგიდის გაუქმება</span>
                    <span className="block font-mono text-[10.5px] text-white/40 mt-0.5">ოთახი იხურება ყველასთვის</span>
                  </button>

                  <button
                    onClick={() => setConfirmLeave(false)}
                    className="w-full mt-2 py-2.5 rounded-xl font-mono text-[12px]"
                    style={{ color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.14)' }}>
                    გაგრძელება
                  </button>
                </>
              ) : (
                <>
                  <p className="font-display font-bold text-white text-[15px] text-center">თამაშის დატოვება?</p>
                  <p className="font-mono text-[11px] text-white/45 mt-1 text-center">შენ თამაშიდან გახვალ.</p>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>დარჩენა</button>
                    <button onClick={() => { setConfirmLeave(false); doLeave(); }} className="flex-1 py-2.5 rounded-xl font-mono text-[12px] text-white" style={{ background: RED }}>გასვლა</button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/**
 * Asks each publisher for the simulcast layer their tile can actually show.
 *
 * WHY THIS EXISTS AT ALL
 * ──────────────────────
 * Without it every subscription arrives at the publisher's top rung, because
 * nothing tells LiveKit how big anything is drawn: this app hands React a
 * MediaStream rather than attaching the track to an element, so adaptive stream
 * has no element to measure (see livekitRoomOptions.ts for why it is off). At a
 * twelve-seat table that is eleven 720p streams filling tiles 89 points wide —
 * roughly eighteen megabits and ten megapixels a frame, on a phone. That is the
 * lag, and it is also why the picture is soft: a downlink that cannot keep up
 * drives congestion control, which pushes every publisher's upload down.
 *
 * WHY IT IS A COMPONENT AND NOT AN EFFECT IN THE GAME
 * ──────────────────────────────────────────────────
 * The sizes it needs are computed well below `if (!match) return null`, and a
 * hook after a conditional return is a hook that is sometimes not called —
 * React counts them, and the first render without a match would crash the game.
 * A component that renders nothing keeps it an ordinary unconditional hook.
 */
function VideoQualityTuner({ seatIds, seatWidth, hostId, hostWidth, rev }: {
  seatIds: string; seatWidth: number; hostId: string; hostWidth: number; rev: number;
}) {
  // Rounded: a sub-pixel reflow must not spend a signalling round trip per seat.
  const w = Math.round(seatWidth);
  const hw = Math.round(hostWidth);
  useEffect(() => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    setLiveKitVideoQuality(tableQualityPlan({
      seatIds: seatIds ? seatIds.split(',') : [], seatWidth: w, hostId, hostWidth: hw, dpr,
    }));
  }, [seatIds, w, hostId, hw, rev]);
  return null;
}

// Host also sees the live phase context (read-only) so they know what players face.
function PlayerPanelReadonly({ match, onShot }: { match: XmSafeState; onShot?: (targetId: string | null) => void }) {
  if (match.phase === 'night') {
    const shot = match.nightShot;
    /*
     * The moderator's ruling on the shot.
     *
     * A night the mafia agreed on resolves itself, so there is nothing here but
     * the picks. A split stops and waits: at a table the moderator sees three
     * fingers pointing three ways and says out loud what happened, and the rule
     * used to make that call silently by counting the don's vote twice.
     */
    if (shot) {
      const pointed = shot.picks.filter(p => p.targetId);
      const targets = match.seats.filter(s => s.alive && !shot.picks.some(p => p.userId === s.userId));
      return (
        <div className="w-full">
          <p className="text-center font-mono text-[10px]" style={{ color: match.nightAllActed ? '#7fe0a0' : 'rgba(255,255,255,0.35)' }}>
            {match.nightAllActed ? '✅ ყველამ იმოქმედა' : '🌙 მაფია/შერიფი მოქმედებენ…'}
          </p>
          {pointed.length > 0 && (
            <p className="text-center font-mono text-[10.5px] mt-1" style={{ color: shot.agreedId ? '#7fe0a0' : '#ffcc33' }}>
              🔫 {pointed.map(p => `#${p.seat}→#${p.targetSeat}`).join('  ')}
              {shot.agreedId ? '  · შეთანხმდნენ' : '  · ვერ შეთანხმდნენ'}
            </p>
          )}
          {shot.ruled && (
            <p className="text-center font-mono text-[10.5px] mt-1" style={{ color: '#7fe6ff' }}>
              👑 შენი გადაწყვეტილება: {shot.ruledId
                ? `#${match.seats.find(s => s.userId === shot.ruledId)?.seat} ${match.seats.find(s => s.userId === shot.ruledId)?.nickname}`
                : 'აცილება — არავინ კვდება'}
            </p>
          )}
          {shot.needsHost && onShot && (
            <div className="mt-2 rounded-xl px-2.5 py-2" style={{ background: 'rgba(255,204,51,0.08)', border: '1px solid rgba(255,204,51,0.3)' }}>
              <p className="text-center font-mono text-[11px]" style={{ color: '#ffcc33' }}>
                მაფია ვერ შეთანხმდა — შენ წყვეტ
                {/* The wait is bounded so an absent host cannot freeze the
                    table; a host who is here should see that clock, not be
                    surprised by it. */}
                {match.nightEndsAt > 0 && <span className="text-white/45"> · {fmt(Math.round((match.nightEndsAt - Date.now()) / 1000))}</span>}
              </p>
              {/*
                Seat numbers, not names.
                A moderator calls the table by number, and ten full names wrap
                to three rows — which on a phone puts the buttons the host has
                to press below the fold of the panel telling them to press one.
                The name is still on the tile, and on the chip's tooltip.
              */}
              <div className="flex flex-wrap gap-1.5 justify-center items-center mt-2">
                <button onClick={() => { SFX.click?.(); haptic('selection'); onShot(null); }}
                  className="px-2.5 py-1.5 rounded-full font-mono text-[11px] active:scale-95 flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff' }}>
                  🌙 აცილება
                </button>
                {targets.map(s => (
                  <button key={s.userId} title={s.nickname}
                    onClick={() => { SFX.click?.(); haptic('selection'); onShot(s.userId); }}
                    className="rounded-full font-mono font-bold text-[12px] active:scale-95 flex-shrink-0"
                    style={{ width: 34, height: 30, background: `${RED}22`, border: `1px solid ${RED}66`, color: '#fff' }}>
                    {s.seat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return <p className="text-center font-mono text-[10px]" style={{ color: match.nightAllActed ? '#7fe0a0' : 'rgba(255,255,255,0.35)' }}>{match.nightAllActed ? '✅ ყველა მზადაა — ღამე ავტომატურად სრულდება' : '🌙 მაფია/შერიფი მოქმედებენ… (ავტომატურად დასრულდება)'}</p>;
  }
  if (match.phase === 'vote') {
    const total = Object.values(match.voteTally).reduce((a, b) => a + b, 0);
    return <p className="text-center font-mono text-[10px] text-white/35">⚖️ მიცემული ხმები: {total} · {match.nominations.map(n => `#${n.seat}:${match.voteTally[n.userId] ?? 0}`).join('  ')}</p>;
  }
  if (match.phase === 'speech') return <p className="text-center font-mono text-[10px] text-white/35">🎙 {match.speechIdx + 1}/{match.speechTotal} {match.introRound ? 'გაცნობა (დასახელების გარეშე)' : `საუბრობს · კენჭზე: ${match.nominations.length}`}</p>;
  return null;
}

/** What each role is told about itself, in one line. */
const ROLE_BLURB: Record<XmRole, string> = {
  don:     'მაფიის ლიდერი. ღამით ჯერ ამოწმებ — შერიფია თუ არა — და მერე ირჩევ მსხვერპლს.',
  mafia:   'ღამით მაფიასთან ერთად ირჩევ მსხვერპლს. დღისით შენიღბე.',
  sheriff: 'ღამით ამოწმებ ერთ მოთამაშეს — მაფიაა თუ არა. იპოვე მაფია.',
  citizen: 'იპოვე მაფია საუბრით და კენჭისყრით. ხმა შენი იარაღია.',
  doctor:  'ღამით ერთ ადამიანს გადაარჩენ. ერთსა და იმავეს ზედიზედ ორჯერ ვერ — შენი თავიც მათ შორისაა.',
  maniac:  'მარტო ხარ ყველას წინააღმდეგ. ღამით კლავ, და იმარჯვებ, როცა მარტო შენ დარჩები.',
  cult:    'ღამით ერთ ადამიანს იმხრობ — მაფია და მანიაკი ვერ. იმარჯვებ, როცა მთელი მაგიდა შენია.',
};

function RoleCard({ role, cult, mates, note, onClose }: { role: XmRole; cult?: boolean; mates: XmSafeSeat[]; note?: string | null; onClose: () => void }) {
  const rm = XM_ROLE_META[role];
  /*
   * A convert keeps their role and changes their side.
   *
   * The card shows both, because both are true and both matter: the doctor
   * still heals every night, they just win with the cult now. Showing only the
   * role would hide the conversion; showing only the cult would lose the night
   * action they still have to take.
   */
  const converted = Boolean(cult) && role !== 'cult';
  /** Converted or the leader themselves — either way the cult is your side. */
  const onCultSide = converted || rm.team === 'cult';
  const tm = XM_TEAM_META[converted ? 'cult' : rm.team];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[585] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.85)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.85, rotateY: 20 }} animate={{ scale: 1, rotateY: 0 }} exit={{ scale: 0.85 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: `linear-gradient(160deg, ${rm.color}22, rgba(16,10,14,0.99))`, border: `1.5px solid ${converted ? CULT : rm.color}` }}>
        <p className="text-5xl mb-2">{rm.emoji}</p>
        <p className="font-display font-black" style={{ fontSize: 24, color: rm.color }}>{rm.label}</p>
        <p className="font-mono text-[11px] mt-1" style={{ color: onCultSide ? CULT : 'rgba(255,255,255,0.5)' }}>
          {tm.emoji} {tm.of} {onCultSide ? 'მხარეს' : 'გუნდი'}
        </p>
        <p className="font-mono text-[12px] mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{ROLE_BLURB[role]}</p>
        {converted && (
          <p className="font-mono text-[11px] mt-2 leading-relaxed rounded-lg px-2.5 py-2"
            style={{ color: CULT, background: `${CULT}14`, border: `1px solid ${CULT}44` }}>
            🕯 შენ კულტში ხარ. ღამის მოქმედება იგივე გრჩება — მაგრამ იმარჯვებ კულტთან ერთად.
          </p>
        )}
        {mates.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="font-mono text-[10px] text-white/40 mb-1">{onCultSide ? 'კულტი:' : 'შენი გუნდი:'}</p>
            <p className="font-mono text-[12px]" style={{ color: onCultSide ? CULT : rm.color }}>{mates.map(m => `#${m.seat} ${m.nickname}`).join(', ')}</p>
          </div>
        )}
        {note && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {/* The leader's note is the result of a conversion, not a check —
                calling it one would be the wrong word on the wrong card. */}
            <p className="font-mono text-[10px] text-white/40 mb-1">{role === 'cult' ? 'გასული ღამე:' : 'შენი ბოლო შემოწმება:'}</p>
            <p className="font-mono text-[12px] text-white">{note}</p>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl font-display font-bold text-[13px]" style={{ background: rm.color, color: ink(rm.color) }}>დამალვა</button>
      </motion.div>
    </motion.div>
  );
}

/**
 * The night a convert finds out.
 *
 * It arrives a full day after the conversion, and it is the only notice they
 * get, so it takes over the screen the way the role card did at the deal —
 * anything smaller would be a badge appearing somewhere while the player was
 * looking at somebody's video, and they would simply miss it.
 *
 * It also names who else is in the cult, because from this moment they are
 * playing with those people, and a convert who does not know that plays their
 * old game for another day.
 */
function CultRevealCard({ mates, onClose }: { mates: XmSafeSeat[]; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[590] flex items-center justify-center px-8"
      style={{ background: 'rgba(8,2,14,0.92)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.8, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-6 text-center"
        style={{ background: `linear-gradient(160deg, ${CULT}2e, rgba(14,6,20,0.99))`, border: `1.5px solid ${CULT}`, boxShadow: `0 0 44px ${CULT}44` }}>
        <motion.p className="text-5xl mb-2"
          animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}>🕯</motion.p>
        <p className="font-display font-black" style={{ fontSize: 23, color: CULT }}>შენ კულტში ხარ</p>
        <p className="font-mono text-[12px] mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
          წინა ღამეს კულტის ლიდერმა მოგიმხრო. როლი და ღამის მოქმედება იგივე გრჩება — მაგრამ ახლა კულტთან ერთად იმარჯვებ.
        </p>
        {mates.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${CULT}33` }}>
            <p className="font-mono text-[10px] text-white/40 mb-1">შენი ძმობა:</p>
            <p className="font-mono text-[12px]" style={{ color: CULT }}>{mates.map(m => `#${m.seat} ${m.nickname}`).join(', ')}</p>
          </div>
        )}
        <p className="font-mono text-[10px] mt-3 text-white/35">ვერავინ გაიგებს — სანამ თვითონ არ გასცემ თავს</p>
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl font-display font-bold text-[13px]" style={{ background: CULT, color: ink(CULT) }}>გავიგე</button>
      </motion.div>
    </motion.div>
  );
}

function FinishedView({ match, onLeave, onRematch, isHost }: { match: XmSafeState; onLeave: () => void; onRematch: () => void; isHost: boolean }) {
  if (match.dissolved) {
    return <div className="text-center py-14"><p className="text-4xl mb-3">👋</p><p className="font-display font-bold text-white text-lg">თამაში დასრულდა</p>
      <button onClick={onLeave} className="mt-6 px-8 py-3 rounded-2xl font-mono text-[13px]" style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button></div>;
  }
  const won = match.winner;
  return (
    <div className="max-w-md mx-auto text-center py-6">
      {/* Four factions can win now, so the screen asks which rather than assuming. */}
      <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-5xl mb-2">
        {won ? XM_TEAM_META[won].emoji : '🏙'}
      </motion.p>
      <p className="font-display font-black" style={{ fontSize: 26, color: won ? XM_TEAM_META[won].color : '#7fe0a0' }}>
        {won === 'mafia' ? 'მაფიამ გაიმარჯვა!'
          : won === 'maniac' ? 'მანიაკმა გაიმარჯვა!'
          : won === 'cult' ? 'კულტმა გაიმარჯვა!'
          : 'ქალაქმა გაიმარჯვა!'}
      </p>
      <div className="mt-5 space-y-1.5 text-left">
        {match.reveal?.slice().sort((a, b) => a.seat - b.seat).map(r => {
          const rm = XM_ROLE_META[r.role];
          return (
            <div key={r.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${rm.team === 'mafia' ? RED + '33' : 'rgba(255,255,255,0.06)'}` }}>
              <span className="font-mono text-[12px] text-white/40 w-6">#{r.seat}</span>
              <span className="flex-1 font-mono text-[13px] text-white truncate">{r.nickname}</span>
              <span className="text-base">{rm.emoji}</span>
              <span className="font-mono text-[12px]" style={{ color: rm.color }}>{rm.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex gap-2">
        {isHost && <button onClick={onRematch} className="flex-1 py-3 rounded-2xl font-display font-bold text-white text-[14px]" style={{ background: `linear-gradient(135deg, ${RED}, #b81020)` }}>🔄 ხელახლა</button>}
        <button onClick={onLeave} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
      </div>
    </div>
  );
}
