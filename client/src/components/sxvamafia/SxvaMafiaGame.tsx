import { useEffect, useRef, useState, memo } from 'react';
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
} from '@/services/livekitVoice';
import { XM_ROLE_META, type XmSafeSeat, type XmSafeState, type XmRole } from '@/types/sxvaMafia';

/**
 * სხვა მაფია (Other Mafia) — a from-scratch, video-first "table mafia".
 * Every player is a webcam tile in the grid; the active speaker's tile glows and
 * runs its own countdown; a moderator ("host") sits centre-stage, drives the
 * phases and hands out fouls. Prop-less overlay reading the store, like the
 * other match games. Shares nothing with the platform's original mafia engine.
 */

const RED = '#ff3b47';
// Tasteful per-seat avatar tints for when a webcam isn't showing.
const AV = ['#7c5cff', '#3f8cff', '#2fb8a0', '#e0803c', '#d84f7a', '#5cbe6a', '#c78cff', '#4aa0d8', '#e0b23c', '#5c7cff'];
// A fixed twinkling starfield for the night overlay (computed once).
const STARS = Array.from({ length: 54 }, (_, i) => ({ x: (i * 37 + 13) % 100, y: (i * 53 + 7) % 100, s: 1 + ((i * 7) % 3) * 0.7, d: ((i * 11) % 40) / 10 }));

