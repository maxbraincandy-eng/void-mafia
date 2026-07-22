import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
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

export function SxvaMafiaGame() {
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const store = useSxvaMafiaStore();
  const { match, leaveMatch, error, clearError } = store;

  const [now, setNow] = useState(Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
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
  const listenOnly = !!match && (match.amSpectator || (!match.amHost && !match.myAlive) || (floorControl && !iHoldFloor && !match.amHost));
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
      // Right after roles are dealt, pop each player's card so they see it first.
      if (p === 'assign' && match.myRole) setRoleOpen(true);
      prevPhase.current = p;
    }
  }, [match?.phase]);

  if (!match) return null;

  const isHost = match.amHost;
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

  // ── Video tile ────────────────────────────────────────────────────────────
  function Tile({ seat, isHostTile, fill }: { seat: XmSafeSeat | null; isHostTile?: boolean; fill?: boolean }) {
    const uid = isHostTile ? match!.hostId : seat!.userId;
    const name = isHostTile ? match!.hostName : seat!.nickname;
    const stream = streamFor(uid);
    const isMe = uid === myId;
    const isSpk = speaking.has(uid);
    const turnSpeaking = !isHostTile && seat!.isSpeaking && match!.phase === 'speech';
    const dead = !isHostTile && !seat!.alive;
    const mate = !isHostTile && match!.mateIds.includes(uid);
    const rm = seat?.role ? XM_ROLE_META[seat.role] : null;
    const conn = isHostTile ? match!.hostConnected : seat!.connected;

    const glow = turnSpeaking ? RED : isSpk ? '#39d98a' : mate ? '#ff6b6b' : 'transparent';
    const canFoul = isHost && foulMode && !isHostTile && seat!.alive;

    return (
      <div className="relative rounded-xl overflow-hidden select-none"
        style={{
          aspectRatio: fill ? undefined : '4/3', width: fill ? '100%' : undefined, height: fill ? '100%' : undefined,
          background: '#0b0b12',
          border: `2px solid ${glow === 'transparent' ? 'rgba(255,255,255,0.08)' : glow}`,
          boxShadow: turnSpeaking ? `0 0 22px ${RED}88` : isSpk ? '0 0 16px #39d98a66' : 'none',
          opacity: dead ? 0.5 : 1,
          cursor: canFoul ? 'pointer' : 'default',
        }}
        onClick={() => { if (canFoul) { SFX.click?.(); haptic('error'); store.giveFoul(seat!.userId, 1); } }}>
        <VideoTile stream={stream} mirror={isMe} muted={isMe} />
        {!stream && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(circle at 50% 40%, #1a1522, #0b0b12)' }}>
            <span className="text-3xl opacity-60">{isHostTile ? '🎬' : dead ? '💀' : '🎥'}</span>
          </div>
        )}

        {/* seat number / host badge */}
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold"
          style={{ background: isHostTile ? `${RED}dd` : 'rgba(0,0,0,0.6)', color: '#fff' }}>
          {isHostTile ? 'H · ჰოსტი' : `#${seat!.seat}`}
        </div>

        {/* speaking countdown ring */}
        {turnSpeaking && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold"
            style={{ background: RED, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(speechLeft)}</div>
        )}

        {/* fouls */}
        {!isHostTile && seat!.fouls > 0 && !dead && (
          <div className="absolute bottom-1 right-1 flex gap-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="w-2 h-2 rounded-full" style={{ background: i < seat!.fouls ? '#ffcc33' : 'rgba(255,255,255,0.18)' }} />
            ))}
          </div>
        )}

        {/* name + role */}
        <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 flex items-center gap-1"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>
          {!conn && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
          <span className="font-mono text-[10px] text-white truncate flex-1">{name}{isMe && ' (შენ)'}</span>
          {rm && <span className="text-[11px] flex-shrink-0" title={rm.label}>{rm.emoji}</span>}
        </div>

        {/* nomination flag */}
        {!isHostTile && seat!.isNominated && match!.phase !== 'finished' && (
          <div className="absolute top-1 right-1 px-1 py-0.5 rounded font-mono text-[9px] font-bold" style={{ background: '#ffcc33', color: '#000' }}>კენჭზე</div>
        )}

        {/* eliminated overlay */}
        {dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(120,0,10,0.35)' }}>
            <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 6px #ff0000)' }}>💀</span>
            <span className="font-mono text-[9px] font-black tracking-widest mt-0.5" style={{ color: RED }}>
              {seat!.eliminatedBy === 'mafia' ? 'მოკლული' : seat!.eliminatedBy === 'fouls' ? '4 ფაული' : 'გარიცხული'}
            </span>
          </div>
        )}

        {canFoul && <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,204,51,0.14)' }}><span className="text-lg">⚠️ +ფაული</span></div>}
      </div>
    );
  }

  // ── target chips for actions ────────────────────────────────────────────────
  const Chips = ({ seats, onPick, active }: { seats: XmSafeSeat[]; onPick: (uid: string) => void; active?: string | null }) => (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {seats.map(s => (
        <button key={s.userId} onClick={() => { SFX.click?.(); haptic('selection'); onPick(s.userId); }}
          className="px-2.5 py-1.5 rounded-lg font-mono text-[12px] transition-all active:scale-95"
          style={{ background: active === s.userId ? `${RED}33` : 'rgba(255,255,255,0.05)', border: `1px solid ${active === s.userId ? RED : 'rgba(255,255,255,0.14)'}`, color: '#fff' }}>
          #{s.seat} {s.nickname}
        </button>
      ))}
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
        {match.phase === 'assign' && <>{btn('🔀 თავიდან არევა', () => store.reshuffle())}{btn('🌙 პირველი ღამე', () => store.beginMeet(), true)}</>}
        {match.phase === 'mafia_meet' && btn('🔫 ღამის მოქმედება', () => store.endMeet(), true)}
        {match.phase === 'night' && btn('☀️ ღამის დასრულება', () => store.endNight(), true)}
        {match.phase === 'day_announce' && btn('🗣 საუბრების დაწყება', () => store.beginDay(), true)}
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
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: '#4fb8ff' }}>🔎 შეამოწმე ერთი მოთამაშე (მაფიაა თუ არა) · {fmt(nightLeft)}</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.sheriffCheck} />
          {match.nightPrivate && <p className="text-center font-mono text-[13px] mt-2 text-white">{match.nightPrivate}</p>}</div>);
      }
      if (nightRole === 'don') {
        return (<div className="space-y-2">
          <p className="text-center font-mono text-[11px]" style={{ color: RED }}>🔫 მაფიის მსხვერპლი · {fmt(nightLeft)}</p>
          <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
          {consensus}
          <p className="text-center font-mono text-[11px]" style={{ color: '#ffcc33' }}>🎩 შეამოწმე შერიფზე</p>
          <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.donCheck} />
          {match.nightPrivate && <p className="text-center font-mono text-[13px] text-white">{match.nightPrivate}</p>}</div>);
      }
      if (nightRole === 'mafia') {
        return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>🔫 აირჩიე მსხვერპლი (მაფიასთან ერთად) · {fmt(nightLeft)}</p>
          <Chips seats={aliveSeats.filter(s => !match.mateIds.includes(s.userId) && s.userId !== myId)} onPick={store.mafiaVote} />
          {consensus}
          {match.iActedTonight && <p className="text-center font-mono text-[11px] mt-2 text-white/50">✅ არჩევანი გააკეთე</p>}</div>);
      }
      return <p className="text-center font-mono text-[12px] text-white/40 animate-pulse">🌙 ღამეა — თვალები დახუჭე</p>;
    }

    if (match.phase === 'speech') {
      const myTurn = match.speakingUserId === myId;
      if (myTurn) return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: RED }}>🗣 შენი წუთია ({fmt(speechLeft)}) — დაასახელე კენჭისყრაზე (არჩევითი)</p>
        <Chips seats={aliveSeats.filter(s => s.userId !== myId)} onPick={store.nominate} />
        {match.iNominated && <p className="text-center font-mono text-[11px] mt-2 text-white/50">დაასახელე ✓</p>}</div>);
      const spk = match.seats.find(s => s.userId === match.speakingUserId);
      return <p className="text-center font-mono text-[12px] text-white/50">🗣 საუბრობს #{spk?.seat} {spk?.nickname} — {fmt(speechLeft)}</p>;
    }

    if (match.phase === 'vote') {
      return (<div><p className="text-center font-mono text-[11px] mb-2" style={{ color: '#ffcc33' }}>{match.voteRevote ? '🔁 ხელახალი კენჭისყრა (ხმები გაიყო)' : '⚖️ ვის გავრიცხავთ?'} ({fmt(voteLeft)})</p>
        <div className="flex flex-wrap gap-1.5 justify-center">
          {match.nominations.map(n => (
            <button key={n.userId} onClick={() => { SFX.click?.(); haptic('selection'); store.castVote(n.userId); }}
              className="px-3 py-1.5 rounded-lg font-mono text-[12px] active:scale-95"
              style={{ background: match.myVote === n.userId ? `${RED}33` : 'rgba(255,255,255,0.05)', border: `1px solid ${match.myVote === n.userId ? RED : 'rgba(255,255,255,0.14)'}`, color: '#fff' }}>
              #{n.seat} {n.nickname} · {match.voteTally[n.userId] ?? 0}
            </button>
          ))}
        </div></div>);
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
    if (match.phase === 'speech') { const s = match.seats.find(x => x.userId === match.speakingUserId); return s ? `#${s.seat} ${s.nickname} საუბრობს · ${fmt(speechLeft)}` : ''; }
    if (match.phase === 'vote') return `კენჭისყრა · ${fmt(voteLeft)}`;
    if (match.phase === 'last_words') return `${match.lastWordsName ?? ''} · ${fmt(lwLeft)}`;
    if (match.phase === 'day_announce') return match.announce?.killedName ? `ღამით მოკლეს: ${match.announce.killedName}` : 'ღამე მშვიდად ჩაიარა';
    if (match.phase === 'night') return 'ქალაქს სძინავს…';
    if (match.phase === 'assign') return 'როლები დარიგდა';
    return '';
  })();

  // ── Centre-stage ring layout (wide screens, in play) ───────────────────────
  const inPlay = match.phase !== 'lobby' && match.phase !== 'finished';
  const useRing = wide && inPlay && match.phase !== 'mafia_meet' && match.seats.length >= 4;
  const amMafia = match.myRole === 'mafia' || match.myRole === 'don';
  const mafiaTeam = match.seats.filter(s => s.role === 'mafia' || s.role === 'don');
  const dims = ringDims(match.seats.length);
  const cells = ringCells(dims.cols, dims.rows);
  const place = distribute(match.seats.length, cells.length);

  const stageIcon = match.phase === 'night' ? '🌙' : match.phase === 'vote' ? '⚖️'
    : match.phase === 'last_words' ? '🎤' : match.phase === 'day_announce' ? (match.announce?.killedName ? '💀' : '🌅')
    : match.phase === 'speech' ? '🗣️' : '🎭';
  const stageBig = match.phase === 'speech' ? fmt(speechLeft) : match.phase === 'vote' ? fmt(voteLeft) : match.phase === 'last_words' ? fmt(lwLeft) : match.phase === 'night' ? fmt(nightLeft) : '';
  const nightMood = match.phase === 'night';

  const StageCard = (
    <div className="relative w-full h-full rounded-2xl overflow-hidden flex flex-col items-center justify-between p-3 text-center"
      style={{ background: nightMood ? 'linear-gradient(160deg,#0a1030,#05060f)' : 'linear-gradient(160deg,#25080e,#0a0609)', border: `1.5px solid ${nightMood ? '#3a4a8a66' : RED + '44'}`, boxShadow: 'inset 0 0 44px rgba(0,0,0,0.55)' }}>
      <div>
        <p className="font-mono text-[10px] tracking-[0.25em] text-white/40">რაუნდი {match.round}</p>
        <p className="font-display font-black text-white mt-0.5" style={{ fontSize: 17 }}>{PHASE_LABEL[match.phase]}</p>
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
      style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -5%, #2a0a10 0%, #08060a 60%)', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2" style={{ borderBottom: `1px solid ${RED}22` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-black text-white leading-none" style={{ fontSize: 15 }}>სხვა მაფია 🎭</p>
            <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <span style={{ color: RED, letterSpacing: 2 }}>{match.code}</span>
              {match.phase !== 'lobby' && <> · რაუნდი {match.round} · {PHASE_LABEL[match.phase]}</>}
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
      {!useRing && match.phase !== 'lobby' && match.phase !== 'finished' && match.phase !== 'mafia_meet' && (
        <div className="flex-shrink-0 px-4 py-2 text-center" style={{ background: match.phase === 'night' ? 'rgba(10,10,40,0.5)' : 'rgba(255,59,71,0.06)' }}>
          <p className="font-display font-bold text-white" style={{ fontSize: 15 }}>{stageIcon} {PHASE_LABEL[match.phase]}</p>
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
                <div className="mt-5 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${Math.min(mafiaTeam.length, 3)}, 1fr)`, maxWidth: mafiaTeam.length <= 2 ? 320 : 480, marginInline: 'auto' }}>
                  {mafiaTeam.map(s => {
                    const rm = XM_ROLE_META[s.role!];
                    const isMe = s.userId === myId;
                    return (
                      <motion.div key={s.userId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="relative rounded-xl overflow-hidden" style={{ aspectRatio: '3/4', background: '#0b0b12', border: `2px solid ${rm.color}`, boxShadow: `0 0 18px ${rm.color}55` }}>
                        <VideoTile stream={streamFor(s.userId)} mirror={isMe} muted={isMe} />
                        {!streamFor(s.userId) && <div className="absolute inset-0 flex items-center justify-center text-3xl opacity-70">{rm.emoji}</div>}
                        <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)' }}>
                          <p className="font-mono text-[11px] text-white truncate">#{s.seat} {s.nickname}{isMe && ' (შენ)'}</p>
                          <p className="font-mono text-[10px]" style={{ color: rm.color }}>{rm.emoji} {rm.label}</p>
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
        ) : useRing ? (
          // ── Centre-stage table: players ring the stage ──────────────────────
          <div className="min-h-full flex items-center justify-center">
            <div className="w-full" style={{ maxWidth: dims.cols * 208, display: 'grid', gridTemplateColumns: `repeat(${dims.cols}, 1fr)`, gridTemplateRows: `repeat(${dims.rows}, 1fr)`, gap: 8, aspectRatio: `${dims.cols} / ${dims.rows}` }}>
              <div style={{ gridColumn: `2 / ${dims.cols}`, gridRow: `2 / ${dims.rows}` }}>{StageCard}</div>
              {match.seats.map((s, i) => { const cell = cells[place[i]]!; return <div key={s.userId} style={{ gridColumn: cell.col, gridRow: cell.row }}><Tile seat={s} fill /></div>; })}
            </div>
          </div>
        ) : (
          // ── Compact grid (narrow screens & lobby) ───────────────────────────
          <div className="max-w-4xl mx-auto">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
              <Tile seat={null} isHostTile />
              {match.seats.map(s => <Tile key={s.userId} seat={s} />)}
            </div>
            {match.phase === 'lobby' && (
              <>
                <p className="text-center font-mono text-[12px] text-white/40 mt-4">
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {match.phase !== 'finished' && (
        <div className="flex-shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] pt-2" style={{ borderTop: `1px solid ${RED}22`, background: 'rgba(0,0,0,0.3)' }}>
          <div className="max-w-2xl mx-auto">
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
  if (match.phase === 'speech') return <p className="text-center font-mono text-[10px] text-white/35">🎙 {match.speechIdx + 1}/{match.speechTotal} საუბრობს · კენჭზე: {match.nominations.length}</p>;
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
