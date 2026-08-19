import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useLiesStore } from '@/store/liesStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';

/**
 * ტყუილების ოსტატი (Master of Lies) — social bluffing overlay. The game shows a
 * trivia prompt with a blank; everyone writes a fake answer, then hunts for the
 * real one among the lies. Score for finding the truth and for fooling others.
 * Prop-less full-screen overlay reading the store (like SpyfallGame/UnoGame).
 */

const ACCENT = '#a855f7';

function fmtTime(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function LiesGame() {
  const profile = useAuthStore(s => s.profile);
  const { match, leaveMatch, startMatch, submitBluff, clearRejected, guess, nextRound, rematch, error, clearError } = useLiesStore();

  const [now, setNow] = useState(Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const prevStatus = useRef<string>('');
  const prevRound = useRef<number>(0);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, []);

  /*
   * Voice, on the same footing as mafia and spyfall.
   *
   * A bluffing game is played by talking: the whole skill is selling a lie out
   * loud and hearing the hesitation in somebody else's answer, and reading that
   * off typed text is a different, much duller game. One LiveKit room per
   * match, joined for as long as the match is live.
   */
  const { enabled: livekitEnabled } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: match?.id ? `lies_${match.id}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!match?.id && match?.status !== 'finished',
    listenOnly: false,
  });

  // SFX + per-phase resets on transitions
  useEffect(() => {
    if (!match) return;
    if (match.status === 'writing' && prevStatus.current !== 'writing') { SFX.gameStart?.(); haptic('success'); setDraft(''); }
    if (match.status === 'guessing' && prevStatus.current === 'writing') { SFX.voteStart?.(); haptic('heavy'); }
    if (match.status === 'reveal' && prevStatus.current === 'guessing') { SFX.gameOver?.(); haptic('success'); }
    if (match.status === 'finished' && prevStatus.current && prevStatus.current !== 'finished') SFX.gameOver?.();
    prevStatus.current = match.status;
    prevRound.current = match.round;
  }, [match?.status, match?.round]);

  if (!match) return null;

  const me = match.players.find(p => p.userId === match.myUserId) ?? null;
  const isHost = match.hostId === match.myUserId;
  const secLeft = match.endsAt ? Math.round((match.endsAt - now) / 1000) : 0;
  const sorted = [...match.players].sort((a, b) => b.score - a.score);

  const doLeave = () => { SFX.click?.(); leaveMatch(); };

  const sendBluff = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const res = await submitBluff(text);
    setSubmitting(false);
    if (res === 'rejected_truth') { haptic('error'); }
    else if (res === 'ok') { SFX.click?.(); haptic('selection'); setDraft(''); }
  };

  const retryBluff = () => { clearRejected(); setDraft(''); };

  return createPortal(
    <motion.div className="fixed inset-0 z-[540] flex flex-col select-none"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'radial-gradient(ellipse 90% 55% at 50% -5%, #241145 0%, #0a0714 62%)', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2.5" style={{ borderBottom: `1px solid ${ACCENT}22` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display font-black text-white leading-none" style={{ fontSize: 16 }}>ტყუილების ოსტატი 🎭</p>
            <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              კოდი <span style={{ color: ACCENT, letterSpacing: 2 }}>{match.code}</span>
              {match.status !== 'waiting' && match.status !== 'finished' && <> · რაუნდი {match.round}/{match.settings.rounds}</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(match.status === 'writing' || match.status === 'guessing') && (
              <span className="font-mono text-[13px] px-2.5 py-1 rounded-lg" style={{ color: secLeft <= 10 ? '#ff6b6b' : '#fff', background: 'rgba(255,255,255,0.06)', fontVariantNumeric: 'tabular-nums' }}>
                ⏱ {fmtTime(secLeft)}
              </span>
            )}
            <button onClick={() => setConfirmLeave(true)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
          </div>
        </div>
      </div>

      {/* Voice — the bar, and the verified voice changer beside it. */}
      {livekitEnabled && match.status !== 'finished' && (
        <div className="px-3 pt-2 flex-shrink-0 flex flex-col gap-2">
          <LiveKitVoiceBarView voice={lkVoice} />
          <div className="flex flex-col items-start"><VoiceDisguiseButton /></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="max-w-xl mx-auto">
          <AnimatePresence mode="wait">

            {/* ── WAITING / LOBBY ──────────────────────────────────────── */}
            {match.status === 'waiting' && (
              <motion.div key="wait" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="rounded-2xl p-4 mb-4" style={{ background: `${ACCENT}0d`, border: `1px solid ${ACCENT}33` }}>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
                    სისტემა გაჩვენებთ კითხვას გამოტოვებული პასუხით. თითოეული თქვენგანი წერს <b style={{ color: ACCENT }}>ყალბ პასუხს</b> — ტყუილს, რომ სხვები მოატყუოს.
                    შემდეგ ყველა ეძებს <b style={{ color: '#7fe0a0' }}>ნამდვილ პასუხს</b> ტყუილებს შორის.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <span>🎯 ნამდვილის პოვნა: <b style={{ color: '#7fe0a0' }}>+1000</b></span>
                    <span>😈 ვინც შენს ტყუილს აირჩევს: <b style={{ color: ACCENT }}>+500</b></span>
                  </div>
                </div>

                <p className="font-mono text-[11px] uppercase tracking-widest text-white/35 mb-2">მოთამაშეები {match.players.length}/{match.maxPlayers}</p>
                <div className="space-y-1.5">
                  {sorted.map(p => (
                    <div key={p.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-lg">{p.userId === match.hostId ? '👑' : '🎭'}</span>
                      <span className="flex-1 font-mono text-[13px] text-white truncate">{p.nickname}{p.userId === match.myUserId && ' (შენ)'}</span>
                      {!p.connected && <span className="font-mono text-[10px] text-white/25">გასული</span>}
                    </div>
                  ))}
                </div>

                {isHost ? (
                  <button onClick={() => { SFX.click?.(); startMatch(); }} disabled={match.players.length < 3}
                    className="mt-5 w-full py-3.5 rounded-2xl font-display font-bold text-white text-[15px] disabled:opacity-40"
                    style={{ background: `linear-gradient(135deg, ${ACCENT}, #6d28d9)` }}>
                    {match.players.length < 3 ? `საჭიროა კიდევ ${3 - match.players.length} მოთამაშე` : '🚀 დაწყება'}
                  </button>
                ) : (
                  <p className="mt-5 text-center font-mono text-[12px] text-white/40 animate-pulse">ველოდებით, სანამ ჰოსტი დაიწყებს…</p>
                )}
              </motion.div>
            )}

            {/* ── WRITING ──────────────────────────────────────────────── */}
            {match.status === 'writing' && (
              <motion.div key="write" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-center mb-3" style={{ color: `${ACCENT}cc` }}>{match.category}</p>
                <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: `${ACCENT}0f`, border: `1px solid ${ACCENT}40`, boxShadow: `0 6px 30px ${ACCENT}14` }}>
                  <p className="font-display font-bold text-white" style={{ fontSize: 19, lineHeight: 1.35 }}>{match.prompt}</p>
                </div>

                {me?.done ? (
                  <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(127,224,160,0.08)', border: '1px solid rgba(127,224,160,0.3)' }}>
                    <p className="text-3xl mb-2">✅</p>
                    <p className="font-display font-bold text-white text-[15px]">შენი ტყუილი გაიგზავნა!</p>
                    <p className="font-mono text-[12px] text-white/50 mt-1 truncate">„{match.myBluff}"</p>
                    <p className="font-mono text-[11px] text-white/40 mt-3 animate-pulse">ველოდებით სხვებს… ({match.players.filter(p => p.done).length}/{match.players.filter(p => p.connected).length})</p>
                  </div>
                ) : match.bluffRejected ? (
                  <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.35)' }}>
                    <p className="text-3xl mb-2">🤨</p>
                    <p className="font-display font-bold text-white text-[15px]">ეს ხომ ნამდვილი პასუხია!</p>
                    <p className="font-mono text-[12px] text-white/55 mt-1">კარგი მცდელობაა, მაგრამ სხვა ტყუილი მოიფიქრე.</p>
                    <button onClick={retryBluff} className="mt-3 px-6 py-2 rounded-xl font-display font-bold text-white text-[13px]" style={{ background: `linear-gradient(135deg, ${ACCENT}, #6d28d9)` }}>ხელახლა</button>
                  </div>
                ) : (
                  <div>
                    <p className="font-mono text-[11px] text-white/45 mb-2">✍️ დაწერე დამაჯერებელი ტყუილი, რომ სხვები მოატყუო:</p>
                    <textarea value={draft} onChange={e => setDraft(e.target.value.slice(0, 60))} maxLength={60}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBluff(); } }}
                      placeholder="შენი ყალბი პასუხი…" rows={2} autoFocus
                      className="w-full bg-transparent font-display text-white text-[16px] placeholder-white/25 outline-none px-4 py-3 rounded-2xl resize-none"
                      style={{ border: `1px solid ${ACCENT}44`, background: 'rgba(255,255,255,0.03)' }} />
                    <div className="flex items-center justify-between mt-1">
                      <span className="font-mono text-[10px] text-white/25">{draft.length}/60</span>
                    </div>
                    <button onClick={sendBluff} disabled={!draft.trim() || submitting}
                      className="mt-2 w-full py-3.5 rounded-2xl font-display font-bold text-white text-[15px] disabled:opacity-40"
                      style={{ background: `linear-gradient(135deg, ${ACCENT}, #6d28d9)` }}>
                      {submitting ? '…' : '😈 ტყუილის გაგზავნა'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── GUESSING ─────────────────────────────────────────────── */}
            {match.status === 'guessing' && match.options && (
              <motion.div key="guess" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-center mb-3" style={{ color: `${ACCENT}cc` }}>{match.category}</p>
                <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: `${ACCENT}0f`, border: `1px solid ${ACCENT}40` }}>
                  <p className="font-display font-bold text-white" style={{ fontSize: 17, lineHeight: 1.35 }}>{match.prompt}</p>
                </div>

                {me?.done ? (
                  <div className="rounded-2xl p-4 text-center mb-3" style={{ background: 'rgba(127,224,160,0.06)', border: '1px solid rgba(127,224,160,0.25)' }}>
                    <p className="font-display font-bold text-white text-[14px]">✅ არჩევანი გააკეთე</p>
                    <p className="font-mono text-[11px] text-white/40 mt-1 animate-pulse">ველოდებით სხვებს… ({match.players.filter(p => p.done).length}/{match.players.filter(p => p.connected).length})</p>
                  </div>
                ) : (
                  <p className="font-mono text-[12px] text-center text-white/55 mb-3">🕵️ რომელია ნამდვილი პასუხი?</p>
                )}

                <div className="space-y-2">
                  {match.options.map(o => {
                    const picked = match.myGuess === o.id;
                    return (
                      <button key={o.id} disabled={o.mine || me?.done} onClick={() => { SFX.click?.(); haptic('selection'); guess(o.id); }}
                        className="w-full text-left px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98] disabled:cursor-not-allowed"
                        style={{
                          background: picked ? `${ACCENT}22` : o.mine ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.04)',
                          border: picked ? `1.5px solid ${ACCENT}` : `1px solid ${o.mine ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'}`,
                          opacity: o.mine ? 0.5 : 1,
                        }}>
                        <span className="font-display text-white text-[15px]">{o.text}</span>
                        {o.mine && <span className="ml-2 font-mono text-[10px]" style={{ color: ACCENT }}>(შენი ტყუილი)</span>}
                        {picked && <span className="ml-2">✅</span>}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── REVEAL ───────────────────────────────────────────────── */}
            {match.status === 'reveal' && match.reveal && (
              <motion.div key="reveal" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className="rounded-2xl p-4 mb-4 text-center" style={{ background: 'rgba(127,224,160,0.08)', border: '1px solid rgba(127,224,160,0.35)' }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/40 mb-1">ნამდვილი პასუხი</p>
                  <p className="font-display font-black" style={{ fontSize: 20, color: '#7fe0a0' }}>{match.reveal.truth}</p>
                </div>

                <div className="space-y-2">
                  {match.reveal.entries.map(e => (
                    <div key={e.optionId} className="rounded-2xl px-4 py-3" style={{
                      background: e.isTruth ? 'rgba(127,224,160,0.08)' : 'rgba(255,255,255,0.03)',
                      border: e.isTruth ? '1px solid rgba(127,224,160,0.4)' : '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <div className="flex items-center gap-2">
                        <span>{e.isTruth ? '🎯' : '😈'}</span>
                        <span className="font-display font-bold text-white text-[15px] flex-1">{e.text}</span>
                      </div>
                      <p className="font-mono text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {e.isTruth ? 'ნამდვილი პასუხი' : e.authorNames.length ? `ტყუილი: ${e.authorNames.join(', ')}` : 'ტყუილი'}
                      </p>
                      {e.pickedBy.length > 0 && (
                        <p className="font-mono text-[11px] mt-1" style={{ color: e.isTruth ? '#7fe0a0' : '#f0a5a5' }}>
                          აირჩია: {e.pickedBy.map(p => p.nickname).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Round score deltas */}
                {match.reveal.deltas.length > 0 && (
                  <div className="mt-4">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-white/35 mb-2">ამ რაუნდის ქულები</p>
                    <div className="space-y-1">
                      {match.reveal.deltas.map(d => (
                        <div key={d.userId} className="flex items-center justify-between px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <span className="font-mono text-[12px] text-white">{d.nickname}</span>
                          <span className="font-mono text-[13px] font-bold" style={{ color: '#7fe0a0' }}>+{d.delta}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standings */}
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-white/35 mb-2">ჯამური ცხრილი</p>
                  <div className="space-y-1">
                    {sorted.map((p, i) => (
                      <div key={p.userId} className="flex items-center gap-3 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <span className="font-mono text-[12px] w-5" style={{ color: i === 0 ? ACCENT : 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
                        <span className="flex-1 font-mono text-[12px] text-white truncate">{p.nickname}</span>
                        <span className="font-mono text-[13px] font-bold" style={{ color: ACCENT }}>{p.score}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {isHost ? (
                  <button onClick={() => { SFX.click?.(); nextRound(); }} className="mt-5 w-full py-3.5 rounded-2xl font-display font-bold text-white text-[15px]" style={{ background: `linear-gradient(135deg, ${ACCENT}, #6d28d9)` }}>
                    {match.round >= match.settings.rounds ? '🏁 საბოლოო შედეგები' : '➡️ შემდეგი რაუნდი'}
                  </button>
                ) : (
                  <p className="mt-5 text-center font-mono text-[12px] text-white/40 animate-pulse">ველოდებით ჰოსტს…</p>
                )}
              </motion.div>
            )}

            {/* ── FINISHED ─────────────────────────────────────────────── */}
            {match.status === 'finished' && (
              <motion.div key="fin" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center">
                {match.dissolved ? (
                  <div className="py-10">
                    <p className="text-4xl mb-3">👋</p>
                    <p className="font-display font-bold text-white text-lg">თამაში დასრულდა</p>
                    <p className="font-mono text-[12px] text-white/45 mt-1">მოთამაშემ დატოვა თამაში.</p>
                  </div>
                ) : (
                  <>
                    <motion.p initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-5xl mb-2">🏆</motion.p>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-white/40">ტყუილების ოსტატი</p>
                    <p className="font-display font-black mt-1" style={{ fontSize: 24, color: ACCENT }}>
                      {match.players.filter(p => match.winnerIds.includes(p.userId)).map(p => p.nickname).join(', ')}
                    </p>
                    <div className="mt-5 space-y-1.5 text-left">
                      {sorted.map((p, i) => (
                        <div key={p.userId} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{
                          background: match.winnerIds.includes(p.userId) ? `${ACCENT}18` : 'rgba(255,255,255,0.03)',
                          border: match.winnerIds.includes(p.userId) ? `1px solid ${ACCENT}66` : '1px solid rgba(255,255,255,0.06)',
                        }}>
                          <span className="font-mono text-[13px] w-6" style={{ color: i === 0 ? ACCENT : 'rgba(255,255,255,0.3)' }}>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}`}</span>
                          <span className="flex-1 font-mono text-[13px] text-white truncate">{p.nickname}</span>
                          <span className="font-mono text-[15px] font-bold" style={{ color: ACCENT }}>{p.score}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="mt-6 flex gap-2">
                  {isHost && !match.dissolved && (
                    <button onClick={() => { SFX.click?.(); rematch(); }} className="flex-1 py-3 rounded-2xl font-display font-bold text-white text-[14px]" style={{ background: `linear-gradient(135deg, ${ACCENT}, #6d28d9)` }}>🔄 ხელახლა</button>
                  )}
                  <button onClick={doLeave} className="flex-1 py-3 rounded-2xl font-mono text-[13px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={clearError}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl font-mono text-[12px] z-[560]"
            style={{ background: 'rgba(255,60,80,0.95)', color: '#fff' }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave confirm */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[560] flex items-center justify-center px-8" style={{ background: 'rgba(4,4,10,0.75)' }}
            onClick={() => setConfirmLeave(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(16,12,28,0.99)', border: `1px solid ${ACCENT}44` }}>
              <p className="font-display font-bold text-white text-[15px]">თამაშის დატოვება?</p>
              <p className="font-mono text-[11px] text-white/45 mt-1">
                {match.status !== 'waiting' && match.status !== 'finished' ? 'აქტიური თამაშის დატოვება ყველასთვის დაასრულებს მას.' : 'ლობიდან გახვალ.'}
              </p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[12px]" style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>დარჩენა</button>
                <button onClick={() => { setConfirmLeave(false); doLeave(); }} className="flex-1 py-2.5 rounded-xl font-mono text-[12px] text-white" style={{ background: 'rgba(255,60,80,0.85)' }}>გასვლა</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