function fmt(sec: number): string { const s = Math.max(0, sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/** Viewport-width gate: the centre-stage ring only makes sense on wider screens. */
function useWide(bp = 760): boolean {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth >= bp : true);
  useEffect(() => { const on = () => setW(window.innerWidth >= bp); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, [bp]);
  return w;
}
/** Grid dimensions whose perimeter can seat `n` players around a central stage. */
function ringDims(n: number): { cols: number; rows: number; P: number } {
  let best: { cols: number; rows: number; P: number; waste: number } | null = null;
  for (let cols = 4; cols <= 6; cols++) for (let rows = 4; rows <= 6; rows++) {
    const P = 2 * cols + 2 * (rows - 2);
    if (P < n) continue;
    const waste = P - n;
    if (!best || waste < best.waste || (waste === best.waste && cols + rows < best.cols + best.rows)) best = { cols, rows, P, waste };
  }
  return best ? { cols: best.cols, rows: best.rows, P: best.P } : { cols: 5, rows: 5, P: 16 };
}
/** Perimeter cells of a cols×rows grid, clockwise from the top-left corner. */
function ringCells(cols: number, rows: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let c = 1; c <= cols; c++) cells.push({ row: 1, col: c });
  for (let r = 2; r <= rows - 1; r++) cells.push({ row: r, col: cols });
  for (let c = cols; c >= 1; c--) cells.push({ row: rows, col: c });
  for (let r = rows - 1; r >= 2; r--) cells.push({ row: r, col: 1 });
  return cells;
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

/** Spread `n` seats as evenly as possible over `P` perimeter slots. */
function distribute(n: number, P: number): number[] {
  const used = new Set<number>(); const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let idx = Math.round((i * P) / n) % P;
    while (used.has(idx)) idx = (idx + 1) % P;
    used.add(idx); out.push(idx);
  }
  return out;
}

const PHASE_LABEL: Record<XmSafeState['phase'], string> = {
  lobby: 'მოლოდინი', assign: 'როლების დარიგება', mafia_meet: 'პირველი ღამე', night: 'ღამე', day_announce: 'დილა',
  speech: 'დღე — საუბრები', vote: 'კენჭისყრა', last_words: 'გამომშვიდობების სიტყვა', finished: 'დასასრული',
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
}
const SeatTile = memo(function SeatTile({ seat, isHostTile, fill, match, myId, stream, isSpeaking, foulMode, isHost, speechLeft, onFoul, grabbing }: SeatTileProps) {
  const uid = isHostTile ? match.hostId : seat!.userId;
  const name = isHostTile ? match.hostName : seat!.nickname;
  const isMe = uid === myId;
  const turnSpeaking = !isHostTile && seat!.isSpeaking && match.phase === 'speech';
  const dead = !isHostTile && !seat!.alive;
  const mate = !isHostTile && match.mateIds.includes(uid);
  const rm = seat?.role ? XM_ROLE_META[seat.role] : null;
  const conn = isHostTile ? match.hostConnected : seat!.connected;
  const glow = turnSpeaking ? RED : grabbing ? '#ffcc33' : isSpeaking ? '#39d98a' : mate ? '#ff6b6b' : 'transparent';
  const canFoul = isHost && foulMode && !isHostTile && seat!.alive;
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const avatarColor = isHostTile ? RED : AV[((seat?.seat ?? 0)) % AV.length]!;

  return (
    <div className={`relative overflow-hidden select-none ${turnSpeaking ? 'xm-pulse' : ''}`}
      style={{
        aspectRatio: fill ? undefined : '4/3', width: fill ? '100%' : undefined, height: fill ? '100%' : undefined,
        borderRadius: 14, background: '#0b0b12',
        border: `1.5px solid ${glow === 'transparent' ? 'rgba(255,255,255,0.09)' : glow}`,
        boxShadow: turnSpeaking ? undefined : grabbing ? '0 0 18px #ffcc3388' : isSpeaking ? '0 0 15px #39d98a55' : '0 2px 10px rgba(0,0,0,0.4)',
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
              {isHostTile ? '🎬' : initial}
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
      {grabbing && !turnSpeaking && (
        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-lg font-mono text-[10px] font-bold" style={{ background: '#ffcc33', color: '#000' }}>🎙 ფოლი</div>
      )}
      {!isHostTile && seat!.isNominated && !turnSpeaking && match.phase !== 'finished' && (
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
          <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px #ff0000)' }}>💀</span>
          <span className="font-mono text-[9px] font-black tracking-widest mt-1 px-2 py-0.5 rounded" style={{ color: '#fff', background: `${RED}cc` }}>
            {seat!.eliminatedBy === 'mafia' ? 'მოკლული' : seat!.eliminatedBy === 'fouls' ? '4 ფაული' : 'გარიცხული'}
          </span>
        </div>
      )}
      {canFoul && <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,204,51,0.16)', borderRadius: 14 }}><span className="font-display font-bold text-white text-sm px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.5)' }}>⚠️ +ფაული</span></div>}
    </div>
  );
});

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
  const [foulMode, setFoulMode] = useState(false);
  const [cinematic, setCinematic] = useState<{ type: 'night' | 'morning'; key: number } | null>(null);
  const prevPhase = useRef<string>('');
  const cameraInit = useRef(false);
  const cineKey = useRef(0);
  const wide = useWide(760);

  // Auto-dismiss the cinematic overlay shortly after it appears.
  useEffect(() => { if (!cinematic) return; const t = setTimeout(() => setCinematic(null), 1700); return () => clearTimeout(t); }, [cinematic]);

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
  const canActNight = match.phase === 'night' && match.myAlive && !match.amSpectator;

  // Stable tile factory — passes per-tile props to the module-level SeatTile so
  // it never remounts (which was the source of the video flicker).
  const onFoul = (uid: string) => { SFX.click?.(); haptic('error'); store.giveFoul(uid, 1); };
  const renderSeat = (seat: XmSafeSeat | null, extra: { isHostTile?: boolean; fill?: boolean } = {}) => {
    const uid = extra.isHostTile ? match!.hostId : seat!.userId;
    const grabbing = !extra.isHostTile && match!.floorGrabUserId === uid && match!.floorGrabUntil > now;
    return <SeatTile key={extra.isHostTile ? 'host' : seat!.userId} seat={seat} match={match!} myId={myId}
      stream={streamFor(uid)} isSpeaking={speaking.has(uid)} grabbing={grabbing} foulMode={foulMode} isHost={isHost} speechLeft={speechLeft} onFoul={onFoul} {...extra} />;
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
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {match.phase === 'lobby' && btn(match.seats.length < 4 ? `საჭიროა ${4 - match.seats.length} მოთ.` : '🎬 დაწყება', () => store.start(), true)}
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
        {match.phase === 'vote' && btn('✅ ხმების დათვლა', () => store.endVote(), true)}
        {match.phase === 'last_words' && btn('➡️ გაგრძელება', () => store.endLastWords(), true)}
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
      const consensus = match.mafiaPicks.length > 0 ? (
        <div className="mt-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(255,59,71,0.08)', border: '1px solid rgba(255,59,71,0.22)' }}>
          <p className="font-mono text-[10px] text-white/45 mb-0.5">🔫 გუნდის არჩევანი:</p>
          {match.mafiaPicks.map(p => <p key={p.userId} className="font-mono text-[11px]" style={{ color: '#ff8a92' }}>{p.nickname} → {p.targetName}</p>)}
        </div>
      ) : null;
      if (nightRole === 'sheriff') {
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: '#4fb8ff' }}>🔎 შეამოწმე ერთი მოთამაშე (მაფიაა თუ არა)</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.sheriffCheck} />
          {match.nightPrivate && <p className="text-center font-mono text-[13px] mt-2 text-white">{match.nightPrivate}</p>}</div>);
      }
      if (nightRole === 'don') {
        return (<div className="space-y-2">
          <p className="text-center font-mono text-[11px]" style={{ color: RED }}>🔫 მაფიის მსხვერპლი</p>
          <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
          {consensus}
          <p className="text-center font-mono text-[11px]" style={{ color: '#ffcc33' }}>🎩 შეამოწმე შერიფზე</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.donCheck} />
          {match.nightPrivate && <p className="text-center font-mono text-[13px] text-white">{match.nightPrivate}</p>}</div>);
      }
      if (nightRole === 'mafia') {
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>🔫 აირჩიე მსხვერპლი (მაფიასთან ერთად)</p>
          <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
          {consensus}
          {match.iActedTonight && <p className="text-center font-mono text-[11px] mt-2 text-white/50">✅ არჩევანი გააკეთე</p>}</div>);
      }
      return <p className="text-center font-mono text-[12px] text-white/40 animate-pulse">🌙 ღამეა — თვალები დახუჭე</p>;
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
          <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,204,51,0.15)', color: '#ffcc33', fontVariantNumeric: 'tabular-nums' }}>{fmt(voteLeft)}</span>
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          {match.nominations.map(n => {
            const v = match.voteTally[n.userId] ?? 0;
            const picked = match.myVote === n.userId;
            return (
              <button key={n.userId} onClick={() => { SFX.click?.(); haptic('selection'); store.castVote(n.userId); }}
                className="relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.99]"
                style={{ border: `1.5px solid ${picked ? RED : 'rgba(255,255,255,0.14)'}`, background: 'rgba(255,255,255,0.03)' }}>
                <div className="absolute inset-y-0 left-0" style={{ width: `${(v / total) * 100}%`, background: picked ? `${RED}30` : 'rgba(255,255,255,0.07)', transition: 'width 0.35s ease' }} />
                <div className="relative flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] text-white truncate">#{n.seat} {n.nickname}{picked && ' ✓'}</span>
                  <span className="font-mono text-[14px] font-bold flex-shrink-0" style={{ color: picked ? RED : '#fff', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              </button>
            );
          })}
        </div>
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
    if (match.phase === 'vote') return `კენჭისყრა · ${fmt(voteLeft)}`;
    if (match.phase === 'last_words') return `${match.lastWordsName ?? ''} · ${fmt(lwLeft)}`;
    if (match.phase === 'day_announce') return match.announce ? (match.announce.killedName ? `ღამით მოკლეს: ${match.announce.killedName}` : 'ღამე მშვიდად ჩაიარა') : 'დღე დასრულდა — ღამდება';
    if (match.phase === 'night') return 'ქალაქს სძინავს…';
    if (match.phase === 'assign') return 'როლები დარიგდა';
    return '';
  })();

  // ── Centre-stage ring layout (wide screens, in play) ───────────────────────
  const inPlay = match.phase !== 'lobby' && match.phase !== 'finished';
  // The centre-stage ring only reads well when there are enough players to fill
  // its perimeter; with fewer it looks huge and sparse, so fall back to a tidy
  // centred grid.
  const useRing = wide && inPlay && match.phase !== 'mafia_meet' && match.seats.length >= 8;
  const amMafia = match.myRole === 'mafia' || match.myRole === 'don';
  const mafiaTeam = match.seats.filter(s => s.role === 'mafia' || s.role === 'don');
  const dims = ringDims(match.seats.length);
  const cells = ringCells(dims.cols, dims.rows);
  const place = distribute(match.seats.length, cells.length);

  const stageIcon = intro ? '🤝' : match.phase === 'night' ? '🌙' : match.phase === 'vote' ? '⚖️'
    : match.phase === 'last_words' ? '🎤' : match.phase === 'day_announce' ? (match.announce?.killedName ? '💀' : '🌅')
    : match.phase === 'speech' ? '🗣️' : '🎭';
  const stageBig = match.phase === 'speech' ? fmt(speechLeft) : match.phase === 'vote' ? fmt(voteLeft) : match.phase === 'last_words' ? fmt(lwLeft) : '';
  const nightMood = match.phase === 'night';

  const StageCard = (
    <div className="relative w-full h-full rounded-2xl overflow-hidden flex flex-col items-center justify-between p-3 text-center"
      style={{ background: nightMood ? 'linear-gradient(160deg,#0a1030,#05060f)' : 'linear-gradient(160deg,#25080e,#0a0609)', border: `1.5px solid ${nightMood ? '#3a4a8a66' : RED + '44'}`, boxShadow: 'inset 0 0 44px rgba(0,0,0,0.55)' }}>
      <div>
        <p className="font-mono text-[10px] tracking-[0.25em] text-white/40">რაუნდი {match.round}</p>
        <p className="font-display font-black text-white mt-0.5" style={{ fontSize: 17 }}>{phaseTitle}</p>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <motion.span key={match.phase + stageIcon} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ fontSize: 40 }}>{stageIcon}</motion.span>
        {stageBig && <span className="font-mono font-black" style={{ fontSize: 32, color: RED, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{stageBig}</span>}
        {stageSub && <p className="font-mono text-[12px] mt-1 px-2" style={{ color: 'rgba(255,255,255,0.72)' }}>{stageSub}</p>}
        {match.phase === 'vote' && match.nominations.length > 0 && (
          <p className="font-mono text-[11px] mt-1" style={{ color: '#ffcc33' }}>{match.nominations.map(n => `#${n.seat}:${match.voteTally[n.userId] ?? 0}`).join('  ')}</p>
        )}
      </div>
      {/* host mini-tile */}
      <div className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5" style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ width: 46, height: 34, background: '#0b0b12' }}>
          <VideoTile stream={streamFor(match.hostId)} mirror={match.hostId === myId} muted={match.hostId === myId} />
          {!streamFor(match.hostId) && <div className="absolute inset-0 flex items-center justify-center text-sm">🎬</div>}
        </div>
        <div className="text-left leading-tight min-w-0">
          <p className="font-mono text-[11px] font-bold" style={{ color: RED }}>H · ჰოსტი</p>
          <p className="font-mono text-[10px] truncate" style={{ color: match.hostConnected ? '#7fe0a0' : '#ff6b6b' }}>{match.hostName}{!match.hostConnected && ' · გათიშ.'}</p>
        </div>
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
              <button onClick={() => { SFX.click?.(); setRoleOpen(true); }} className="px-2 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>{XM_ROLE_META[match.myRole].emoji}</button>
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
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {!lkEnabled && match.phase !== 'finished' && <p className="text-center font-mono text-[11px] text-white/40 mb-2">📡 ვიდეო ამ სერვერზე გათიშულია — თამაში ტექსტურ რეჟიმში მიდის</p>}
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
                      border: `2px solid ${rm ? rm.color : claimed ? 'rgba(255,255,255,0.12)' : RED + '66'}`,
                      background: rm ? `linear-gradient(160deg, ${rm.color}22, #0a0609)` : claimed ? 'rgba(255,255,255,0.03)' : 'linear-gradient(160deg, #2a0a10, #12060a)',
                      cursor: canPick ? 'pointer' : 'default',
                      boxShadow: rm ? `0 0 16px ${rm.color}55` : canPick ? `0 4px 14px ${RED}22` : 'none',
                    }}>
                    {rm ? (
                      <motion.div initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} className="flex flex-col items-center px-1">
                        <span style={{ fontSize: 30 }}>{rm.emoji}</span>
                        <span className="font-display font-black mt-1 text-center leading-tight" style={{ fontSize: 12, color: rm.color }}>{rm.label}</span>
                        <span className="font-mono text-[8px] text-white/40 mt-0.5">{rm.team === 'mafia' ? 'მაფია' : 'ქალაქი'}</span>
                      </motion.div>
                    ) : claimed ? (
                      <div className="flex flex-col items-center">
                        <span className="text-2xl opacity-50">🎴</span>
                        <span className="font-mono text-[11px] text-white/50 mt-1">#{c.claimedBySeat}</span>
                      </div>
                    ) : (
                      <span className="font-display font-black" style={{ fontSize: 28, color: `${RED}` }}>?</span>
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
        ) : match.phase === 'night' && (match.amSpectator || !match.myAlive || match.myRole === 'citizen') ? (
          // ── Night for townsfolk: a starry sky while the special roles act ─────
          <div className="min-h-full flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 20%, #0e1638, #05060f 75%)' }}>
            {STARS.map((st, i) => (
              <span key={i} className="absolute rounded-full" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, background: '#fff', animation: `xmTwinkle ${2.4 + st.d}s ease-in-out ${st.d}s infinite`, boxShadow: '0 0 3px #fff' }} />
            ))}
            <motion.div animate={{ y: [0, -7, 0], rotate: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }} style={{ fontSize: 64, filter: 'drop-shadow(0 0 18px rgba(255,220,120,0.5))' }}>🌙</motion.div>
            <p className="font-display font-black text-white mt-3" style={{ fontSize: 22, letterSpacing: 1 }}>ქალაქს სძინავს</p>
            <p className="font-mono text-[12px] mt-1.5" style={{ color: 'rgba(180,200,255,0.6)' }}>დახუჭე თვალები — ღამე მოქმედებს…</p>
            {!match.myAlive && <p className="font-mono text-[11px] mt-4 text-white/30">💀 შენ თამაშიდან გახვედი</p>}
          </div>
        ) : useRing ? (
          // ── Centre-stage table: players ring the stage ──────────────────────
          <div className="min-h-full flex items-center justify-center">
            <div className="w-full" style={{ maxWidth: dims.cols * 186, display: 'grid', gridTemplateColumns: `repeat(${dims.cols}, 1fr)`, gridTemplateRows: `repeat(${dims.rows}, 1fr)`, gap: 8, aspectRatio: `${dims.cols} / ${dims.rows}` }}>
              <div style={{ gridColumn: `2 / ${dims.cols}`, gridRow: `2 / ${dims.rows}` }}>{StageCard}</div>
              {match.seats.map((s, i) => { const cell = cells[place[i]]!; return <div key={s.userId} style={{ gridColumn: cell.col, gridRow: cell.row }}>{renderSeat(s, { fill: true })}</div>; })}
            </div>
          </div>
        ) : match.phase !== 'lobby' ? (
          // ── In-play: 2-column grid that fills the screen; host tile at the bottom ──
          <div className="mx-auto w-full" style={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: wide ? 560 : undefined }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridAutoRows: '1fr', gap: 8, height: '100%', flexShrink: 0 }}>
              {match.seats.map(s => renderSeat(s, { fill: true }))}
            </div>
            <div className="mt-2 mx-auto" style={{ width: '52%', maxWidth: 200 }}>{renderSeat(null, { isHostTile: true })}</div>
          </div>
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

                {/* Role composition (host configurable, others read-only) */}
                <div className="mt-4 max-w-sm mx-auto rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${RED}22` }}>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="font-display font-bold text-white text-[13px]">🎭 როლების შემადგენლობა</p>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: match.roleConfigCustom ? `${RED}22` : 'rgba(255,255,255,0.06)', color: match.roleConfigCustom ? RED : 'rgba(255,255,255,0.5)' }}>{match.roleConfigCustom ? 'მორგებული' : 'ავტო'}</span>
                  </div>
                  {isHost ? (
                    <div className="space-y-2.5">
                      <RoleStepper emoji="🎩" label="დონი" value={match.setup.don} min={0} max={Math.min(2, match.seats.length - match.setup.mafia - match.setup.sheriff)}
                        onChange={d => store.setRoles({ don: clamp(match.setup.don + d, 0, 2), mafia: match.setup.mafia, sheriff: match.setup.sheriff })} />
                      <RoleStepper emoji="🔫" label="მაფია" value={match.setup.mafia} min={0} max={Math.min(9, match.seats.length - match.setup.don - match.setup.sheriff)}
                        onChange={d => store.setRoles({ don: match.setup.don, mafia: clamp(match.setup.mafia + d, 0, 9), sheriff: match.setup.sheriff })} />
                      <RoleStepper emoji="🔎" label="შერიფი" value={match.setup.sheriff} min={0} max={Math.min(2, match.seats.length - match.setup.don - match.setup.mafia)}
                        onChange={d => store.setRoles({ don: match.setup.don, mafia: match.setup.mafia, sheriff: clamp(match.setup.sheriff + d, 0, 2) })} />
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
                      <RoleStepper emoji="⚖️" label="კენჭისყრა" value={match.settings.voteSeconds} min={15} max={120}
                        onChange={d => store.setSettings({ voteSeconds: clamp(match.settings.voteSeconds + d * 5, 15, 120) })} />
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
                    <p className="font-display font-bold text-white text-[13px] mb-2.5">👑 ჰოსტის გადაცემა</p>
                    <div className="space-y-1.5">
                      {match.seats.map(s => (
                        <div key={s.userId} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="font-mono text-[12px] text-white truncate">#{s.seat} {s.nickname}</span>
                          <button onClick={() => { SFX.click?.(); store.transferHost(s.userId); }} className="px-2 py-1 rounded-md font-mono text-[11px] flex-shrink-0" style={{ background: `${RED}22`, border: `1px solid ${RED}44`, color: '#ff8a92' }}>👑 დანიშვნა</button>
                        </div>
                      ))}
                    </div>
                    <p className="font-mono text-[10px] text-white/30 mt-2 text-center">შენ გახდები მოთამაშე, ის — ჰოსტი</p>
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
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}><PlayerPanelReadonly match={match} /></div>
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
        {roleOpen && match.myRole && <RoleCard role={match.myRole} mates={match.seats.filter(s => match.mateIds.includes(s.userId))} note={match.nightPrivate} onClose={() => setRoleOpen(false)} />}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={clearError}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl font-mono text-[12px] z-[580]" style={{ background: 'rgba(255,60,80,0.95)', color: '#fff' }}>{error}</motion.div>
        )}
      </AnimatePresence>

      {/* Leave confirm */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[590] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.8)' }} onClick={() => setConfirmLeave(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(20,10,14,0.99)', border: `1px solid ${RED}44` }}>
              <p className="font-display font-bold text-white text-[15px]">თამაშის დატოვება?</p>
              <p className="font-mono text-[11px] text-white/45 mt-1">{isHost ? 'ჰოსტის გასვლა თამაშს ყველასთვის დაასრულებს.' : 'შენ თამაშიდან გახვალ.'}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>დარჩენა</button>
                <button onClick={() => { setConfirmLeave(false); doLeave(); }} className="flex-1 py-2.5 rounded-xl font-mono text-[12px] text-white" style={{ background: RED }}>გასვლა</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

