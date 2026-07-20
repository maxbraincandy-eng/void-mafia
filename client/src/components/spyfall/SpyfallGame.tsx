import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useSpyfallStore } from '@/store/spyfallStore';
import { useSpyfallVoice } from '@/hooks/useSpyfallVoice';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import type { SpyfallPublicPlayer, SpyfallReveal } from '@/types/spyfall';

/**
 * ჯაშუში (Spyfall) — social deduction overlay. One player is the spy; the rest
 * know the location. Interrogation happens over voice (LiveKit room per match,
 * mesh PTT fallback), then everyone votes — unless the spy names the location
 * first. Prop-less overlay reading the store (like UnoGame/AliasGame).
 */

const OUTCOME_TEXT: Record<SpyfallReveal['outcome'], { emoji: string; title: string; sub: (r: SpyfallReveal) => string; spyWon: boolean }> = {
  spy_caught:    { emoji: '🎉', title: 'ჯაშუში დაიჭირეს!',            sub: r => `${r.spyName} იყო ჯაშუში — მოქალაქეები +1`, spyWon: false },
  wrong_accused: { emoji: '😈', title: 'უდანაშაულო დაადანაშაულეთ!',    sub: r => `${r.accusedName} ჯაშუში არ იყო — ჯაშუში (${r.spyName}) +2`, spyWon: true },
  spy_escaped:   { emoji: '🕵️', title: 'ჯაშუში გაიქცა!',              sub: r => `ხმები გაიყო — ჯაშუში (${r.spyName}) +2`, spyWon: true },
  spy_guessed:   { emoji: '🎯', title: 'ჯაშუშმა გამოიცნო ლოკაცია!',    sub: r => `${r.spyName}-მა ზუსტად დაასახელა — ჯაშუში +3`, spyWon: true },
  spy_wrong:     { emoji: '❌', title: 'ჯაშუშმა ვერ გამოიცნო',         sub: r => `${r.spyName}-მა თქვა „${r.guessedLocation}" — მოქალაქეები +1`, spyWon: false },
};

function fmtTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60); const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SpyfallGame() {
  const profile = useAuthStore(s => s.profile);
  const { match, leaveMatch, startMatch, beginVote, vote, accuse, respondAccusation, guessLocation, nextRound, rematch, error, clearError } = useSpyfallStore();

  const [now, setNow] = useState(Date.now());
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [roleHidden, setRoleHidden] = useState(false);
  const [guessTarget, setGuessTarget] = useState<string | null>(null);   // spy: location pending confirmation
  const [voteTarget, setVoteTarget] = useState<SpyfallPublicPlayer | null>(null);
  const [accuseTarget, setAccuseTarget] = useState<SpyfallPublicPlayer | null>(null); // pending accusation confirm
  const prevStatus = useRef<string>('');
  const prevRound = useRef<number>(0);
  const prevAccusing = useRef<boolean>(false);

  const voice = useSpyfallVoice();

  // LiveKit voice (each match == one LiveKit room). Replaces the mesh PTT when
  // enabled. Everyone in a Spyfall match is a player, so everyone can speak.
  const { enabled: livekitEnabled, resolved: livekitResolved } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: match?.id ? `spyfall_${match.id}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!match?.id && match?.status !== 'finished',
    listenOnly: false,
  });

  // Auto-join the legacy mesh voice — skipped when LiveKit owns voice.
  useEffect(() => {
    if (!match) return;
    if (!livekitResolved || livekitEnabled) return;
    voice.joinVoice(match.id);
    return () => { voice.leave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, livekitResolved, livekitEnabled]);

  // Leave voice when finished
  useEffect(() => {
    if (match?.status === 'finished') voice.leave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status]);

  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(iv); }, []);

  // SFX + per-round UI resets on transitions
  useEffect(() => {
    if (!match) return;
    if (match.status === 'play' && (prevStatus.current === 'waiting' || prevStatus.current === 'reveal')) {
      SFX.gameStart(); haptic('success');
      setRoleHidden(false); setGuessTarget(null); setVoteTarget(null);
    }
    if (match.status === 'voting' && prevStatus.current === 'play') { SFX.voteStart(); haptic('heavy'); }
    if (match.status === 'finished' && prevStatus.current && prevStatus.current !== 'finished') SFX.gameOver();
    prevStatus.current = match.status;
    prevRound.current = match.round;
  }, [match?.status, match?.round]);

  // SFX when an accusation appears / clear stale confirm dialogs
  useEffect(() => {
    const accusing = !!match?.accusation;
    if (accusing && !prevAccusing.current) { SFX.nomination(); haptic('heavy'); setAccuseTarget(null); setVoteTarget(null); setGuessTarget(null); }
    prevAccusing.current = accusing;
  }, [match?.accusation]);

  if (!match) return null;
  const myId = match.myUserId;
  const isHost = match.hostId === myId;
  const inRound = match.status === 'play' || match.status === 'voting';
  // While an accusation is live the discussion clock is frozen.
  const paused = match.status === 'play' && !!match.accusation && match.pausedMsLeft != null;
  const secondsLeft = paused
    ? Math.max(0, Math.ceil((match.pausedMsLeft ?? 0) / 1000))
    : match.status === 'play' ? Math.max(0, Math.ceil((match.endsAt - now) / 1000)) : 0;

  const meshVoiceOn = !livekitEnabled && voice.joined;

  // 'none' → read-only, 'vote' → tap to vote (final ballot), 'accuse' → tap to accuse (mid-round)
  type ChipMode = 'none' | 'vote' | 'accuse';
  const PlayerChips = ({ mode }: { mode: ChipMode }) => (
    <div className="flex flex-wrap gap-2 justify-center">
      {match.players.map(p => {
        const speaking = meshVoiceOn && voice.speakingSocketIds.includes(p.socketId);
        const isMe = p.userId === myId;
        const myPick = match.myVote === p.userId;
        const tappable = mode !== 'none' && !isMe && p.connected;
        return (
          <button key={p.userId} disabled={!tappable}
            onClick={() => { if (!tappable) return; if (mode === 'vote') setVoteTarget(p); else if (mode === 'accuse') setAccuseTarget(p); }}
            className="px-3 py-1.5 rounded-xl font-mono text-[13px] transition-all"
            style={{
              background: myPick ? 'rgba(255,45,85,0.2)' : 'rgba(255,255,255,0.04)',
              border: speaking ? '1px solid rgba(63,174,90,0.9)' : myPick ? '1px solid rgba(255,45,85,0.7)' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: speaking ? '0 0 10px rgba(63,174,90,0.4)' : 'none',
              color: p.connected ? '#fff' : 'rgba(255,255,255,0.3)',
              opacity: mode !== 'none' && isMe ? 0.4 : 1,
            }}>
            {p.nickname}{isMe ? ' ●' : ''}
            {mode === 'accuse' && tappable && <span className="ml-1 text-white/40">⚖️</span>}
            {inRound && match.status === 'voting' && p.hasVoted && <span className="ml-1" style={{ color: '#7fe0a0' }}>✓</span>}
            {match.status !== 'waiting' && <span className="ml-1.5 text-white/35">{p.score}</span>}
          </button>
        );
      })}
    </div>
  );

  const LocationChips = ({ tappable }: { tappable: boolean }) => (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {match.locations.map(l => (
        <button key={l.name} disabled={!tappable}
          onClick={() => { if (tappable) setGuessTarget(l.name); }}
          className="px-2.5 py-1 rounded-lg font-mono text-[12px] transition-all active:scale-95"
          style={{
            background: guessTarget === l.name ? 'rgba(255,45,85,0.2)' : 'rgba(255,255,255,0.03)',
            border: guessTarget === l.name ? '1px solid rgba(255,45,85,0.6)' : '1px solid rgba(255,255,255,0.08)',
            color: tappable ? 'rgba(255,255,255,0.85)' : (match.myLocation === l.name ? '#ffd34d' : 'rgba(255,255,255,0.45)'),
          }}>
          {l.emoji} {l.name}
        </button>
      ))}
    </div>
  );

  const Scoreboard = ({ highlightWinners }: { highlightWinners?: boolean }) => (
    <div className="rounded-xl p-3 space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {[...match.players].sort((a, b) => b.score - a.score).map(p => {
        const isWinner = highlightWinners && match.winnerIds.includes(p.userId);
        return (
          <div key={p.userId} className="flex items-center justify-between px-1">
            <span className="font-mono text-[13px]" style={{ color: isWinner ? '#ffd34d' : 'rgba(255,255,255,0.75)' }}>
              {isWinner ? '👑 ' : ''}{p.nickname}{p.userId === myId ? ' ●' : ''}
            </span>
            <span className="font-display font-bold text-[15px]" style={{ color: isWinner ? '#ffd34d' : '#fff' }}>{p.score}</span>
          </div>
        );
      })}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col select-none" style={{ background: '#0b0a14' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[14px] font-display font-bold tracking-wide text-white">🕵️ ჯაშუში</span>
        <div className="flex items-center gap-2">
          {inRound && <span className="font-mono text-[12px] text-white/40">რაუნდი {match.round}/{match.settings.rounds}</span>}
          {match.status === 'play' && (
            <span className="font-display font-bold text-[15px]" style={{ color: paused ? '#ffd34d' : secondsLeft <= 30 ? '#ff5d6c' : '#fff' }}>{paused ? '⏸' : '⏱'} {fmtTime(secondsLeft)}</span>
          )}
          <button onClick={() => inRound || match.status === 'reveal' ? setConfirmLeave(true) : leaveMatch()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
        </div>
      </div>

      {/* Voice bar — LiveKit when enabled, mesh PTT fallback otherwise */}
      {livekitEnabled && match.status !== 'finished' && (
        <div className="px-3 pt-2 flex-shrink-0"><LiveKitVoiceBarView voice={lkVoice} /></div>
      )}
      {!livekitEnabled && livekitResolved && match.status !== 'finished' && (
        <div className="px-4 pt-2 flex items-center gap-3 flex-shrink-0">
          <button
            onPointerDown={() => voice.startTalk(match.id)}
            onPointerUp={() => voice.stopTalk(match.id)}
            onPointerLeave={() => voice.stopTalk(match.id)}
            className="flex-1 py-2.5 rounded-xl font-mono text-[13px] transition-all select-none"
            style={{
              background: voice.isTalking ? 'rgba(63,174,90,0.22)' : 'rgba(255,255,255,0.05)',
              border: voice.isTalking ? '1px solid rgba(63,174,90,0.7)' : '1px solid rgba(255,255,255,0.12)',
              color: voice.isTalking ? '#7fe0a0' : 'rgba(255,255,255,0.55)',
              touchAction: 'none',
            }}>
            {voice.isTalking ? '🎙 ლაპარაკობ…' : voice.joined ? '🎙 დააჭირე და ილაპარაკე' : '🎙 ხმა ერთვება…'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-md mx-auto">

          {/* ══ LOBBY ══ */}
          {match.status === 'waiting' && (
            <div className="pt-2">
              <p className="text-center text-4xl mb-2">🕵️</p>
              <p className="text-center font-mono text-[12px] text-white/40 mb-1">გაუზიარე კოდი მეგობრებს</p>
              <button onClick={() => { try { navigator.clipboard?.writeText(match.code); } catch { /* ignore */ } }}
                className="font-mono font-bold text-3xl tracking-[0.3em] text-neon-cyan mb-4 mx-auto block">{match.code}</button>

              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="font-mono text-[11px] text-white/30 mb-2 text-center">მოთამაშეები · {match.players.length}/{match.maxPlayers}</p>
                <PlayerChips mode="none" />
              </div>

              <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,211,77,0.05)', border: '1px solid rgba(255,211,77,0.2)' }}>
                <p className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(255,224,138,0.85)' }}>
                  🎭 ერთი მოთამაშე <b>ჯაშუშია</b> — დანარჩენებმა იციან ლოკაცია. დაუსვით ერთმანეთს კითხვები ხმით:
                  ჯაშუშმა უნდა გამოიცნოს ლოკაცია, თქვენ კი — ჯაშუში. ფრთხილად, ზუსტი კითხვა ლოკაციას გასცემს!
                </p>
                <p className="font-mono text-[12px] leading-relaxed mt-2" style={{ color: 'rgba(255,140,163,0.85)' }}>
                  ⚖️ ეჭვი თუ მიგაქვს — <b>დაადანაშაულე</b> მოთამაშე (რაუნდში ერთხელ). თუ ყველა დანარჩენი დაგეთანხმა,
                  ის მაშინვე გაიხსნება. თუ ერთმა მაინც უარი თქვა — თამაში გრძელდება. ბოლოს, დროის ამოწურვისას, ყველა ერთად აძლევს ხმას.
                </p>
              </div>

              <p className="text-center font-mono text-[12px] text-white/35 mb-4">{match.settings.rounds} რაუნდი · {Math.round(match.settings.discussSeconds / 60)} წთ განხილვა</p>

              {isHost ? (
                <button onClick={() => startMatch()}
                  disabled={match.players.length < 3}
                  className="w-full py-3.5 rounded-xl font-display font-bold text-sm text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#ff5d6c,#7c3aed)' }}>
                  {match.players.length < 3 ? `თამაშის დაწყება (მინ. 3 მოთამაშე)` : '🕵️ თამაშის დაწყება'}
                </button>
              ) : (
                <p className="text-center font-mono text-[13px] text-white/40">ჰოსტს ელოდები…</p>
              )}
              {error && <p className="mt-3 text-center font-mono text-[12px] text-neon-red" onClick={clearError}>{error}</p>}
            </div>
          )}

          {/* ══ PLAY / VOTING ══ */}
          {inRound && (
            <div className="pt-1 space-y-4">

              {/* Role card */}
              <div className="rounded-2xl p-4 text-center relative"
                style={match.amSpy
                  ? { background: 'rgba(255,45,85,0.1)', border: '2px solid rgba(255,45,85,0.5)' }
                  : { background: 'rgba(63,174,90,0.07)', border: '2px solid rgba(63,174,90,0.35)' }}>
                <button onClick={() => setRoleHidden(h => !h)}
                  className="absolute top-2 right-2 px-2 py-1 rounded-lg font-mono text-[11px] text-white/40"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
                  {roleHidden ? '👁 ჩვენება' : '🙈 დამალვა'}
                </button>
                {roleHidden ? (
                  <p className="font-mono text-[13px] text-white/30 py-4">▓▓▓▓▓▓▓▓▓▓</p>
                ) : match.amSpy ? (
                  <>
                    <p className="text-3xl mb-1">🕵️</p>
                    <p className="font-display font-bold text-xl mb-1" style={{ color: '#ff5d6c' }}>შენ ხარ ჯაშუში!</p>
                    <p className="font-mono text-[12px] text-white/50">მოუსმინე საუბარს, გამოიცანი ლოკაცია და აირჩიე ქვემოთ — ან ბოლომდე შენიღბე</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl mb-1">{match.myLocationEmoji}</p>
                    <p className="font-display font-bold text-xl text-white mb-1">{match.myLocation}</p>
                    <p className="font-mono text-[13px]" style={{ color: '#7fe0a0' }}>შენი როლი: <b>{match.myRole}</b></p>
                  </>
                )}
              </div>

              {/* Players */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-white/25 mb-2 text-center">
                  {match.status === 'voting' ? '🗳 ვინ არის ჯაშუში? — აირჩიე' : 'მოთამაშეები'}
                </p>
                <PlayerChips mode={match.status === 'voting' ? 'vote' : (!match.myAccusationUsed ? 'accuse' : 'none')} />
                {match.status === 'voting' ? (
                  <p className="text-center font-mono text-[12px] text-white/35 mt-2">
                    ხმა მისცა {match.players.filter(p => p.hasVoted).length}/{match.players.filter(p => p.connected).length}-მა
                    {match.myVote && ' · შენი ხმა შეგიძლია შეცვალო'}
                  </p>
                ) : (
                  <p className="text-center font-mono text-[12px] text-white/35 mt-2">
                    {match.myAccusationUsed
                      ? '⚖️ ბრალდება ამ რაუნდში უკვე გამოიყენე'
                      : '⚖️ დააჭირე მოთამაშეს, რომ ჯაშუშობაში დაადანაშაულო'}
                  </p>
                )}
              </div>

              {/* Host: early vote */}
              {match.status === 'play' && isHost && (
                <button onClick={() => beginVote()}
                  className="w-full py-2.5 rounded-xl font-mono text-[13px] text-white/70"
                  style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
                  🗳 განხილვის დასრულება — საერთო კენჭისყრა
                </button>
              )}

              {/* Locations reference / spy guess */}
              <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="font-mono text-[11px] uppercase tracking-widest text-white/25 mb-2 text-center">
                  {match.amSpy ? '📍 ლოკაციები — აირჩიე თუ მიხვდი' : '📍 ყველა შესაძლო ლოკაცია'}
                </p>
                <LocationChips tappable={match.amSpy} />
              </div>
            </div>
          )}

          {/* ══ REVEAL ══ */}
          {match.status === 'reveal' && match.reveal && (() => {
            const o = OUTCOME_TEXT[match.reveal.outcome];
            return (
              <div className="pt-4 space-y-4 text-center">
                <p className="text-5xl">{o.emoji}</p>
                <div>
                  <p className="font-display font-bold text-xl mb-1" style={{ color: o.spyWon ? '#ff5d6c' : '#7fe0a0' }}>{o.title}</p>
                  <p className="font-mono text-[13px] text-white/60">{o.sub(match.reveal)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(255,211,77,0.06)', border: '1px solid rgba(255,211,77,0.25)' }}>
                  <p className="font-mono text-[12px] text-white/40 mb-0.5">ლოკაცია იყო</p>
                  <p className="font-display font-bold text-lg" style={{ color: '#ffd34d' }}>{match.reveal.locationEmoji} {match.reveal.location}</p>
                </div>
                {match.reveal.votes.length > 0 && (
                  <div className="rounded-xl p-3 text-left" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="font-mono text-[11px] text-white/30 mb-1.5 text-center">ხმები</p>
                    {match.reveal.votes.map((v, i) => (
                      <p key={i} className="font-mono text-[12px] text-white/60 text-center">{v.nickname} → {v.targetName}</p>
                    ))}
                  </div>
                )}
                <Scoreboard />
                {isHost ? (
                  <button onClick={() => nextRound()}
                    className="w-full py-3 rounded-xl font-display font-bold text-sm text-white"
                    style={{ background: 'linear-gradient(135deg,#ff5d6c,#7c3aed)' }}>
                    {match.round >= match.settings.rounds ? '🏁 საბოლოო შედეგები' : `▶ რაუნდი ${match.round + 1}`}
                  </button>
                ) : (
                  <p className="font-mono text-[13px] text-white/40">ჰოსტს ელოდები…</p>
                )}
              </div>
            );
          })()}

          {/* ══ FINISHED ══ */}
          {match.status === 'finished' && (
            <div className="text-center pt-10">
              <p className="text-5xl mb-3">{match.dissolved ? '🚪' : '🏆'}</p>
              {match.dissolved ? (
                <p className="font-display font-bold text-xl mb-6 text-white">თამაში დასრულდა — მოთამაშემ დატოვა</p>
              ) : (
                <>
                  <p className="font-display font-bold text-2xl mb-1" style={{ color: '#ffd34d' }}>
                    {match.players.filter(p => match.winnerIds.includes(p.userId)).map(p => p.nickname).join(', ')}
                  </p>
                  <p className="font-mono text-[13px] text-white/50 mb-6">გაიმარჯვ{match.winnerIds.length > 1 ? 'ეს' : 'ა'}!</p>
                  <div className="mb-6"><Scoreboard highlightWinners /></div>
                </>
              )}
              <div className="flex flex-col gap-2.5 items-stretch max-w-[280px] mx-auto">
                {isHost && !match.dissolved && (
                  <button onClick={() => rematch()} className="py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#ff5d6c,#7c3aed)' }}>თავიდან</button>
                )}
                <button onClick={() => leaveMatch()} className="py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Vote confirm */}
      {voteTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(255,45,85,0.35)' }}>
            <p className="text-3xl mb-2">🗳</p>
            <p className="font-display font-bold text-white text-base mb-1">ხმას აძლევ?</p>
            <p className="font-mono text-[14px] mb-5" style={{ color: '#ff8ca3' }}>{voteTarget.nickname} — ჯაშუშია?</p>
            <div className="flex gap-2.5">
              <button onClick={() => setVoteTarget(null)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>არა</button>
              <button onClick={() => { const t = voteTarget; setVoteTarget(null); vote(t.userId); SFX.voteConfirm(); haptic('success'); }}
                className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,45,85,0.25)', border: '1px solid rgba(255,45,85,0.5)' }}>დიახ</button>
            </div>
          </div>
        </div>
      )}

      {/* Accuse confirm — start a mid-round accusation */}
      {accuseTarget && match.status === 'play' && !match.accusation && !match.myAccusationUsed && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(255,45,85,0.4)' }}>
            <p className="text-3xl mb-2">⚖️</p>
            <p className="font-display font-bold text-white text-base mb-1">ადანაშაულებ ჯაშუშობაში?</p>
            <p className="font-mono text-[15px] mb-2" style={{ color: '#ff8ca3' }}>{accuseTarget.nickname}</p>
            <p className="font-mono text-[11px] text-white/40 mb-5">ყველა დანარჩენი უნდა დაგეთანხმოს. რაუნდში მხოლოდ ერთი ბრალდება გაქვს.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setAccuseTarget(null)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>არა</button>
              <button onClick={() => { const t = accuseTarget; setAccuseTarget(null); accuse(t.userId); haptic('heavy'); }}
                className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,45,85,0.25)', border: '1px solid rgba(255,45,85,0.5)' }}>დიახ, ვადანაშაულებ</button>
            </div>
          </div>
        </div>
      )}

      {/* Spy guess confirm */}
      {guessTarget && match.amSpy && inRound && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(255,211,77,0.35)' }}>
            <p className="text-3xl mb-2">🎯</p>
            <p className="font-display font-bold text-white text-base mb-1">ასახელებ ლოკაციას?</p>
            <p className="font-mono text-[14px] mb-2" style={{ color: '#ffd34d' }}>{guessTarget}</p>
            <p className="font-mono text-[11px] text-white/40 mb-5">სწორია → +3 ქულა · შეცდომაა → რაუნდი წაგებულია</p>
            <div className="flex gap-2.5">
              <button onClick={() => setGuessTarget(null)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>არა</button>
              <button onClick={() => { const g = guessTarget; setGuessTarget(null); guessLocation(g); haptic('heavy'); }}
                className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,211,77,0.22)', border: '1px solid rgba(255,211,77,0.5)' }}>დიახ, ვასახელებ</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave confirm — dissolves for everyone during a live match */}
      {confirmLeave && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(255,45,85,0.35)' }}>
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

      {/* ══ LIVE ACCUSATION — full takeover ══ */}
      {match.accusation && inRound && (() => {
        const a = match.accusation;
        const amAccuser = a.accuserId === myId;
        const amTarget = a.targetId === myId;
        const amJuror = !amAccuser && !amTarget;
        const iAgreed = a.agreeIds.includes(myId);
        const iRefused = a.disagreeIds.includes(myId);
        const iResponded = iAgreed || iRefused;
        const answered = a.agreeIds.length + a.disagreeIds.length;
        const accSecondsLeft = Math.max(0, Math.ceil((a.deadline - now) / 1000));
        return (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6" style={{ background: 'rgba(6,3,8,0.92)' }}>
            <div className="w-full max-w-sm rounded-2xl p-5 text-center" style={{ background: 'rgba(18,10,16,0.99)', border: '2px solid rgba(255,45,85,0.55)', boxShadow: '0 0 40px rgba(255,45,85,0.25)' }}>
              <div className="flex items-center justify-center gap-2 mb-2">
                <p className="text-3xl">⚖️</p>
                <span className="font-display font-bold text-lg tracking-wide" style={{ color: '#ff5d6c' }}>ბრალდება</span>
              </div>
              <p className="font-mono text-[14px] text-white/85 mb-1">
                <b style={{ color: '#fff' }}>{a.accuserName}</b> ადანაშაულებს <b style={{ color: '#ff8ca3' }}>{a.targetName}</b>-ს ჯაშუშობაში!
              </p>
              <p className="font-mono text-[12px] mb-4" style={{ color: accSecondsLeft <= 8 ? '#ff5d6c' : 'rgba(255,255,255,0.4)' }}>⏱ {accSecondsLeft}წმ · უპასუხა {answered}/{a.jurorCount}</p>

              {/* Tally bar */}
              <div className="flex items-center justify-center gap-4 mb-5">
                <span className="font-mono text-[13px]" style={{ color: '#7fe0a0' }}>👍 {a.agreeIds.length}</span>
                <span className="font-mono text-[13px]" style={{ color: '#ff8ca3' }}>👎 {a.disagreeIds.length}</span>
              </div>

              {amJuror && !iResponded && (
                <>
                  <p className="font-mono text-[12px] text-white/50 mb-3">ეთანხმები, რომ {a.targetName} ჯაშუშია?</p>
                  <div className="flex gap-2.5">
                    <button onClick={() => { respondAccusation(false); haptic('tap'); }}
                      className="flex-1 py-3.5 rounded-xl font-display font-bold text-[15px]" style={{ background: 'rgba(255,45,85,0.16)', border: '1px solid rgba(255,45,85,0.5)', color: '#ff8ca3' }}>👎 არა</button>
                    <button onClick={() => { respondAccusation(true); SFX.voteConfirm(); haptic('success'); }}
                      className="flex-1 py-3.5 rounded-xl font-display font-bold text-[15px]" style={{ background: 'rgba(63,174,90,0.2)', border: '1px solid rgba(63,174,90,0.6)', color: '#7fe0a0' }}>👍 დიახ</button>
                  </div>
                </>
              )}
              {amJuror && iResponded && (
                <p className="font-mono text-[13px]" style={{ color: iAgreed ? '#7fe0a0' : '#ff8ca3' }}>
                  შენ უპასუხე: {iAgreed ? '👍 დიახ' : '👎 არა'} — ელოდები დანარჩენებს…
                </p>
              )}
              {amAccuser && (
                <p className="font-mono text-[12px] text-white/50">შენ დააყენე ბრალდება — საჭიროა <b style={{ color: '#7fe0a0' }}>ყველას</b> თანხმობა. ერთი „არა"-ც კმარა ჩასაშლელად.</p>
              )}
              {amTarget && (
                <p className="font-mono text-[13px]" style={{ color: '#ff8ca3' }}>🎯 შენ გადანაშაულებენ! დაიცავი თავი — ილაპარაკე ხმით.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>,
    document.body,
  );
}
