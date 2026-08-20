import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useAliasStore } from '@/store/aliasStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';

/**
 * ალიასი — team word game. Describer sees the word + ✓/skip; teammates guess
 * out loud (voice) or in the guess chat. First team to the target wins.
 * Prop-less overlay reading the store (like UnoGame).
 */
const TEAM = [
  { name: 'ლურჯები', color: '#4d9fff', bg: 'rgba(77,159,255,0.12)', border: 'rgba(77,159,255,0.5)' },
  { name: 'წითლები', color: '#ff5d6c', bg: 'rgba(255,93,108,0.12)', border: 'rgba(255,93,108,0.5)' },
];

export function AliasGame() {
  const profile = useAuthStore(s => s.profile);
  const nickname = profile?.username ?? 'Player';
  const { match, guesses, leaveMatch, switchTeam, startMatch, startTurn, mark, rematch, sendGuess, error, clearError } = useAliasStore();

  const [now, setNow] = useState(Date.now());
  const [guessText, setGuessText] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const prevStatus = useRef<string>('');

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(iv); }, []);

  /*
   * Voice, because ალიასი without it is not the game.
   *
   * The describer talks and the team shouts back; typing the guesses into a box
   * is a slower, quieter substitute that exists for people who cannot speak
   * right now. One LiveKit room per match, live from the lobby so the team can
   * sort out who is on which side before the clock starts.
   *
   * Declared above the `!match` return: hooks cannot be conditional.
   */
  const { enabled: livekitEnabled } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: match?.id ? `alias_${match.id}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!match?.id && match?.status !== 'finished',
    listenOnly: false,
  });

  // SFX on turn/status transitions
  useEffect(() => {
    if (!match) return;
    if (match.status === 'play' && prevStatus.current === 'waiting') SFX.gameStart();
    if (match.status === 'finished' && prevStatus.current && prevStatus.current !== 'finished') SFX.gameOver();
    prevStatus.current = match.status;
  }, [match?.status]);

  if (!match) return null;
  const myId = match.myUserId;
  const isHost = match.hostId === myId;
  const secondsLeft = match.turn ? Math.max(0, Math.ceil((match.turn.endsAt - now) / 1000)) : 0;

  const submitGuess = () => { const t = guessText.trim(); if (!t) return; sendGuess(t, nickname); setGuessText(''); };

  const Scoreboard = () => (
    <div className="flex gap-2 justify-center">
      {[0, 1].map(t => (
        <div key={t} className="flex-1 rounded-xl px-3 py-2 text-center" style={{ background: TEAM[t]!.bg, border: `1px solid ${match.activeTeam === t && match.status === 'play' ? TEAM[t]!.color : 'transparent'}` }}>
          <p className="font-mono text-[11px]" style={{ color: TEAM[t]!.color }}>{TEAM[t]!.name}</p>
          <p className="font-display font-bold text-2xl" style={{ color: TEAM[t]!.color }}>{match.scores[t]}</p>
        </div>
      ))}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col select-none" style={{ background: '#0a0a18' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[14px] font-display font-bold tracking-wide text-white">🗣 ალიასი</span>
        <div className="flex items-center gap-2">
          {match.status === 'play' && <span className="font-mono text-[12px] text-white/40">{match.settings.targetScore}-მდე</span>}
          <button onClick={() => match.status === 'play' ? setConfirmLeave(true) : leaveMatch()} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>

      {/* Voice — the bar, and the voice changer beside it. */}
      {livekitEnabled && match.status !== 'finished' && (
        <div className="px-3 pt-2 flex-shrink-0 flex flex-col gap-2">
          <LiveKitVoiceBarView voice={lkVoice} />
          <div className="flex flex-col items-start"><VoiceDisguiseButton /></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto">

          {/* ══ LOBBY ══ */}
          {match.status === 'waiting' && (
            <div className="pt-2">
              <p className="text-center text-4xl mb-2">🗣</p>
              <p className="text-center font-mono text-[12px] text-white/40 mb-1">გაუზიარე კოდი მეგობრებს</p>
              <button onClick={() => { try { navigator.clipboard?.writeText(match.code); } catch { /* ignore */ } }}
                className="font-mono font-bold text-3xl tracking-[0.3em] text-neon-cyan mb-4 mx-auto block">{match.code}</button>

              <div className="flex gap-2 mb-4">
                {[0, 1].map(t => (
                  <div key={t} className="flex-1 rounded-xl p-3" style={{ background: TEAM[t]!.bg, border: `1px solid ${TEAM[t]!.border}` }}>
                    <p className="font-display font-bold text-sm mb-2 text-center" style={{ color: TEAM[t]!.color }}>{TEAM[t]!.name}</p>
                    <div className="space-y-1">
                      {match.players.filter(p => p.team === t).map(p => (
                        <p key={p.userId} className="font-mono text-[13px] text-white/80 text-center truncate">{p.nickname}{p.userId === myId ? ' ●' : ''}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => switchTeam()} className="w-full py-2.5 rounded-xl font-mono text-[13px] text-white/60 mb-2" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                🔄 გუნდის შეცვლა
              </button>
              <p className="text-center font-mono text-[12px] text-white/35 mb-4">{match.players.length}/{match.maxPlayers} · {match.settings.roundSeconds}წმ რაუნდი</p>

              {isHost ? (
                <button onClick={() => startMatch()}
                  disabled={match.players.filter(p => p.team === 0).length < 1 || match.players.filter(p => p.team === 1).length < 1}
                  className="w-full py-3 rounded-xl font-display font-bold text-sm text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#4d9fff,#7c3aed)' }}>
                  თამაშის დაწყება
                </button>
              ) : (
                <p className="text-center font-mono text-[13px] text-white/40">ჰოსტს ელოდები…</p>
              )}
              {error && <p className="mt-3 text-center font-mono text-[12px] text-neon-red" onClick={clearError}>{error}</p>}
            </div>
          )}

          {/* ══ PLAY ══ */}
          {match.status === 'play' && (
            <div className="pt-1">
              <div className="mb-4"><Scoreboard /></div>

              {/* Between turns — waiting for the next describer to start */}
              {!match.turn && (
                <div className="text-center pt-6">
                  {match.lastTurnLog && match.lastTurnLog.length > 0 && (
                    <div className="mb-6 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p className="font-mono text-[11px] text-white/30 mb-1.5">გასული რაუნდი</p>
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {match.lastTurnLog.map((l, i) => (
                          <span key={i} className="font-mono text-[12px] px-2 py-0.5 rounded" style={{ color: l.got ? '#7fe0a0' : '#ff8ca3', background: l.got ? 'rgba(63,174,90,0.12)' : 'rgba(255,45,85,0.12)' }}>
                            {l.got ? '✓' : '✗'} {l.word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="font-display font-bold text-lg mb-1" style={{ color: TEAM[match.activeTeam]!.color }}>{TEAM[match.activeTeam]!.name}ის რიგია</p>
                  {match.nextDescriberId === myId ? (
                    <>
                      <p className="font-mono text-[13px] text-white/50 mb-6">შენ აღწერ სიტყვებს — შენი გუნდი გამოიცნობს</p>
                      <button onClick={() => { startTurn(); haptic('success'); }} className="px-10 py-4 rounded-2xl font-display font-bold text-lg text-white" style={{ background: `linear-gradient(135deg, ${TEAM[match.activeTeam]!.color}, #7c3aed)` }}>
                        დაწყება ▶
                      </button>
                    </>
                  ) : (
                    <p className="font-mono text-[14px] text-white/50 mt-4">აღწერს: <b style={{ color: TEAM[match.activeTeam]!.color }}>{match.players.find(p => p.userId === match.nextDescriberId)?.nickname ?? '…'}</b></p>
                  )}
                </div>
              )}

              {/* Active turn */}
              {match.turn && (
                <>
                  {/* Timer */}
                  <div className="text-center mb-4">
                    <span className="font-display font-bold text-3xl" style={{ color: secondsLeft <= 10 ? '#ff5d6c' : '#fff' }}>⏱ {secondsLeft}წმ</span>
                  </div>

                  {match.amDescriber ? (
                    <div className="text-center">
                      <p className="font-mono text-[12px] text-white/40 mb-3">აღწერე ეს სიტყვა (თავად სიტყვა არ თქვა!):</p>
                      <div className="rounded-2xl py-10 px-4 mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${TEAM[match.turn.team]!.color}66` }}>
                        <p className="font-display font-bold text-4xl text-white">{match.myWord}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => { mark(false); haptic('tap'); }} className="flex-1 py-5 rounded-2xl font-display font-bold text-lg" style={{ background: 'rgba(255,45,85,0.14)', border: '1px solid rgba(255,45,85,0.5)', color: '#ff8ca3' }}>
                          → გამოტოვება
                        </button>
                        <button onClick={() => { mark(true); SFX.voteConfirm(); haptic('success'); }} className="flex-1 py-5 rounded-2xl font-display font-bold text-lg" style={{ background: 'rgba(63,174,90,0.18)', border: '1px solid rgba(63,174,90,0.6)', color: '#7fe0a0' }}>
                          ✓ სწორი
                        </button>
                      </div>
                      <p className="font-mono text-[12px] text-white/30 mt-4">სწორი: {match.turn.correct} · გამოტოვება: {match.turn.skipped}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="font-mono text-[13px] text-white/50 mb-1">აღწერს: <b style={{ color: TEAM[match.turn.team]!.color }}>{match.turn.describerName}</b></p>
                      {match.myTeam === match.turn.team
                        ? <p className="font-display font-bold text-xl text-white mb-4">🎯 გამოიცანი! ხმამაღლა ან ჩატში</p>
                        : <p className="font-mono text-[13px] text-white/40 mb-4">დაელოდე შენს რიგს…</p>}
                      <p className="font-mono text-[12px] text-white/30">სწორი: {match.turn.correct}</p>
                    </div>
                  )}

                  {/* Guess chat */}
                  <div className="mt-6">
                    <div className="max-h-40 overflow-y-auto space-y-1 mb-2 px-1">
                      {guesses.slice(-20).map((g, i) => (
                        <p key={i} className="font-mono text-[13px]"><span style={{ color: TEAM[g.team]!.color }}>{g.nickname}:</span> <span className="text-white/70">{g.text}</span></p>
                      ))}
                    </div>
                    {!match.amDescriber && (
                      <div className="flex gap-2">
                        <input value={guessText} onChange={e => setGuessText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitGuess(); }}
                          placeholder="გამოცანა…" maxLength={60}
                          className="flex-1 px-3 py-2 rounded-xl font-mono text-[14px] text-white bg-white/5 border border-white/10 outline-none focus:border-neon-cyan/40" />
                        <button onClick={submitGuess} className="px-4 rounded-xl font-mono text-neon-cyan" style={{ border: '1px solid rgba(0,229,255,0.35)' }}>➤</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ FINISHED ══ */}
          {match.status === 'finished' && (
            <div className="text-center pt-10">
              <p className="text-5xl mb-3">{match.dissolved ? '🚪' : '🏆'}</p>
              {match.dissolved
                ? <p className="font-display font-bold text-xl mb-2 text-white">თამაში დასრულდა — მოთამაშემ დატოვა</p>
                : <p className="font-display font-bold text-2xl mb-2" style={{ color: TEAM[match.winner ?? 0]!.color }}>{TEAM[match.winner ?? 0]!.name}მა მოიგო!</p>}
              <p className="font-mono text-[14px] text-white/50 mb-8">{match.scores[0]} : {match.scores[1]}</p>
              <div className="flex flex-col gap-2.5 items-stretch max-w-[280px] mx-auto">
                {isHost && <button onClick={() => rematch()} className="py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#4d9fff,#7c3aed)' }}>თავიდან</button>}
                <button onClick={() => leaveMatch()} className="py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmLeave && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(77,159,255,0.35)' }}>
            <p className="text-3xl mb-2">🚪</p>
            <p className="font-display font-bold text-white text-base mb-1">დატოვებ თამაშს?</p>
            <p className="font-mono text-[12px] text-white/50 mb-5">გასვლა ყველასთვის დაასრულებს მატჩს.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>არა</button>
              <button onClick={() => { setConfirmLeave(false); leaveMatch(); }} className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,45,85,0.25)', border: '1px solid rgba(255,45,85,0.5)' }}>დიახ, გავდივარ</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