// Host also sees the live phase context (read-only) so they know what players face.
function PlayerPanelReadonly({ match }: { match: XmSafeState }) {
  if (match.phase === 'night') return <p className="text-center font-mono text-[10px]" style={{ color: match.nightAllActed ? '#7fe0a0' : 'rgba(255,255,255,0.35)' }}>{match.nightAllActed ? '✅ ყველა მზადაა — ღამე ავტომატურად სრულდება' : '🌙 მაფია/შერიფი მოქმედებენ… (ავტომატურად დასრულდება)'}</p>;
  if (match.phase === 'vote') {
    const total = Object.values(match.voteTally).reduce((a, b) => a + b, 0);
    return <p className="text-center font-mono text-[10px] text-white/35">⚖️ მიცემული ხმები: {total} · {match.nominations.map(n => `#${n.seat}:${match.voteTally[n.userId] ?? 0}`).join('  ')}</p>;
  }
  if (match.phase === 'speech') return <p className="text-center font-mono text-[10px] text-white/35">🎙 {match.speechIdx + 1}/{match.speechTotal} {match.introRound ? 'გაცნობა (დასახელების გარეშე)' : `საუბრობს · კენჭზე: ${match.nominations.length}`}</p>;
  return null;
}

function RoleCard({ role, mates, note, onClose }: { role: XmRole; mates: XmSafeSeat[]; note?: string | null; onClose: () => void }) {
  const rm = XM_ROLE_META[role];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[585] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.85)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.85, rotateY: 20 }} animate={{ scale: 1, rotateY: 0 }} exit={{ scale: 0.85 }} onClick={e => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-6 text-center" style={{ background: `linear-gradient(160deg, ${rm.color}22, rgba(16,10,14,0.99))`, border: `1.5px solid ${rm.color}` }}>
        <p className="text-5xl mb-2">{rm.emoji}</p>
        <p className="font-display font-black" style={{ fontSize: 24, color: rm.color }}>{rm.label}</p>
        <p className="font-mono text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{rm.team === 'mafia' ? 'მაფიის გუნდი' : 'ქალაქის გუნდი'}</p>
        <p className="font-mono text-[12px] mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
          {role === 'don' && 'მაფიის ლიდერი. ღამით ირჩევ მსხვერპლს და ამოწმებ, ვინ არის შერიფი.'}
          {role === 'mafia' && 'ღამით მაფიასთან ერთად ირჩევ მსხვერპლს. დღისით შენიღბე.'}
          {role === 'sheriff' && 'ღამით ამოწმებ ერთ მოთამაშეს — მაფიაა თუ არა. იპოვე მაფია.'}
          {role === 'citizen' && 'იპოვე მაფია საუბრით და კენჭისყრით. ხმა შენი იარაღია.'}
        </p>
        {mates.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="font-mono text-[10px] text-white/40 mb-1">შენი გუნდი:</p>
            <p className="font-mono text-[12px]" style={{ color: rm.color }}>{mates.map(m => `#${m.seat} ${m.nickname}`).join(', ')}</p>
          </div>
        )}
        {note && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="font-mono text-[10px] text-white/40 mb-1">შენი ბოლო შემოწმება:</p>
            <p className="font-mono text-[12px] text-white">{note}</p>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl font-display font-bold text-white text-[13px]" style={{ background: rm.color }}>დამალვა</button>
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
      <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-5xl mb-2">{won === 'mafia' ? '🔫' : '🏙'}</motion.p>
      <p className="font-display font-black" style={{ fontSize: 26, color: won === 'mafia' ? RED : '#7fe0a0' }}>
        {won === 'mafia' ? 'მაფია გაიმარჯვა!' : 'ქალაქმა გაიმარჯვა!'}
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
