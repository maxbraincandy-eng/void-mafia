import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWWWStore } from '@/store/wwwStore';
import { useAuthStore } from '@/store/authStore';
import type { WWWTeam, WWWAnswer } from '@/types/www';

const ACCENT = '#a855f7'; // purple

export function WWWGame() {
  const { match, leaveMatch, startMatch, advanceDiscussion, submitAnswer, judgeAnswer, nextQuestion, sendChat, error, clearError } = useWWWStore();
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const myNickname = profile?.username ?? 'Player';

  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!match?.timerEndsAt) { setTimeLeft(null); return; }
    const tick = () => {
      const left = Math.max(0, Math.ceil((match.timerEndsAt! - Date.now()) / 1000));
      setTimeLeft(left);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [match?.timerEndsAt]);

  if (!match) return null;

  const isHost = match.hostId === myId;
  const myPlayer = match.players[myId];
  const myTeam = myPlayer?.teamId ? match.teams.find(t => t.id === myPlayer.teamId) : null;
  const isCaptain = myPlayer?.isCaptain ?? false;
  const isSpectator = myPlayer?.isSpectator ?? false;

  const activeTeams = match.teams.filter(t => t.playerIds.length > 0);
  const allSubmitted = activeTeams.length > 0 && activeTeams.every(t => match.answers[t.id]);

  function handleSendChat() {
    if (!chatText.trim()) return;
    sendChat(chatText.trim(), myNickname);
    setChatText('');
  }

  function handleSubmitAnswer() {
    if (!answerText.trim()) return;
    submitAnswer(answerText.trim());
    setAnswerText('');
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: '#03000d' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.05)' }}>
        <button
          onClick={() => leaveMatch()}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base">🧠</span>
            <span className="font-display font-bold text-sm" style={{ color: ACCENT }}>რა? სად? როდის?</span>
            <StatusBadge status={match.status} />
          </div>
          <p className="font-mono text-[9px] text-white/30 mt-0.5">
            {match.status !== 'waiting' && match.status !== 'finished'
              ? `შეკ ${match.currentQuestionIndex + 1}/${match.totalQuestions}`
              : `კოდი: ${match.code}`}
          </p>
        </div>
        <button
          onClick={() => setChatOpen(o => !o)}
          className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90"
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: chatOpen ? ACCENT : 'rgba(255,255,255,0.4)' }}
        >
          💬
          {match.chat.length > 0 && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500" />}
        </button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            onClick={clearError}
            className="mx-4 mt-3 px-3 py-2 rounded-xl text-xs font-mono cursor-pointer"
            style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#ff2d55' }}>
            {error} ✕
          </motion.div>
        )}
      </AnimatePresence>

      {/* Score bar */}
      <div className="flex gap-2 px-4 py-2">
        {match.teams.filter(t => t.playerIds.length > 0 || match.scores[t.id] !== undefined).map(team => (
          <div key={team.id} className="flex items-center gap-2 px-3 py-1 rounded-xl flex-1"
            style={{ background: `${team.color}15`, border: `1px solid ${team.color}30` }}>
            <span className="font-mono text-xs font-bold truncate" style={{ color: team.color }}>{team.name}</span>
            <span className="font-mono text-lg font-bold ml-auto" style={{ color: team.color }}>{match.scores[team.id] ?? 0}</span>
            {myTeam?.id === team.id && <span className="font-mono text-[9px] text-white/30">(შენ)</span>}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {match.status === 'waiting' && <WaitingScreen match={match} isHost={isHost} myId={myId} onStart={startMatch} />}
        {match.status === 'question' && <QuestionScreen match={match} isHost={isHost} onAdvance={advanceDiscussion} />}
        {match.status === 'discussion' && (
          <DiscussionScreen
            match={match} isHost={isHost} isCaptain={isCaptain} isSpectator={isSpectator}
            answerText={answerText} onAnswerChange={setAnswerText}
            onSubmit={handleSubmitAnswer} timeLeft={timeLeft}
            allSubmitted={allSubmitted}
          />
        )}
        {match.status === 'judging' && <JudgingScreen match={match} isHost={isHost} onJudge={judgeAnswer} />}
        {match.status === 'round_result' && <RoundResultScreen match={match} isHost={isHost} onNext={nextQuestion} />}
        {match.status === 'finished' && <FinishedScreen match={match} onLeave={leaveMatch} />}
      </div>

      {/* Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 flex flex-col rounded-t-2xl"
            style={{ background: 'rgba(8,4,20,0.97)', border: '1px solid rgba(168,85,247,0.2)', maxHeight: '50vh' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              <span className="font-mono text-xs text-white/50">ჩათი</span>
              <button onClick={() => setChatOpen(false)} className="text-white/40 text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1" style={{ maxHeight: '30vh' }}>
              {match.chat.length === 0 && <p className="font-mono text-xs text-white/20 text-center py-4">ჩათი ცარიელია</p>}
              {match.chat.map((msg, i) => (
                <div key={i} className="flex gap-2 text-xs font-mono">
                  <span style={{ color: ACCENT }}>{msg.nickname}:</span>
                  <span className="text-white/70 flex-1">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              <input
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                placeholder="დაწერე შეტყობინება…"
                className="flex-1 bg-transparent text-xs text-white font-mono outline-none placeholder-white/20 px-3 py-2 rounded-xl border border-white/10 focus:border-white/25"
              />
              <button onClick={handleSendChat}
                className="px-3 py-2 rounded-xl text-xs font-mono transition-all active:scale-95"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: ACCENT }}>
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Sub-screens ────────────────────────────────────────────────────────────

function WaitingScreen({ match, isHost, myId, onStart }: { match: any; isHost: boolean; myId: string; onStart: () => void }) {
  const connectedPlayers = Object.values(match.players as Record<string, any>).filter((p: any) => !p.isSpectator);
  return (
    <div className="space-y-4 pt-2">
      <div className="text-center py-4">
        <p className="font-mono text-xs text-white/40 mb-1">კოდი</p>
        <p className="font-display font-bold text-3xl tracking-widest" style={{ color: ACCENT }}>{match.code}</p>
        <p className="font-mono text-[10px] text-white/25 mt-1">გაუზიარე მეგობრებს</p>
      </div>

      {match.teams.map((team: WWWTeam) => (
        <div key={team.id} className="rounded-2xl overflow-hidden" style={{ background: `${team.color}0d`, border: `1px solid ${team.color}25` }}>
          <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: `${team.color}20` }}>
            <span className="w-3 h-3 rounded-full" style={{ background: team.color }} />
            <span className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</span>
            {team.captainId && <span className="ml-auto font-mono text-[9px] text-white/30">კაპ: {match.players[team.captainId]?.nickname ?? '?'}</span>}
          </div>
          <div className="px-4 py-2 space-y-1">
            {team.playerIds.length === 0
              ? <p className="font-mono text-[10px] text-white/20">— ჯერ არავინ —</p>
              : team.playerIds.map((uid: string) => (
                <div key={uid} className="flex items-center gap-2 font-mono text-xs">
                  <span className={match.players[uid]?.connected ? 'text-green-400' : 'text-white/30'}>●</span>
                  <span className="text-white/70">{match.players[uid]?.nickname ?? uid}</span>
                  {team.captainId === uid && <span className="text-[9px] px-1.5 rounded-full" style={{ background: `${team.color}25`, color: team.color }}>კაპიტანი</span>}
                  {uid === myId && <span className="text-[9px] text-white/30">(შენ)</span>}
                </div>
              ))
            }
          </div>
        </div>
      ))}

      <div className="text-center text-xs font-mono text-white/30 mt-2">
        {connectedPlayers.length} მოთამაშე
      </div>

      {isHost && (
        <button
          onClick={onStart}
          disabled={connectedPlayers.length < 1}
          className="w-full py-4 rounded-2xl font-display font-bold text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'rgba(168,85,247,0.15)', border: `1px solid ${ACCENT}40`, color: ACCENT }}>
          თამაშის დაწყება ▶
        </button>
      )}
      {!isHost && (
        <div className="text-center font-mono text-xs text-white/30 py-4">
          ლოდინი… ჰოსტი დაიწყებს თამაშს
        </div>
      )}
    </div>
  );
}

function QuestionScreen({ match, isHost, onAdvance }: { match: any; isHost: boolean; onAdvance: () => void }) {
  const q = match.currentQuestion;
  if (!q) return null;
  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />
      {isHost ? (
        <button onClick={onAdvance}
          className="w-full py-4 rounded-2xl font-display font-bold text-base transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.15)', border: `1px solid ${ACCENT}40`, color: ACCENT }}>
          განხილვა დაიწყე ▶
        </button>
      ) : (
        <div className="text-center font-mono text-xs text-white/30 py-2">ჰოსტი მალე დაიწყებს განხილვას</div>
      )}
    </div>
  );
}

function DiscussionScreen({ match, isHost, isCaptain, isSpectator, answerText, onAnswerChange, onSubmit, timeLeft, allSubmitted }: {
  match: any; isHost: boolean; isCaptain: boolean; isSpectator: boolean;
  answerText: string; onAnswerChange: (v: string) => void; onSubmit: () => void;
  timeLeft: number | null; allSubmitted: boolean;
}) {
  const q = match.currentQuestion;
  if (!q) return null;
  const myTeamId = Object.values(match.players as Record<string, any>).find((p: any) => !p.isSpectator)?.teamId;
  const hasSubmitted = myTeamId ? !!match.answers[myTeamId] : false;

  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />

      {/* Timer */}
      {timeLeft !== null && (
        <div className="flex items-center justify-center gap-3 py-3 rounded-2xl"
          style={{ background: timeLeft <= 10 ? 'rgba(255,45,85,0.08)' : 'rgba(168,85,247,0.06)', border: `1px solid ${timeLeft <= 10 ? 'rgba(255,45,85,0.2)' : 'rgba(168,85,247,0.15)'}` }}>
          <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">დარჩენილი დრო</span>
          <span className="font-display font-bold text-3xl" style={{ color: timeLeft <= 10 ? '#ff2d55' : ACCENT }}>{timeLeft}წ</span>
        </div>
      )}

      {/* Submitted answers status */}
      <div className="space-y-2">
        {match.teams.filter((t: WWWTeam) => t.playerIds.length > 0).map((team: WWWTeam) => {
          const submitted = match.answers[team.id];
          return (
            <div key={team.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{ background: submitted ? `${team.color}15` : 'rgba(255,255,255,0.02)', border: `1px solid ${submitted ? `${team.color}30` : 'rgba(255,255,255,0.06)'}` }}>
              <span className="w-3 h-3 rounded-full" style={{ background: team.color }} />
              <span className="font-mono text-xs flex-1" style={{ color: submitted ? team.color : 'rgba(255,255,255,0.4)' }}>{team.name}</span>
              {submitted ? (
                <span className="font-mono text-[10px] text-white/50">✓ გაგზავნილია</span>
              ) : (
                <span className="font-mono text-[10px] text-white/25">განიხილება…</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Captain answer input */}
      {isCaptain && !isSpectator && !hasSubmitted && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">კაპიტანი — გაგზავნე პასუხი</p>
          <div className="flex gap-2">
            <input
              value={answerText}
              onChange={e => onAnswerChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="გუნდის პასუხი…"
              maxLength={200}
              autoFocus
              className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-3 rounded-xl border border-white/15 focus:border-white/35 transition-colors"
            />
            <button onClick={onSubmit} disabled={!answerText.trim()}
              className="px-4 py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.2)', border: `1px solid ${ACCENT}50`, color: ACCENT }}>
              ✓
            </button>
          </div>
        </div>
      )}
      {isCaptain && hasSubmitted && (
        <div className="text-center font-mono text-xs py-3 rounded-xl" style={{ background: 'rgba(168,85,247,0.08)', color: ACCENT }}>
          ✓ პასუხი გაგზავნილია
        </div>
      )}
      {!isCaptain && !isSpectator && (
        <div className="text-center font-mono text-xs text-white/30 py-2">
          კაპიტანი გამოაგზავნის პასუხს
        </div>
      )}

      {/* Host advance if all submitted */}
      {isHost && allSubmitted && (
        <button
          onClick={() => { /* wait for auto-advance */ }}
          className="w-full py-3 rounded-2xl font-mono text-xs text-white/30 transition-all"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          ყველამ გაგზავნა — ავტო-გადასვლა მსაჯობაზე
        </button>
      )}
    </div>
  );
}

function JudgingScreen({ match, isHost, onJudge }: { match: any; isHost: boolean; onJudge: (teamId: string, isCorrect: boolean) => void }) {
  const q = match.currentQuestion;
  if (!q) return null;
  const teams = match.teams.filter((t: WWWTeam) => t.playerIds.length > 0);
  const pendingJudge = teams.filter((t: WWWTeam) => {
    const a: WWWAnswer | undefined = match.answers[t.id];
    return a && a.isCorrect === undefined;
  });

  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />

      {/* Correct answer reveal */}
      <div className="px-4 py-3 rounded-2xl text-center"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">სწორი პასუხი</p>
        <p className="font-display font-bold text-base text-green-400">{q.correctAnswer}</p>
        {q.explanation && <p className="font-mono text-[10px] text-white/30 mt-1">{q.explanation}</p>}
      </div>

      {/* Answers to judge */}
      <div className="space-y-3">
        {teams.map((team: WWWTeam) => {
          const answer: WWWAnswer | undefined = match.answers[team.id];
          if (!answer) return (
            <div key={team.id} className="px-3 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="font-mono text-xs text-white/30">{team.name} — პასუხი არ გამოუგზავნია</span>
            </div>
          );
          const judged = answer.isCorrect !== undefined;
          return (
            <div key={team.id} className="rounded-xl overflow-hidden"
              style={{ background: judged ? (answer.isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(255,45,85,0.06)') : `${team.color}0d`, border: `1px solid ${judged ? (answer.isCorrect ? 'rgba(34,197,94,0.25)' : 'rgba(255,45,85,0.2)') : `${team.color}25`}` }}>
              <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <span className="w-3 h-3 rounded-full" style={{ background: team.color }} />
                <span className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</span>
                {judged && <span className="ml-auto font-mono text-[10px]" style={{ color: answer.isCorrect ? '#22c55e' : '#ff2d55' }}>{answer.isCorrect ? '✓ სწორი' : '✗ არასწორი'}</span>}
              </div>
              <div className="px-3 py-2">
                <p className="font-mono text-sm text-white">{answer.answerText}</p>
              </div>
              {isHost && !judged && (
                <div className="px-3 pb-3 flex gap-2">
                  <button onClick={() => onJudge(team.id, true)}
                    className="flex-1 py-2 rounded-xl font-mono text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
                    ✓ სწორია
                  </button>
                  <button onClick={() => onJudge(team.id, false)}
                    className="flex-1 py-2 rounded-xl font-mono text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#ff2d55' }}>
                    ✗ არასწორი
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isHost && pendingJudge.length > 0 && (
        <div className="text-center font-mono text-xs text-white/30 py-2">ჰოსტი ამოწმებს პასუხებს…</div>
      )}
    </div>
  );
}

function RoundResultScreen({ match, isHost, onNext }: { match: any; isHost: boolean; onNext: () => void }) {
  const q = match.currentQuestion;
  const isLast = match.currentQuestionIndex + 1 >= match.totalQuestions;

  return (
    <div className="space-y-4 pt-2">
      {q && (
        <div className="px-4 py-3 rounded-2xl text-center" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-1">სწორი პასუხი იყო</p>
          <p className="font-display font-bold text-base text-green-400">{q.correctAnswer}</p>
          {q.explanation && <p className="font-mono text-[10px] text-white/30 mt-1">{q.explanation}</p>}
        </div>
      )}

      <div className="space-y-2">
        {match.teams.filter((t: WWWTeam) => t.playerIds.length > 0).map((team: WWWTeam) => {
          const answer: WWWAnswer | undefined = match.answers[team.id];
          return (
            <div key={team.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: `${team.color}0d`, border: `1px solid ${team.color}25` }}>
              <span className="w-3 h-3 rounded-full" style={{ background: team.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</p>
                {answer && <p className="font-mono text-[10px] text-white/40 truncate">{answer.answerText}</p>}
              </div>
              {answer?.isCorrect !== undefined && (
                <span className="font-mono text-sm" style={{ color: answer.isCorrect ? '#22c55e' : '#ff2d55' }}>
                  {answer.isCorrect ? '✓' : '✗'}
                </span>
              )}
              <span className="font-display font-bold text-xl ml-2" style={{ color: team.color }}>{match.scores[team.id] ?? 0}</span>
            </div>
          );
        })}
      </div>

      {isHost && (
        <button onClick={onNext}
          className="w-full py-4 rounded-2xl font-display font-bold text-base transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.15)', border: `1px solid ${ACCENT}40`, color: ACCENT }}>
          {isLast ? 'შედეგები ▶' : `შეკითხვა ${match.currentQuestionIndex + 2} ▶`}
        </button>
      )}
      {!isHost && <div className="text-center font-mono text-xs text-white/30 py-2">ჰოსტი გააგრძელებს…</div>}
    </div>
  );
}

function FinishedScreen({ match, onLeave }: { match: any; onLeave: () => void }) {
  const sorted = [...match.teams].sort((a: WWWTeam, b: WWWTeam) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0));
  const winner = sorted[0];

  return (
    <div className="space-y-4 pt-4 text-center">
      <div>
        <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest mb-2">გამარჯვებული</p>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: `${winner?.color ?? ACCENT}20`, border: `2px solid ${winner?.color ?? ACCENT}` }}>
          <span className="text-3xl">🏆</span>
        </div>
        <p className="font-display font-bold text-2xl" style={{ color: winner?.color ?? ACCENT }}>{winner?.name ?? '?'}</p>
        <p className="font-mono text-sm text-white/40 mt-1">{match.scores[winner?.id] ?? 0} ქულა</p>
      </div>

      <div className="space-y-2">
        {sorted.map((team: WWWTeam, i: number) => (
          <div key={team.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: `${team.color}0d`, border: `1px solid ${team.color}25` }}>
            <span className="font-mono text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
            <span className="font-mono text-sm flex-1 text-left" style={{ color: team.color }}>{team.name}</span>
            <span className="font-display font-bold text-xl" style={{ color: team.color }}>{match.scores[team.id] ?? 0}</span>
          </div>
        ))}
      </div>

      <button onClick={onLeave}
        className="w-full py-3 rounded-2xl font-mono text-sm transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
        თამაშების მენიუ ←
      </button>
    </div>
  );
}

function QuestionCard({ q, index, total }: { q: any; index: number; total: number }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}>
      <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(168,85,247,0.12)' }}>
        <span className="font-mono text-[9px] text-white/30 uppercase tracking-widest">{q.category}</span>
        <DiffBadge diff={q.difficulty} />
        <span className="ml-auto font-mono text-[9px] text-white/25">{index + 1}/{total}</span>
      </div>
      <div className="px-4 py-4">
        <p className="font-display font-bold text-base text-white leading-relaxed">{q.questionText}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    waiting:      { label: 'ლოდინი',   color: '#a1a1aa' },
    question:     { label: 'შეკ.',      color: '#a855f7' },
    discussion:   { label: 'განხ.',     color: '#f59e0b' },
    judging:      { label: 'მსაჯობა',  color: '#0090ff' },
    round_result: { label: 'შედეგი',   color: '#22c55e' },
    finished:     { label: 'დასრულდა', color: '#22c55e' },
  };
  const s = labels[status] ?? { label: status, color: '#a1a1aa' };
  return (
    <span className="px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const colors = { easy: '#22c55e', medium: '#f59e0b', hard: '#ff2d55' };
  const c = colors[diff as keyof typeof colors] ?? '#a1a1aa';
  return (
    <span className="px-1.5 py-0.5 rounded-full font-mono text-[8px] uppercase tracking-wider"
      style={{ background: `${c}20`, color: c, border: `1px solid ${c}30` }}>
      {diff === 'easy' ? 'მარტ.' : diff === 'medium' ? 'საშ.' : 'რთ.'}
    </span>
  );
}
