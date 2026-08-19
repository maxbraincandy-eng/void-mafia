import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import { useAuthStore } from '@/store/authStore';
import { useCodenamesStore } from '@/store/codenamesStore';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import { VoiceDisguiseButton } from '@/components/game/VoiceDisguiseButton';
import type { CnColor } from '@/types/codenames';

/**
 * Codenames — 5×5 word grid, two teams, spymasters who alone see the colour
 * key give one-word clues; operatives tap words. Prop-less overlay (like UnoGame).
 */
const TEAM = [
  { name: 'წითლები', color: '#ff5d6c', bg: 'rgba(255,93,108,0.14)', border: 'rgba(255,93,108,0.6)', solid: '#c8324a' },
  { name: 'ლურჯები', color: '#4d9fff', bg: 'rgba(77,159,255,0.14)', border: 'rgba(77,159,255,0.6)', solid: '#2a6bd6' },
];
// card face colour by CnColor: 0/1 teams, 2 neutral, 3 assassin
const CARD_MAP: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#c8324a', fg: '#fff' }, 1: { bg: '#2a6bd6', fg: '#fff' }, 2: { bg: '#d8c9a0', fg: '#3a3020' }, 3: { bg: '#161616', fg: '#fff' },
};
function cardStyle(color: CnColor | null, revealed: boolean): React.CSSProperties {
  if (color === null) return { background: '#efe6d0', color: '#2a2318', borderColor: 'rgba(0,0,0,0.12)' };
  const m = CARD_MAP[color]!;
  if (revealed) return { background: m.bg, color: m.fg, borderColor: 'transparent', opacity: 0.96 };
  // Spymaster preview (not yet revealed): light card with a coloured ring.
  return { background: '#efe6d0', color: '#2a2318', borderColor: m.bg, boxShadow: `inset 0 0 0 3px ${m.bg}` };
}

