import { useState, useEffect, useRef } from 'react';
import type { WWWMatchPublic } from '@/store/wwwStore';
import type { useWWWVoice } from '@/hooks/useWWWVoice';
import { WWWVoiceBar } from './WWWVoiceBar';

interface Props {
  match: WWWMatchPublic;
  myUserId: string;
  voice: ReturnType<typeof useWWWVoice>;
  onAdvanceDiscussion: () => void;
  onSubmitAnswer: (text: string) => void;
  onJudge: (teamId: string, isCorrect: boolean) => void;
  onNextQuestion: () => void;
  onLeave: () => void;
  onChat: (text: string) => void;
}

export function WWWQuestionCard({
  match, myUserId, voice,
  onAdvanceDiscussion, onSubmitAnswer, onJudge, onNextQuestion, onLeave, onChat,
}: Props) {
  const [answerText, setAnswerText] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const myPlayer = match.players[myUserId];
  const isHost = match.hostId === myUserId;
  const isCaptain = myPlayer?.role === 'captain';
  const myTeamId = myPlayer?.teamId;

  // Timer countdown
  useEffect(() => {
    if (!match.timerEndsAt) { setSecondsLeft(null); return; }
    const update = () => {
      const secs = Math.max(0, Math.ceil((match.timerEndsAt! - Date.now()) / 1000));
      setSecondsLeft(secs);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [match.timerEndsAt]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [match.chat.length, chatOpen]);

  const q = match.currentQuestion;

  const categoryLabel: Record<string, string> = {
    philosophy: 'ფილოსოფია', history: 'ისტორია', science: 'მეცნიერება',
    movies: 'კინო', literature: 'ლიტერატურა', geography: 'გეოგრაფია',
    psychology: 'ფსიქოლოგია', logic: 'ლოგიკა', general: 'საერთო', mixed: 'შერეული',
  };
  const diffColor: Record<string, string> = {
    easy: '#22c55e', medium: '#fbbf24', hard: '#ff2244',
  };

  const myTeamAnswer = myTeamId ? match.submittedAnswers[myTeamId] : undefined;

  function handleSubmit() {
    if (!answerText.trim()) return;
    onSubmitAnswer(answerText.trim());
    setAnswerText('');
  }

  function sendChat() {
    if (!chatMsg.trim()) return;
    onChat(chatMsg.trim());
    setChatMsg('');
  }

  // Percentage of timer used
  const totalSecs = match.settings.discussionSeconds;
  const pct = secondsLeft !== null ? (secondsLeft / totalSecs) * 100 : 100;
  const timerColor = secondsLeft !== null && secondsLeft <= 10 ? '#ff2244' : '#00f5ff';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#03000d', color: '#fff' }}>
      {/* Voice bar */}
      <WWWVoiceBar voice={voice} matchId={match.id} myRole={myPlayer?.role ?? 'spectator'} />

      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          კითხვა {match.currentQuestionIndex + 1} / {match.totalQuestions}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(v => !v)}
            className="font-mono text-xs px-2 py-1 rounded-lg transition-all"
            style={{
              background: chatOpen ? 'rgba(155,0,255,0.2)' : 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: chatOpen ? '#c084fc' : 'rgba(255,255,255,0.4)',
            }}
          >
            💬 {match.chat.length > 0 ? match.chat.length : ''}
          </button>
          <button
            onClick={onLeave}
            className="font-mono text-[10px] px-2 py-1 rounded-lg transition-all"
            style={{ background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.15)', color: 'rgba(255,45,85,0.5)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex px-4 py-2 gap-3">
        {match.teams.map(team => (
          <div
            key={team.id}
            className="flex-1 flex items-center justify-between px-3 py-1.5 rounded-xl"
            style={{ background: `${team.color}12`, border: `1px solid ${team.color}25` }}
          >
            <span className="font-mono text-xs truncate" style={{ color: team.color }}>
              {team.name}
            </span>
            <span className="font-mono font-bold text-lg" style={{ color: team.color }}>
              {match.scores[team.id] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-4 pb-4">
        {/* Question card */}
        {q && (
          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              background: 'rgba(10,6,28,0.9)',
              border: '1px solid rgba(155,0,255,0.2)',
              boxShadow: '0 0 30px rgba(155,0,255,0.05)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(155,0,255,0.15)', color: '#c084fc', border: '1px solid rgba(155,0,255,0.3)' }}
              >
                {categoryLabel[q.category] ?? q.category}
              </span>
              <span
                className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: `${diffColor[q.difficulty]}18`,
                  color: diffColor[q.difficulty],
                  border: `1px solid ${diffColor[q.difficulty]}40`,
                }}
              >
                {q.difficulty === 'easy' ? 'მარტივი' : q.difficulty === 'medium' ? 'საშუალო' : 'რთული'}
              </span>
            </div>
            <p className="font-display text-base leading-relaxed text-center" style={{ color: '#fff' }}>
              {q.questionText}
            </p>
          </div>
        )}

        {/* Timer */}
        {match.status === 'discussion' && secondsLeft !== null && (
          <div className="mb-4">
            <div className="flex items-center justify-center mb-2">
              <span
                className="font-mono text-5xl font-bold"
                style={{ color: timerColor, textShadow: `0 0 20px ${timerColor}60` }}
              >
                {secondsLeft}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: timerColor }}
              />
            </div>
          </div>
        )}

        {/* Phase-specific UI */}

        {/* question phase */}
        {match.status === 'question' && (
          <div className="text-center">
            {isHost ? (
              <button
                onClick={onAdvanceDiscussion}
                className="px-6 py-3 rounded-2xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95"
                style={{
                  background: 'rgba(0,245,255,0.12)',
                  border: '1px solid rgba(0,245,255,0.4)',
                  color: '#00f5ff',
                  boxShadow: '0 0 20px rgba(0,245,255,0.1)',
                }}
              >
                განხილვის დაწყება
              </button>
            ) : (
              <p className="font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                ველოდებით...
              </p>
            )}
          </div>
        )}

        {/* discussion phase */}
        {match.status === 'discussion' && (
          <div>
            {isCaptain && myTeamId && !myTeamAnswer ? (
              <div className="space-y-2">
                <p className="font-mono text-xs text-center mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  კაპიტანი — გუნდის პასუხი
                </p>
                <textarea
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  placeholder="პასუხი..."
                  rows={2}
                  className="w-full bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors resize-none"
                />
                <button
                  onClick={handleSubmit}
                  disabled={!answerText.trim()}
                  className="w-full py-2.5 rounded-2xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30"
                  style={{
                    background: 'rgba(0,245,255,0.12)',
                    border: '1px solid rgba(0,245,255,0.4)',
                    color: '#00f5ff',
                  }}
                >
                  გაგზავნა
                </button>
              </div>
            ) : myTeamAnswer ? (
              <div
                className="rounded-xl p-3 text-center"
                style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)' }}
              >
                <p className="font-mono text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  გაგზავნილი პასუხი:
                </p>
                <p className="font-mono text-sm" style={{ color: '#00f5ff' }}>{myTeamAnswer.answerText}</p>
              </div>
            ) : (
              <p className="text-center font-mono text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                განიხილეთ და კაპიტანი გაგზავნის პასუხს...
              </p>
            )}
          </div>
        )}

        {/* judging phase */}
        {match.status === 'judging' && (
          <div className="space-y-3">
            {isHost ? (
              <>
                <p className="font-mono text-xs text-center mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  მსაჯი — შეამოწმე პასუხები
                </p>
                {match.teams.map(team => {
                  const ans = match.submittedAnswers[team.id];
                  if (!ans) return null;
                  const judged = ans.isCorrect !== undefined;
                  return (
                    <div
                      key={team.id}
                      className="rounded-xl p-3"
                      style={{ background: 'rgba(10,6,28,0.8)', border: `1px solid ${team.color}25` }}
                    >
                      <p className="font-mono text-[10px] mb-1" style={{ color: team.color }}>
                        {team.name}
                      </p>
                      <p className="font-mono text-sm mb-2" style={{ color: '#fff' }}>
                        {ans.answerText}
                      </p>
                      {!judged ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onJudge(team.id, true)}
                            className="flex-1 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
                            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                          >
                            სწორია
                          </button>
                          <button
                            onClick={() => onJudge(team.id, false)}
                            className="flex-1 py-1.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
                            style={{ background: 'rgba(255,34,68,0.15)', border: '1px solid rgba(255,34,68,0.4)', color: '#ff2244' }}
                          >
                            არასწორია
                          </button>
                        </div>
                      ) : (
                        <div
                          className="text-center font-mono text-xs py-1 rounded-lg"
                          style={{
                            background: ans.isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(255,34,68,0.1)',
                            color: ans.isCorrect ? '#22c55e' : '#ff2244',
                          }}
                        >
                          {ans.isCorrect ? 'სწორია' : 'არასწორია'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-center font-mono text-sm mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  ველოდებით მსაჯის გადაწყვეტილებას...
                </p>
                {myTeamAnswer && (
                  <div
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <p className="font-mono text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>შენი გუნდის პასუხი:</p>
                    <p className="font-mono text-sm" style={{ color: '#fff' }}>{myTeamAnswer.answerText}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* round_result phase */}
        {match.status === 'round_result' && q && (
          <div className="space-y-3">
            {/* Correct answer reveal */}
            <div
              className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <p className="font-mono text-[10px] mb-1" style={{ color: 'rgba(34,197,94,0.6)' }}>
                სწორი პასუხი:
              </p>
              <p className="font-display font-bold text-lg" style={{ color: '#22c55e' }}>
                {q.correctAnswer}
              </p>
              {q.explanation && (
                <p className="font-mono text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {q.explanation}
                </p>
              )}
            </div>

            {/* Team results */}
            {match.teams.map(team => {
              const ans = match.submittedAnswers[team.id];
              if (!ans) return null;
              const correct = ans.isCorrect === true;
              return (
                <div
                  key={team.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{
                    background: correct ? 'rgba(34,197,94,0.06)' : 'rgba(255,34,68,0.06)',
                    border: `1px solid ${correct ? 'rgba(34,197,94,0.2)' : 'rgba(255,34,68,0.2)'}`,
                  }}
                >
                  <span className="text-lg">{correct ? '✓' : '✗'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px]" style={{ color: team.color }}>{team.name}</p>
                    <p className="font-mono text-xs truncate" style={{ color: '#fff' }}>{ans.answerText}</p>
                  </div>
                  <span className="font-mono font-bold" style={{ color: correct ? '#22c55e' : '#ff2244' }}>
                    {correct ? '+1' : '0'}
                  </span>
                </div>
              );
            })}

            {isHost && (
              <button
                onClick={onNextQuestion}
                className="w-full py-3 rounded-2xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95 mt-2"
                style={{
                  background: 'rgba(0,245,255,0.12)',
                  border: '1px solid rgba(0,245,255,0.4)',
                  color: '#00f5ff',
                }}
              >
                {match.currentQuestionIndex + 1 >= match.totalQuestions
                  ? 'შედეგები'
                  : 'შემდეგი კითხვა'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chat overlay */}
      {chatOpen && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
          style={{ height: '50vh', background: 'rgba(3,0,13,0.95)', borderTop: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-mono text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>ჩატი</span>
            <button onClick={() => setChatOpen(false)} className="font-mono text-xs text-white/40">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
            {match.chat.length === 0 && (
              <p className="font-mono text-xs text-center py-4" style={{ color: 'rgba(255,255,255,0.2)' }}>
                შეტყობინებები ჯერ არ არის.
              </p>
            )}
            {match.chat.map((msg, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="font-mono text-[9px] shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {msg.nickname}:
                </span>
                <span className="font-mono text-xs" style={{ color: '#fff' }}>{msg.text}</span>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex gap-2 px-4 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
              placeholder="დაწერე რამე..."
              className="flex-1 bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/10 focus:border-white/25 transition-colors"
            />
            <button
              onClick={sendChat}
              disabled={!chatMsg.trim()}
              className="px-3 py-2 rounded-xl font-mono text-xs uppercase transition-all active:scale-95 disabled:opacity-30"
              style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
            >
              გაგზავნა
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
