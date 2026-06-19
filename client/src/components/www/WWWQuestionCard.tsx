import { useState, useEffect, useRef } from 'react';
import type { WWWMatchPublic } from '@/store/wwwStore';
import type { useWWWVoice } from '@/hooks/useWWWVoice';

interface Props {
  match: WWWMatchPublic;
  myUserId: string;
  voice: ReturnType<typeof useWWWVoice>;
  onAdvanceDiscussion: () => void;
  onSubmitAnswer: (text: string) => void;
  onJudge: (teamId: string, isCorrect: boolean, judgeNote?: string) => void;
  onNextQuestion: () => void;
  onLeave: () => void;
  onChat: (text: string) => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#22c55e',
  medium: '#f59e0b',
  hard: '#ef4444',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'მარტივი',
  medium: 'საშუალო',
  hard: 'რთული',
};

const CATEGORY_LABELS: Record<string, string> = {
  philosophy: 'ფილოსოფია',
  history: 'ისტორია',
  science: 'მეცნიერება',
  movies: 'კინო',
  literature: 'ლიტერატურა',
  geography: 'გეოგრაფია',
  psychology: 'ფსიქოლოგია',
  logic: 'ლოგიკა',
  general: 'ზოგადი',
  mixed: 'შერეული',
};

function Countdown({ endsAt }: { endsAt: number | null }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!endsAt) return;
    const update = () => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(rem);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;

  const pct = Math.min(100, (remaining / 60) * 100);
  const color = remaining <= 10 ? '#ef4444' : remaining <= 20 ? '#f59e0b' : '#00f5ff';

  return (
    <div className="text-center space-y-1">
      <p className="font-mono text-4xl font-bold" style={{ color }}>
        {remaining}
      </p>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function WWWQuestionCard({ match, myUserId, voice, onAdvanceDiscussion, onSubmitAnswer, onJudge, onNextQuestion, onLeave, onChat }: Props) {
  const [answerText, setAnswerText] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [judgeNotes, setJudgeNotes] = useState<Record<string, string>>({});
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [match.chat]);

  const isHost = match.hostId === myUserId;
  const myPlayer = match.players[myUserId];
  const isCaptain = myPlayer?.role === 'captain';
  const myTeamId = myPlayer?.teamId;
  const q = match.currentQuestion;

  function handleSubmitAnswer() {
    if (!answerText.trim()) return;
    onSubmitAnswer(answerText.trim());
    setAnswerText('');
  }

  function handleSendChat() {
    if (!chatInput.trim()) return;
    onChat(chatInput.trim());
    setChatInput('');
  }

  function getTeamName(teamId: string): string {
    return match.teams.find(t => t.id === teamId)?.name ?? teamId;
  }

  function getTeamColor(teamId: string): string {
    return match.teams.find(t => t.id === teamId)?.color ?? '#ffffff';
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(155,0,255,0.2)', background: 'rgba(10,6,28,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <p className="font-display font-bold text-white text-sm">რა? სად? როდის?</p>
            <p className="font-mono text-[10px] text-white/35">
              კითხვა {match.currentQuestionIndex + 1} / {match.totalQuestions}
            </p>
          </div>
        </div>
        {/* Scores */}
        <div className="flex items-center gap-2">
          {match.teams.map(t => (
            <div key={t.id} className="text-center">
              <p className="font-mono text-xs font-bold" style={{ color: t.color }}>{match.scores[t.id] ?? 0}</p>
              <p className="font-mono text-[8px] text-white/30">{t.name}</p>
            </div>
          ))}
          <button
            onClick={onLeave}
            className="ml-2 font-mono text-[10px] text-white/35 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/25 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Question card */}
        {q && (
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.3)' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="font-mono text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: `${DIFFICULTY_COLORS[q.difficulty]}22`, color: DIFFICULTY_COLORS[q.difficulty], border: `1px solid ${DIFFICULTY_COLORS[q.difficulty]}44` }}
              >
                {DIFFICULTY_LABELS[q.difficulty]}
              </span>
              <span className="font-mono text-[9px] text-white/30 uppercase tracking-wider">
                {CATEGORY_LABELS[q.category] ?? q.category}
              </span>
            </div>
            <p className="font-mono text-base text-white leading-relaxed">{q.questionText}</p>
          </div>
        )}

        {/* Timer (discussion phase) */}
        {match.status === 'discussion' && match.timerEndsAt && (
          <div className="py-2">
            <Countdown endsAt={match.timerEndsAt} />
          </div>
        )}

        {/* Status-specific UI */}

        {/* Question phase - host sees advance button */}
        {match.status === 'question' && isHost && (
          <button
            onClick={onAdvanceDiscussion}
            className="w-full py-3 rounded-xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, rgba(0,245,255,0.3), rgba(155,0,255,0.25))', border: '1px solid rgba(0,245,255,0.4)', color: '#fff' }}
          >
            განხილვის დაწყება
          </button>
        )}

        {/* Discussion/answering phase - captain sees answer input */}
        {(match.status === 'discussion' || match.status === 'answering') && (
          <div className="space-y-2">
            {isCaptain && myTeamId && !match.submittedAnswers[myTeamId] ? (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">საბოლოო პასუხი</p>
                <textarea
                  value={answerText}
                  onChange={e => setAnswerText(e.target.value)}
                  placeholder="ჩაწერე გუნდის პასუხი…"
                  rows={2}
                  maxLength={500}
                  className="w-full bg-transparent font-mono text-sm text-white placeholder-white/20 outline-none px-3 py-2 rounded-xl border border-white/15 focus:border-white/35 transition-colors resize-none"
                />
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerText.trim()}
                  className="w-full py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40"
                  style={{ background: 'rgba(0,245,255,0.12)', border: '1px solid rgba(0,245,255,0.3)', color: '#00f5ff' }}
                >
                  პასუხის გაგზავნა
                </button>
              </div>
            ) : (
              isCaptain && myTeamId && match.submittedAnswers[myTeamId] && (
                <div
                  className="px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}
                >
                  <p className="font-mono text-[10px] text-cyan-400 uppercase tracking-wider">პასუხი გაგზავნილია ✓</p>
                  <p className="font-mono text-sm text-white mt-1">{match.submittedAnswers[myTeamId].answerText}</p>
                </div>
              )
            )}

            {/* Other teams' submission status */}
            <div className="flex gap-2 flex-wrap">
              {match.teams.map(t => (
                <div key={t.id} className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: match.submittedAnswers[t.id] ? '#22c55e' : 'rgba(255,255,255,0.2)' }}
                  />
                  <span className="font-mono text-[9px]" style={{ color: t.color }}>{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Judging phase */}
        {match.status === 'judging' && (
          <div className="space-y-3">
            <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">პასუხების შეფასება</p>
            {Object.values(match.submittedAnswers).map(ans => (
              <div
                key={ans.teamId}
                className="rounded-xl p-3 space-y-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${getTeamColor(ans.teamId)}33` }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold" style={{ color: getTeamColor(ans.teamId) }}>
                    {getTeamName(ans.teamId)}
                  </span>
                  {ans.isCorrect !== undefined && (
                    <span className={`font-mono text-[10px] ${ans.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                      {ans.isCorrect ? '✓ სწორია' : '✗ არასწორია'}
                    </span>
                  )}
                </div>
                <p className="font-mono text-sm text-white">{ans.answerText}</p>
                {isHost && ans.isCorrect === undefined && (
                  <div className="space-y-1">
                    <input
                      value={judgeNotes[ans.teamId] ?? ''}
                      onChange={e => setJudgeNotes(n => ({ ...n, [ans.teamId]: e.target.value }))}
                      placeholder="შენიშვნა (სურ.)…"
                      className="w-full bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none px-2 py-1 rounded-lg border border-white/10 focus:border-white/25 transition-colors"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => onJudge(ans.teamId, true, judgeNotes[ans.teamId])}
                        className="flex-1 py-1.5 rounded-lg font-mono text-xs transition-all active:scale-95"
                        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                      >
                        სწორია ✓
                      </button>
                      <button
                        onClick={() => onJudge(ans.teamId, false, judgeNotes[ans.teamId])}
                        className="flex-1 py-1.5 rounded-lg font-mono text-xs transition-all active:scale-95"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}
                      >
                        არასწორია ✗
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Round result */}
        {match.status === 'round_result' && q && (
          <div className="space-y-3">
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              <p className="font-mono text-[10px] text-green-400 uppercase tracking-widest">სწორი პასუხი</p>
              <p className="font-mono text-base text-white font-bold">{q.correctAnswer}</p>
              {match.settings.autoRevealAnswer && (
                <p className="font-mono text-[11px] text-white/50 mt-1">{q.explanation}</p>
              )}
            </div>

            {/* Scores */}
            <div
              className="rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">ქულები</p>
              <div className="flex gap-4">
                {match.teams.map(t => (
                  <div key={t.id} className="text-center">
                    <p className="font-mono text-2xl font-bold" style={{ color: t.color }}>{match.scores[t.id] ?? 0}</p>
                    <p className="font-mono text-[9px]" style={{ color: t.color }}>{t.name}</p>
                  </div>
                ))}
              </div>
            </div>

            {isHost && (
              <button
                onClick={onNextQuestion}
                className="w-full py-3 rounded-xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
                style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
              >
                შემდეგი კითხვა →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chat */}
      <div
        className="flex-shrink-0 border-t"
        style={{ borderColor: 'rgba(155,0,255,0.15)', maxHeight: 160 }}
      >
        <div ref={chatRef} className="overflow-y-auto px-3 py-2 space-y-1" style={{ maxHeight: 110 }}>
          {match.chat.length === 0 && (
            <p className="font-mono text-[10px] text-white/20 text-center py-2">შეტყობინებები ჯერ არ არის.</p>
          )}
          {match.chat.map((msg, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="font-mono text-[10px] text-white/35 flex-shrink-0 mt-0.5">{msg.nickname}</span>
              <span className="font-mono text-[11px] text-white/70 break-words min-w-0">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-3 pb-3">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
            placeholder="დაწერე რამე…"
            maxLength={200}
            className="flex-1 bg-transparent font-mono text-xs text-white placeholder-white/20 outline-none border-b border-white/10 focus:border-white/30 transition-colors py-1"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim()}
            className="font-mono text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-20 px-1"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  );
}