export function CodenamesGame() {
  const profile = useAuthStore(s => s.profile);
  const nickname = profile?.username ?? 'Player';
  const { match, leaveMatch, switchTeam, toggleSpymaster, startMatch, giveClue, guess, pass, rematch, error, clearError } = useCodenamesStore();
  const [clueWord, setClueWord] = useState('');
  const [clueNum, setClueNum] = useState(2);
  const [confirmLeave, setConfirmLeave] = useState(false);

  /*
   * Voice, the same as Lies and spyfall.
   *
   * Codenames is a game about a one-word clue and then an argument — the
   * spymaster says "ცა 2" and the team spends a minute working out which two,
   * out loud. Typing that is a different game.
   *
   * Declared BEFORE the `!match` early return: hooks have to run in the same
   * order on every render, and putting them after it would change that the
   * moment the match ends.
   */
  const { enabled: livekitEnabled } = useLiveKitGate();
  const lkVoice = useLivekitRoomVoice({
    roomId: match?.id ? `codenames_${match.id}` : null,
    identity: profile?.id ?? null,
    active: livekitEnabled && !!match?.id && match?.status !== 'finished',
    listenOnly: false,
  });

  if (!match) return null;
  const myId = match.myUserId;
  const isHost = match.hostId === myId;
  const myTurn = match.myTeam === match.turnTeam;
  const canGuess = match.status === 'play' && !!match.clue && myTurn && !match.amSpymaster;
  const canClue = match.status === 'play' && !match.clue && myTurn && match.amSpymaster;

  const submitClue = () => {
    const w = clueWord.trim();
    if (!w) return;
    giveClue(w, clueNum); SFX.click(); haptic('selection');
    setClueWord('');
  };
  const tapCard = (i: number) => { if (!canGuess) return; const c = match.board[i]; if (!c || c.revealed) return; guess(i); haptic('tap'); };

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col select-none" style={{ background: '#0b0a14' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[14px] font-display font-bold tracking-wide text-white">🕵️ Codenames</span>
        <button onClick={() => match.status === 'play' ? setConfirmLeave(true) : leaveMatch()} className="w-8 h-8 rounded-full flex items-center justify-center text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>✕</button>
      </div>

      {/* Voice — the bar, and the verified voice changer beside it. */}
      {livekitEnabled && match.status !== 'finished' && (
        <div className="px-3 pt-2 flex-shrink-0 flex flex-col gap-2">
          <LiveKitVoiceBarView voice={lkVoice} />
          <div className="flex flex-col items-start"><VoiceDisguiseButton /></div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <div className="max-w-lg mx-auto">

          {/* ══ LOBBY ══ */}
          {match.status === 'waiting' && (
            <div className="pt-1">
              <p className="text-center text-4xl mb-2">🕵️</p>
              <button onClick={() => { try { navigator.clipboard?.writeText(match.code); } catch { /* ignore */ } }}
                className="font-mono font-bold text-3xl tracking-[0.3em] text-neon-cyan mb-4 mx-auto block">{match.code}</button>
              <div className="flex gap-2 mb-3">
                {[0, 1].map(t => (
                  <div key={t} className="flex-1 rounded-xl p-3" style={{ background: TEAM[t]!.bg, border: `1px solid ${TEAM[t]!.border}` }}>
                    <p className="font-display font-bold text-sm mb-2 text-center" style={{ color: TEAM[t]!.color }}>{TEAM[t]!.name}</p>
                    <div className="space-y-1">
                      {match.players.filter(p => p.team === t).map(p => (
                        <p key={p.userId} className="font-mono text-[12px] text-white/80 text-center truncate">{p.isSpymaster ? '🕵️ ' : ''}{p.nickname}{p.userId === myId ? ' ●' : ''}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mb-2">
                <button onClick={() => switchTeam()} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>🔄 გუნდი</button>
                <button onClick={() => toggleSpymaster()} className="flex-1 py-2.5 rounded-xl font-mono text-[13px]" style={{ border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}>🕵️ სპაიმასტერი</button>
              </div>
              <p className="text-center font-mono text-[12px] text-white/35 mb-4">თითო გუნდს სჭირდება 1 სპაიმასტერი + მინიმუმ 1 აგენტი</p>
              {isHost ? (
                <button onClick={() => startMatch()} className="w-full py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#ff5d6c,#4d9fff)' }}>თამაშის დაწყება</button>
              ) : <p className="text-center font-mono text-[13px] text-white/40">ჰოსტს ელოდები…</p>}
              {error && <p className="mt-3 text-center font-mono text-[12px] text-neon-red" onClick={clearError}>{error}</p>}
            </div>
          )}

          {/* ══ PLAY / FINISHED ══ */}
          {(match.status === 'play' || match.status === 'finished') && (
            <div>
              {/* Score + turn */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-display font-bold text-lg" style={{ color: TEAM[0]!.color }}>{match.remaining[0]}</span>
                <div className="text-center">
                  {match.status === 'finished'
                    ? (match.dissolved
                        ? <span className="font-display font-bold text-sm text-white/80">დასრულდა — მოთამაშემ დატოვა</span>
                        : <span className="font-display font-bold text-sm" style={{ color: TEAM[match.winner ?? 0]!.color }}>{TEAM[match.winner ?? 0]!.name}მა მოიგო!</span>)
                    : <span className="font-mono text-[13px]" style={{ color: TEAM[match.turnTeam]!.color }}>{TEAM[match.turnTeam]!.name}ის ჯერი</span>}
                </div>
                <span className="font-display font-bold text-lg" style={{ color: TEAM[1]!.color }}>{match.remaining[1]}</span>
              </div>

              {/* Clue banner */}
              {match.status === 'play' && (
                <div className="text-center mb-2 min-h-[28px]">
                  {match.clue
                    ? <span className="font-display font-bold text-base text-white">💡 {match.clue.word} · {match.clue.number} <span className="font-mono text-[12px] text-white/40">({match.guessesLeft} დარჩა)</span></span>
                    : <span className="font-mono text-[13px] text-white/40">{match.turnTeam === match.myTeam && match.amSpymaster ? 'მიეცი მინიშნება' : `${TEAM[match.turnTeam]!.name}ის სპაიმასტერი ფიქრობს…`}</span>}
                </div>
              )}

              {/* 5×5 grid */}
              <div className="grid grid-cols-5 gap-1.5 mb-3">
                {match.board.map((c, i) => (
                  <button key={i} onClick={() => tapCard(i)} disabled={!canGuess || c.revealed}
                    className="rounded-lg flex items-center justify-center text-center leading-tight px-0.5 transition-all active:scale-95"
                    style={{ aspectRatio: '1 / 1', border: '1px solid', fontSize: 'clamp(8px, 2.6vw, 13px)', fontWeight: 700, ...cardStyle(c.color, c.revealed) }}>
                    {c.revealed && c.color === 3 ? '💀' : c.word}
                  </button>
                ))}
              </div>

              {/* Controls */}
              {match.status === 'play' && canClue && (
                <div className="flex gap-2 mb-2">
                  <input value={clueWord} onChange={e => setClueWord(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitClue(); }}
                    placeholder="მინიშნება (1 სიტყვა)" maxLength={24}
                    className="flex-1 px-3 py-2 rounded-xl font-mono text-[14px] text-white bg-white/5 border border-white/10 outline-none focus:border-neon-cyan/40" />
                  <select value={clueNum} onChange={e => setClueNum(Number(e.target.value))} className="px-2 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-sm">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={n} style={{ background: '#161422' }}>{n}</option>)}
                  </select>
                  <button onClick={submitClue} className="px-4 rounded-xl font-mono text-neon-cyan" style={{ border: '1px solid rgba(0,229,255,0.35)' }}>➤</button>
                </div>
              )}
              {match.status === 'play' && canGuess && (
                <button onClick={() => pass()} className="w-full py-2.5 rounded-xl font-mono text-[13px] text-white/60 mb-2" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
                  ჯერის დასრულება →
                </button>
              )}
              {match.status === 'play' && !myTurn && (
                <p className="text-center font-mono text-[12px] text-white/30 mb-2">დაელოდე შენს ჯერს…</p>
              )}
              {match.status === 'play' && myTurn && match.amSpymaster && match.clue && (
                <p className="text-center font-mono text-[12px] text-white/30 mb-2">შენი აგენტები ცნობენ…</p>
              )}

              {match.status === 'finished' && (
                <div className="flex flex-col gap-2.5 items-stretch max-w-[280px] mx-auto mt-4">
                  {match.assassinFired && <p className="text-center font-mono text-[13px] text-neon-red mb-1">💀 მკვლელი გაიხსნა!</p>}
                  {isHost && <button onClick={() => rematch()} className="py-3 rounded-xl font-display font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#ff5d6c,#4d9fff)' }}>თავიდან</button>}
                  <button onClick={() => leaveMatch()} className="py-3 rounded-xl font-mono text-sm text-white/50" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>გასვლა</button>
                </div>
              )}

              {/* Log */}
              {match.log.length > 0 && (
                <div className="mt-3 max-h-24 overflow-y-auto space-y-0.5 px-1">
                  {match.log.slice(-12).map((l, i) => (
                    <p key={i} className="font-mono text-[12px]" style={{ color: TEAM[l.team]!.color }}>
                      {l.kind === 'clue' ? '💡' : l.kind === 'guess' ? '•' : l.kind === 'pass' ? '↦' : ''} <span className="text-white/60">{l.text}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmLeave && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(5,4,10,0.8)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(14,12,26,0.98)', border: '1px solid rgba(155,0,255,0.35)' }}>
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
