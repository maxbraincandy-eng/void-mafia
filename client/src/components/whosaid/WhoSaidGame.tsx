/**
 * ვინ თქვა? — one player reads an absurd line aloud, everybody else guesses who.
 *
 * WHY THE MIC MUTING IS THE GAME
 * ──────────────────────────────
 * Every other game here uses voice to talk over. This one makes the voice the
 * thing being played, and that only works if exactly one voice is audible
 * while the line is read. So during the reading phase every client that is not
 * the reader puts itself in listen-only — it is not a nicety, it is the rule:
 * one cough from somebody else and the round is decided.
 *
 * Each client mutes ITSELF. A server that could mute other people's microphones
 * would be a worse thing to have in this product than a leaked round.
 *
 * THE DISGUISE IS THE POINT, SO IT IS ON THE READING SCREEN
 * ────────────────────────────────────────────────────────
 * `VoiceDisguiseButton` already exists for the mafia lobby and ჯაშუში. Here it
 * is not a garnish — it is the move — so it sits next to the line rather than
 * in a corner, and it is offered the moment the reader can see what they have
 * to say.
 *
 * NOTHING IS RECORDED
 * ───────────────────
 * The line is read live and heard live. No audio is captured or uploaded; the
 * server holds a phrase index and some votes and forgets both when the match
 * ends.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { socket } from '@/lib/socket';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';

const ACCENT = '#a855f7';
const GOOD = '#4dd48a';
const BAD = '#ff5d6c';

type Status = 'waiting' | 'reading' | 'voting' | 'reveal' | 'finished';

interface Player {
  userId: string; nickname: string; seat: number;
  connected: boolean; score: number; hasVoted: boolean;
}
interface Reveal {
  readerId: string; readerName: string; phrase: string;
  correct: string[]; fooled: number; points: Record<string, number>;
}
interface State {
  id: string; code: string; hostId: string; status: Status;
  round: number; rounds: number; endsAt: number;
  players: Player[];
  youAreReading: boolean;
  phrase: string | null;
  yourVote: string | null;
  reveal: Reveal | null;
  maxPlayers: number;
}
interface ListItem {
  id: string; code: string; hostName: string;
  players: number; maxPlayers: number; status: Status;
}

export function WhoSaidGame({ onClose, myId, myName }: {
  onClose: () => void;
  myId: string;
  myName: string;
}) {
  const [st, setSt] = useState<State | null>(null);
  const [rooms, setRooms] = useState<ListItem[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isHost = !!st && st.hostId === myId;
  const amReader = !!st?.youAreReading;

  /*
   * Listen-only for everybody but the reader, while the line is being read.
   *
   * This is the whole mechanic. In every other phase the room talks normally —
   * arguing about who it was is most of the fun and all of it happens between
   * the vote and the next round.
   */
  const { enabled: lkEnabled } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: st?.id ? `whosaid_${st.id}` : null,
    identity: myId || null,
    active: lkEnabled && !!st?.id && st.status !== 'finished',
    listenOnly: st?.status === 'reading' && !amReader,
  });

  const apply = useCallback((res: any) => {
    setBusy(false);
    if (!res?.ok) { setError(res?.error ?? 'ვერ მოხერხდა.'); return false; }
    if (res.data) setSt(res.data);
    setError(null);
    return true;
  }, []);

  const refreshRooms = useCallback(() => {
    socket.emit('ws:list' as any, (res: any) => { if (res?.ok) setRooms(res.data); });
  }, []);

  // Rejoin whatever match this player was already in before listing anything.
  useEffect(() => {
    socket.emit('ws:resume' as any, (res: any) => {
      if (res?.ok && res.data) setSt(res.data);
      else refreshRooms();
    });
  }, [refreshRooms]);

  useEffect(() => {
    const onState = (s: State) => setSt(s);
    const onList = (l: ListItem[]) => setRooms(l);
    socket.on('ws:state' as any, onState);
    socket.on('ws:list_update' as any, onList);
    return () => {
      socket.off('ws:state' as any, onState);
      socket.off('ws:list_update' as any, onList);
    };
  }, []);

  const create = () => {
    setBusy(true);
    socket.emit('ws:create' as any, { nickname: myName }, apply);
  };
  const join = (c: string) => {
    setBusy(true);
    socket.emit('ws:join' as any, { code: c, nickname: myName }, apply);
  };
  const start = () => { setBusy(true); socket.emit('ws:start' as any, { matchId: st!.id }, apply); };
  const doneReading = () => { setBusy(true); socket.emit('ws:done_reading' as any, { matchId: st!.id }, apply); };
  const vote = (targetId: string) => { setBusy(true); socket.emit('ws:vote' as any, { matchId: st!.id, targetId }, apply); };
  const next = () => { setBusy(true); socket.emit('ws:next' as any, { matchId: st!.id }, apply); };
  const again = () => { setBusy(true); socket.emit('ws:rematch' as any, { matchId: st!.id }, apply); };
  const leave = () => {
    socket.emit('ws:leave' as any, { matchId: st?.id ?? '' }, () => {});
    setSt(null);
    refreshRooms();
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[730] overflow-y-auto" style={{ background: '#0a0611' }}>
      <div className="min-h-full flex flex-col max-w-lg mx-auto px-4 pb-8">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-5 pb-3">
          <button onClick={st ? leave : onClose} aria-label="დახურვა"
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)' }}>✕</button>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-[16px] truncate">ვინ თქვა?</p>
            <p className="font-mono text-[10.5px] truncate" style={{ color: ACCENT }}>
              {st ? `${st.code} · რაუნდი ${Math.max(1, st.round)}/${st.rounds}` : 'ხმის თამაში · 3-10 მოთამაშე'}
            </p>
          </div>
        </div>

        {/*
          * The voice changer, on its own row and before there is a match.
          *
          * Its own row because the button expands into a picker panel beneath
          * itself, and inside the header's `flex items-center` that panel would
          * land in the row next to the title. `flex-col` is how ჯაშუში does it.
          *
          * Before there is a match because the picker records a couple of
          * seconds and plays them back, and hearing what you sound like for the
          * first time while the room waits on you to read is too late.
          */}
        {lkEnabled && st?.status !== 'finished' && (
          <div className="flex flex-col items-start pb-2">
            <VoiceDisguiseButton unlocked />
          </div>
        )}

        {error && <p className="font-mono text-[12px] pb-2" style={{ color: BAD }}>{error}</p>}

        {st && lkEnabled && st.status !== 'finished' && (
          <div className="pb-2"><LiveKitVoiceBarView voice={lkVoice} /></div>
        )}

        {/* ── The lobby list ───────────────────────────────────────────────── */}
        {!st && (
          <div className="flex-1 py-3">
            <p className="text-5xl text-center mb-3">🎙</p>
            <p className="font-display font-black text-white text-center" style={{ fontSize: 22 }}>
              ერთი კითხულობს, ყველა გამოიცნობს
            </p>
            <p className="font-mono text-[12px] text-white/50 text-center pt-2 pb-5 leading-relaxed">
              კამერა არ არის, მხოლოდ ხმა.<br />
              ერთ მოთამაშეს ფრაზა ეგზავნება — ხმამაღლა კითხულობს,<br />
              ხმის შეცვლას ცდილობს. დანარჩენები გამოიცნობენ ვინ იყო.
            </p>

            <button onClick={create} disabled={busy}
              className="w-full h-12 rounded-2xl font-display font-bold text-[15px] mb-3"
              style={{ background: ACCENT, color: '#0a0611' }}>
              ახალი ოთახი
            </button>

            <div className="flex gap-2 mb-5">
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase().slice(0, 5))}
                placeholder="კოდი" inputMode="text" aria-label="ოთახის კოდი"
                className="flex-1 h-11 rounded-xl px-3 font-mono text-[14px] text-white text-center tracking-widest"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }} />
              <button onClick={() => join(code)} disabled={busy || code.length < 4}
                className="px-5 h-11 rounded-xl font-mono text-[13px]"
                style={{
                  background: code.length >= 4 ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(168,85,247,0.35)', color: '#d8b4fe',
                }}>
                შესვლა
              </button>
            </div>

            <p className="font-mono text-[11px] text-white/40 pb-2">ღია ოთახები</p>
            {(rooms ?? []).filter(r => r.status === 'waiting').map(r => (
              <button key={r.id} onClick={() => join(r.code)} disabled={busy}
                className="w-full flex items-center gap-3 py-3 px-3 rounded-xl mb-2 text-left"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="font-mono text-[13px] tracking-widest" style={{ color: ACCENT }}>{r.code}</span>
                <span className="flex-1 font-display text-[14px] text-white truncate">{r.hostName}</span>
                <span className="font-mono text-[12px] text-white/50">{r.players}/{r.maxPlayers}</span>
              </button>
            ))}
            {rooms !== null && rooms.filter(r => r.status === 'waiting').length === 0 && (
              <p className="font-mono text-[12px] text-white/35 py-6 text-center">
                ღია ოთახი არ არის — შექმენი შენი
              </p>
            )}
          </div>
        )}

        {/* ── Waiting for players ──────────────────────────────────────────── */}
        {st?.status === 'waiting' && (
          <div className="flex-1 py-3">
            <div className="rounded-2xl p-4 mb-4 text-center"
              style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)' }}>
              <p className="font-mono text-[11px] text-white/50">ოთახის კოდი</p>
              <p className="font-display font-black tracking-[0.3em]" style={{ fontSize: 30, color: ACCENT }}>
                {st.code}
              </p>
            </div>
            <PlayerList players={st.players} myId={myId} />
            {isHost ? (
              <button onClick={start} disabled={busy || st.players.filter(p => p.connected).length < 3}
                className="w-full h-12 rounded-2xl font-display font-bold text-[15px] mt-4"
                style={{
                  background: st.players.filter(p => p.connected).length >= 3 ? ACCENT : 'rgba(255,255,255,0.08)',
                  color: st.players.filter(p => p.connected).length >= 3 ? '#0a0611' : 'rgba(255,255,255,0.4)',
                }}>
                {st.players.filter(p => p.connected).length >= 3 ? 'დაწყება' : 'საჭიროა 3 მოთამაშე'}
              </button>
            ) : (
              <p className="font-mono text-[12px] text-white/45 text-center pt-5">
                ველოდებით წამყვანს…
              </p>
            )}
          </div>
        )}

        {/* ── Reading ──────────────────────────────────────────────────────── */}
        {st?.status === 'reading' && (
          <div className="flex-1 flex flex-col py-3">
            <Clock to={st.endsAt} label={amReader ? 'წაიკითხე' : 'უსმინე'} />
            {amReader ? (
              <>
                <div className="rounded-2xl p-5 my-4"
                  style={{ background: 'rgba(168,85,247,0.12)', border: '2px solid rgba(168,85,247,0.45)' }}>
                  <p className="font-mono text-[11px] pb-2" style={{ color: ACCENT }}>
                    შენ კითხულობ — ხმა შეიცვალე
                  </p>
                  <p className="font-display font-bold text-white leading-relaxed" style={{ fontSize: 19 }}>
                    „{st.phrase}"
                  </p>
                </div>
                <p className="font-mono text-[11.5px] text-white/45 text-center leading-relaxed pb-3">
                  სხვების მიკროფონი გამორთულია.<br />ხმამაღლა წაიკითხე ისე, რომ ვერ გიცნონ.
                </p>
                <button onClick={doneReading} disabled={busy}
                  className="w-full h-12 rounded-2xl font-display font-bold text-[15px] mt-auto"
                  style={{ background: ACCENT, color: '#0a0611' }}>
                  წავიკითხე — ხმას მივცეთ
                </button>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center">
                <motion.p className="text-6xl"
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}>👂</motion.p>
                <p className="font-display font-black text-white text-center pt-4" style={{ fontSize: 20 }}>
                  ვიღაც კითხულობს
                </p>
                <p className="font-mono text-[12px] text-white/45 text-center pt-2 leading-relaxed">
                  შენი მიკროფონი გამორთულია.<br />ყური დაუგდე — ვინ არის?
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Voting ───────────────────────────────────────────────────────── */}
        {st?.status === 'voting' && (
          <div className="flex-1 py-3">
            <Clock to={st.endsAt} label="ვინ იყო?" />
            {amReader ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <p className="text-5xl">🤫</p>
                <p className="font-display font-bold text-white text-center pt-4" style={{ fontSize: 18 }}>
                  შენ კითხულობდი
                </p>
                <p className="font-mono text-[12px] text-white/45 text-center pt-2">
                  ახლა გამოიცნობენ. ხმას ვერ აძლევ.
                </p>
              </div>
            ) : (
              <div className="pt-3">
                {st.players.filter(p => p.userId !== myId).map(p => {
                  const picked = st.yourVote === p.userId;
                  return (
                    <button key={p.userId} onClick={() => vote(p.userId)} disabled={busy}
                      className="w-full flex items-center gap-3 py-3.5 px-3 rounded-xl mb-2 text-left"
                      style={{
                        background: picked ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${picked ? ACCENT : 'rgba(255,255,255,0.1)'}`,
                        opacity: p.connected ? 1 : 0.45,
                      }}>
                      <span className="flex-1 font-display text-[15px] text-white truncate">{p.nickname}</span>
                      {picked && <span style={{ color: ACCENT }}>✓</span>}
                    </button>
                  );
                })}
                <p className="font-mono text-[11px] text-white/35 text-center pt-2">
                  {st.players.filter(p => p.hasVoted).length} მოთამაშემ მისცა ხმა
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Reveal ───────────────────────────────────────────────────────── */}
        {st?.status === 'reveal' && st.reveal && (
          <div className="flex-1 py-3">
            <div className="rounded-2xl p-5 mb-4 text-center"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="font-mono text-[11px] text-white/45">კითხულობდა</p>
              <p className="font-display font-black" style={{ fontSize: 26, color: ACCENT }}>
                {st.reveal.readerName}
              </p>
              <p className="font-mono text-[12.5px] text-white/60 pt-3 leading-relaxed">
                „{st.reveal.phrase}"
              </p>
              <p className="font-mono text-[12px] pt-3"
                style={{ color: st.reveal.correct.length ? GOOD : BAD }}>
                {st.reveal.correct.length
                  ? `${st.reveal.correct.length} მოთამაშემ გამოიცნო`
                  : 'ვერავინ გამოიცნო!'}
                {st.reveal.fooled > 0 && ` · ${st.reveal.fooled} მოატყუა`}
              </p>
            </div>
            <PlayerList players={st.players} myId={myId}
              points={st.reveal.points} readerId={st.reveal.readerId} />
            {isHost && (
              <button onClick={next} disabled={busy}
                className="w-full h-12 rounded-2xl font-display font-bold text-[15px] mt-4"
                style={{ background: ACCENT, color: '#0a0611' }}>
                {st.round >= st.rounds ? 'შედეგები' : 'შემდეგი რაუნდი'}
              </button>
            )}
            {!isHost && (
              <p className="font-mono text-[12px] text-white/45 text-center pt-5">
                ველოდებით წამყვანს…
              </p>
            )}
          </div>
        )}

        {/* ── Finished ─────────────────────────────────────────────────────── */}
        {st?.status === 'finished' && (
          <div className="flex-1 py-3">
            <p className="text-5xl text-center mb-3">🏆</p>
            <p className="font-display font-black text-white text-center pb-4" style={{ fontSize: 22 }}>
              დასრულდა
            </p>
            <PlayerList players={[...st.players].sort((a, b) => b.score - a.score)} myId={myId} rank />
            <div className="flex gap-2 pt-4">
              {isHost && (
                <button onClick={again} disabled={busy}
                  className="flex-1 h-12 rounded-2xl font-display font-bold text-[15px]"
                  style={{ background: ACCENT, color: '#0a0611' }}>
                  კიდევ
                </button>
              )}
              <button onClick={leave}
                className="flex-1 h-12 rounded-2xl font-mono text-[13px] text-white/80"
                style={{ background: 'rgba(255,255,255,0.1)' }}>
                გასვლა
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

/** The table, with scores and — after a round — what each player just earned. */
function PlayerList({ players, myId, points, readerId, rank }: {
  players: Player[]; myId: string;
  points?: Record<string, number>; readerId?: string; rank?: boolean;
}) {
  return (
    <div>
      {players.map((p, i) => {
        const gained = points?.[p.userId] ?? 0;
        return (
          <div key={p.userId} className="flex items-center gap-3 py-2.5 px-3 rounded-xl mb-1.5"
            style={{
              background: p.userId === myId ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${p.userId === myId ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)'}`,
              opacity: p.connected ? 1 : 0.45,
            }}>
            {rank && <span className="font-mono text-[12px] text-white/40 w-5">{i + 1}</span>}
            <span className="flex-1 font-display text-[14.5px] text-white truncate">
              {p.nickname}
              {readerId === p.userId && <span className="pl-1.5" style={{ color: ACCENT }}>🎙</span>}
            </span>
            {gained > 0 && (
              <span className="font-mono text-[12px] font-bold" style={{ color: GOOD }}>+{gained}</span>
            )}
            <span className="font-mono text-[14px] font-bold text-white w-7 text-right">{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The phase clock.
 *
 * Counted down from `endsAt` rather than from a duration, so a player who
 * joined late or whose tab was asleep sees the time that is actually left
 * rather than a fresh full bar.
 */
function Clock({ to, label }: { to: number; label: string }) {
  const [left, setLeft] = useState(() => Math.max(0, to - Date.now()));
  const total = useRef(Math.max(1, to - Date.now()));
  useEffect(() => {
    total.current = Math.max(1, to - Date.now());
    setLeft(Math.max(0, to - Date.now()));
    const id = setInterval(() => setLeft(Math.max(0, to - Date.now())), 200);
    return () => clearInterval(id);
  }, [to]);
  const pct = Math.max(0, Math.min(100, (left / total.current) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between pb-1.5">
        <span className="font-mono text-[11px] text-white/50">{label}</span>
        <span className="font-display font-bold text-white text-[15px]">{Math.ceil(left / 1000)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full"
          style={{ width: `${pct}%`, background: ACCENT, transition: 'width .2s linear' }} />
      </div>
    </div>
  );
}

export default WhoSaidGame;
