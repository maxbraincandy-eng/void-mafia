import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWWWStore } from '@/store/wwwStore';
import { useAuthStore } from '@/store/authStore';
import { useWWWVoice } from '@/hooks/useWWWVoice';
import { useLiveKitGate, useLivekitRoomVoice } from '@/hooks/useLivekitVoice';
import { LiveKitVoiceBarView } from '@/components/game/LiveKitVoiceBar';
import type { WWWMatchPublic, WWWTeam, WWWAnswer } from '@/types/www';

const ACCENT = '#a855f7';

// ── Timer ring ────────────────────────────────────────────────────────────────
function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? seconds / total : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const color = seconds <= 10 ? '#ff2d55' : ACCENT;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
      />
      <text x="36" y="41" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">{seconds}</text>
    </svg>
  );
}

// ── StatusBadge ────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, { label: string; color: string }> = {
    waiting:      { label: 'ლოდინი',   color: '#a1a1aa' },
    question:     { label: 'შეკ.',      color: ACCENT },
    discussion:   { label: 'განხ.',     color: '#f59e0b' },
    judging:      { label: 'მსაჯობა',  color: '#0090ff' },
    round_result: { label: 'შედეგი',   color: '#22c55e' },
    finished:     { label: 'დასრულდა', color: '#22c55e' },
  };
  const s = labels[status] ?? { label: status, color: '#a1a1aa' };
  return (
    <span
      className="px-2 py-0.5 rounded-full font-mono text-[12px] uppercase"
      style={{ background: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}
    >
      {s.label}
    </span>
  );
}

// ── DiffBadge ─────────────────────────────────────────────────────────────────
function DiffBadge({ diff }: { diff: string }) {
  const colors: Record<string, string> = { easy: '#22c55e', medium: '#f59e0b', hard: '#ff2d55' };
  const c = colors[diff] ?? '#a1a1aa';
  return (
    <span
      className="px-1.5 py-0.5 rounded-full font-mono text-[12px] uppercase"
      style={{ background: `${c}20`, color: c, border: `1px solid ${c}30` }}
    >
      {diff === 'easy' ? 'მარტ.' : diff === 'medium' ? 'საშ.' : 'რთ.'}
    </span>
  );
}

// ── QuestionCard ──────────────────────────────────────────────────────────────
function QuestionCard({ q, index, total }: { q: any; index: number; total: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(8,4,20,0.95)', border: '1px solid rgba(168,85,247,0.25)' }}
    >
      <div
        className="px-4 py-2 flex items-center gap-2 border-b"
        style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.06)' }}
      >
        <span className="font-mono text-[12px] text-white/40 uppercase tracking-wide">{q.category}</span>
        <DiffBadge diff={q.difficulty} />
        <span className="ml-auto font-mono text-[12px] text-white/25">{index + 1}/{total}</span>
      </div>
      <div className="px-4 py-5">
        <p className="font-display font-bold text-[18px] text-white leading-relaxed">{q.questionText}</p>
      </div>
    </div>
  );
}

// ── VoiceStatusBar ────────────────────────────────────────────────────────────
function VoiceStatusBar({ status, peers }: { status: string; peers: any[] }) {
  const dot = status === 'connected' ? '#22c55e'
    : status === 'failed' ? '#ff2d55'
    : '#f59e0b';
  const label = status === 'connected' ? `● Voice Connected (${peers.length} peer${peers.length !== 1 ? 's' : ''})`
    : status === 'failed' ? '✕ Voice Failed'
    : status === 'disconnected' ? '◌ Voice Off'
    : '◌ Connecting…';
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <span className="font-mono text-[12px]" style={{ color: dot }}>{label}</span>
    </div>
  );
}

// ── TeamPanel ─────────────────────────────────────────────────────────────────
function TeamPanel({
  team, match, myId, speakingSocketIds, peers, isTalking,
}: {
  team: WWWTeam;
  match: WWWMatchPublic;
  myId: string;
  speakingSocketIds: string[];
  peers: Array<{ socketId: string; name: string }>;
  isTalking: boolean;
}) {
  const answer: WWWAnswer | undefined = match.answers[team.id];
  const score = match.scores[team.id] ?? 0;
  const captain = team.captainId ? match.players[team.captainId] : null;

  const answerStatus = () => {
    if (!answer) return { text: 'ელოდება…', color: 'rgba(255,255,255,0.3)' };
    if (answer.isCorrect === true) return { text: '✓ სწორია', color: '#22c55e' };
    if (answer.isCorrect === false) return { text: '✗ არასწორი', color: '#ff2d55' };
    return { text: '✓ გაგზავნილია', color: '#f59e0b' };
  };

  const as = answerStatus();

  return (
    <div
      className="rounded-2xl overflow-hidden flex-1"
      style={{ background: 'rgba(8,4,20,0.95)', border: `1px solid ${team.color}30` }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-2 border-b"
        style={{ background: `${team.color}12`, borderColor: `${team.color}20` }}
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} />
        <span className="font-mono text-xs font-bold flex-1 truncate" style={{ color: team.color }}>{team.name}</span>
        <span className="font-display font-bold text-xl" style={{ color: team.color }}>{score}</span>
      </div>

      {/* Captain */}
      {captain && (
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <span className="text-[12px]">👑</span>
          <span className="font-mono text-[12px] text-white/50 truncate">{captain.nickname}</span>
        </div>
      )}

      {/* Members */}
      <div className="px-3 pb-2 space-y-0.5">
        {team.playerIds.map(uid => {
          const p = match.players[uid];
          if (!p) return null;
          // Match by name — best effort since WWW doesn't expose per-player socketId
          const peer = peers.find(pr => pr.name === p.nickname);
          const isSpeaking = uid === myId
            ? isTalking
            : peer ? speakingSocketIds.includes(peer.socketId) : false;
          return (
            <div key={uid} className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all"
                style={{
                  background: p.connected ? '#22c55e' : 'rgba(255,255,255,0.15)',
                  boxShadow: (isSpeaking && p.connected) ? `0 0 6px #22c55e` : 'none',
                }}
              />
              <span
                className="font-mono text-[12px] truncate"
                style={{ color: uid === myId ? ACCENT : 'rgba(255,255,255,0.55)' }}
              >
                {p.nickname}{uid === myId ? ' ★' : ''}{team.captainId === uid ? ' 👑' : ''}
              </span>
            </div>
          );
        })}
        {team.playerIds.length === 0 && (
          <p className="font-mono text-[12px] text-white/20">— ცარიელია —</p>
        )}
      </div>

      {/* Answer status */}
      {match.status !== 'waiting' && match.status !== 'question' && (
        <div
          className="mx-2 mb-2 px-2 py-1 rounded-lg text-center"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="font-mono text-[12px]" style={{ color: as.color }}>{as.text}</span>
        </div>
      )}
    </div>
  );
}

// ── WaitingScreen ─────────────────────────────────────────────────────────────
function WaitingScreen({
  match, isHost, myId, onStart, onSetRole,
}: {
  match: WWWMatchPublic; isHost: boolean; myId: string; onStart: () => void;
  onSetRole: (role: 'team_a' | 'team_b' | 'spectator') => void;
}) {
  const connectedPlayers = Object.values(match.players).filter(p => !p.isSpectator);
  const host = match.players[match.hostId];
  const myTeam = match.players[myId]?.teamId ?? null;
  const bothTeamsReady = match.teams.every(t => t.playerIds.length > 0);
  return (
    <div className="space-y-4 pt-2">
      {/* Join code */}
      <div
        className="text-center py-5 rounded-2xl"
        style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
      >
        <p className="font-mono text-[12px] text-white/35 mb-1 uppercase tracking-wide">კოდი</p>
        <p className="font-display font-bold text-4xl tracking-normal" style={{ color: ACCENT }}>{match.code}</p>
        <p className="font-mono text-[12px] text-white/25 mt-2">გაუზიარე მეგობრებს</p>
      </div>

      {/* Host / moderator */}
      <div className="rounded-2xl px-4 py-3 flex items-center gap-2.5" style={{ background: 'rgba(168,85,247,0.08)', border: `1px solid ${ACCENT}30` }}>
        <span style={{ fontSize: 18 }}>🎙️</span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-widest" style={{ color: ACCENT }}>წამყვანი</p>
          <p className="font-mono text-[13px] text-white/75 truncate">{host?.nickname ?? '—'}{match.hostId === myId ? ' (შენ)' : ''}</p>
        </div>
      </div>

      {/* Role picker hint */}
      {!isHost && (
        <p className="text-center font-mono text-[12px] text-white/40">აირჩიე გუნდი 👇</p>
      )}

      {/* Teams */}
      <div className="flex gap-3">
        {match.teams.map(team => {
          const mine = myTeam === team.id;
          return (
            <div
              key={team.id}
              className="flex-1 rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'rgba(8,4,20,0.95)', border: `1px solid ${mine ? team.color + '70' : team.color + '25'}` }}
            >
              <div
                className="px-3 py-2 flex items-center gap-2 border-b"
                style={{ background: `${team.color}0d`, borderColor: `${team.color}18` }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: team.color }} />
                <span className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</span>
                <span className="ml-auto font-mono text-[11px]" style={{ color: team.color }}>{team.playerIds.length}</span>
              </div>
              <div className="px-3 py-2 space-y-1 flex-1">
                {team.playerIds.length === 0 ? (
                  <p className="font-mono text-[12px] text-white/20">— ჯერ არავინ —</p>
                ) : team.playerIds.map(uid => (
                  <div key={uid} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${match.players[uid]?.connected ? 'bg-green-400' : 'bg-white/20'}`} />
                    <span className="font-mono text-[12px] text-white/65 truncate">{match.players[uid]?.nickname ?? uid}</span>
                    {team.captainId === uid && (
                      <span className="font-mono text-[11px] px-1.5 rounded-full flex-shrink-0" style={{ background: `${team.color}20`, color: team.color }}>კაპ</span>
                    )}
                    {uid === myId && <span className="font-mono text-[11px] text-white/25 flex-shrink-0">(შენ)</span>}
                  </div>
                ))}
              </div>
              {/* Join button — participants (not the host) pick a team */}
              {!isHost && !mine && (
                <button
                  onClick={() => onSetRole(team.id as 'team_a' | 'team_b')}
                  className="m-2 py-2 rounded-xl font-mono text-[12px] font-bold transition-all active:scale-95"
                  style={{ background: `${team.color}1e`, border: `1px solid ${team.color}55`, color: team.color }}
                >
                  შემოგვიერთდი
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center font-mono text-[12px] text-white/30">{connectedPlayers.length} მონაწილე</div>

      {isHost ? (
        <>
          <button
            onClick={onStart}
            disabled={!bothTeamsReady}
            className="w-full py-4 rounded-2xl font-display font-bold text-[15px] transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(168,85,247,0.18)', border: `1px solid ${ACCENT}45`, color: ACCENT }}
          >
            თამაშის დაწყება ▶
          </button>
          {!bothTeamsReady && (
            <p className="text-center font-mono text-[11px] text-white/30">ორივე გუნდში სჭირდება მინიმუმ 1 მონაწილე</p>
          )}
        </>
      ) : (
        <div className="text-center font-mono text-xs text-white/30 py-2">ლოდინი… წამყვანი დაიწყებს თამაშს</div>
      )}
    </div>
  );
}

// ── QuestionScreen ────────────────────────────────────────────────────────────
function QuestionScreen({
  match, isHost, onAdvance,
}: {
  match: WWWMatchPublic; isHost: boolean; onAdvance: () => void;
}) {
  const q = match.currentQuestion;
  if (!q) return null;
  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />
      {isHost ? (
        <button
          onClick={onAdvance}
          className="w-full py-4 rounded-2xl font-display font-bold text-[15px] transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.18)', border: `1px solid ${ACCENT}45`, color: ACCENT }}
        >
          განხილვა დაიწყე ▶
        </button>
      ) : (
        <div
          className="text-center py-4 rounded-2xl font-mono text-xs text-white/35"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          ჰოსტი დაიწყებს განხილვას
        </div>
      )}
    </div>
  );
}

// ── DiscussionScreen ──────────────────────────────────────────────────────────
function DiscussionScreen({
  match, isHost, myId, isCaptain, isSpectator,
  answerText, onAnswerChange, onSubmit, timeLeft,
  voice,
}: {
  match: WWWMatchPublic;
  isHost: boolean;
  myId: string;
  isCaptain: boolean;
  isSpectator: boolean;
  answerText: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  timeLeft: number | null;
  voice: ReturnType<typeof useWWWVoice>;
}) {
  const q = match.currentQuestion;
  if (!q) return null;

  const myPlayer = match.players[myId];
  const myTeamId = myPlayer?.teamId;
  const hasSubmitted = myTeamId ? !!match.answers[myTeamId] : false;
  const totalSecs = match.settings?.discussionSeconds ?? 60;

  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />

      {/* Timer + PTT row */}
      <div className="flex items-center gap-3">
        {timeLeft !== null && (
          <TimerRing seconds={timeLeft} total={totalSecs} />
        )}

        {/* PTT button */}
        {!isSpectator && (
          <button
            onPointerDown={() => voice.startTalk(match.id)}
            onPointerUp={() => voice.stopTalk(match.id)}
            onPointerLeave={() => voice.stopTalk(match.id)}
            className="flex-1 py-3 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-95 select-none"
            style={{
              background: voice.isTalking
                ? 'rgba(168,85,247,0.35)'
                : 'rgba(168,85,247,0.1)',
              border: voice.isTalking
                ? `1px solid ${ACCENT}80`
                : '1px solid rgba(168,85,247,0.25)',
              color: voice.isTalking ? '#fff' : ACCENT,
              boxShadow: voice.isTalking ? `0 0 16px rgba(168,85,247,0.4)` : 'none',
            }}
          >
            {voice.isTalking ? '🎙 SPEAKING' : '🎤 HOLD TO TALK'}
          </button>
        )}
      </div>

      {/* Team answer status */}
      <div className="space-y-2">
        {match.teams.filter(t => t.playerIds.length > 0).map(team => {
          const submitted = match.answers[team.id];
          return (
            <div
              key={team.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{
                background: submitted ? `${team.color}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${submitted ? `${team.color}30` : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} />
              <span
                className="font-mono text-xs flex-1"
                style={{ color: submitted ? team.color : 'rgba(255,255,255,0.4)' }}
              >
                {team.name}
              </span>
              {submitted ? (
                <span className="font-mono text-[12px] text-white/50">✓ პასუხი გაგზავნილია</span>
              ) : (
                <span className="font-mono text-[12px] text-white/25">ელოდება…</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Captain answer input */}
      {isCaptain && !isSpectator && !hasSubmitted && (
        <div className="space-y-2">
          <p className="font-mono text-[12px] text-white/40 uppercase tracking-wide">კაპიტანი — გაგზავნე პასუხი</p>
          <div className="flex gap-2">
            <input
              value={answerText}
              onChange={e => onAnswerChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
              placeholder="გუნდის პასუხი…"
              maxLength={200}
              autoFocus
              className="flex-1 bg-transparent font-mono text-[15px] text-white placeholder-white/20 outline-none px-3 py-3 rounded-xl border border-white/15 focus:border-white/35 transition-colors"
            />
            <button
              onClick={onSubmit}
              disabled={!answerText.trim()}
              className="px-4 py-3 rounded-xl font-mono text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(168,85,247,0.2)', border: `1px solid ${ACCENT}50`, color: ACCENT }}
            >
              ✓
            </button>
          </div>
        </div>
      )}
      {isCaptain && hasSubmitted && (
        <div
          className="text-center font-mono text-[13px] py-3 rounded-xl"
          style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: ACCENT }}
        >
          ✓ პასუხი გაგზავნილია
        </div>
      )}
      {!isCaptain && !isSpectator && (
        <div className="text-center font-mono text-xs text-white/30 py-2">
          მხოლოდ კაპიტანს შეუძლია პასუხის გაგზავნა
        </div>
      )}
    </div>
  );
}

// ── JudgingScreen ─────────────────────────────────────────────────────────────
function JudgingScreen({
  match, isHost, onJudge,
}: {
  match: WWWMatchPublic; isHost: boolean; onJudge: (teamId: string, isCorrect: boolean) => void;
}) {
  const q = match.currentQuestion;
  if (!q) return null;
  const teams = match.teams.filter(t => t.playerIds.length > 0);
  const pendingCount = teams.filter(t => {
    const a: WWWAnswer | undefined = match.answers[t.id];
    return a && a.isCorrect === undefined;
  }).length;

  return (
    <div className="space-y-4 pt-2">
      <QuestionCard q={q} index={match.currentQuestionIndex} total={match.totalQuestions} />

      {/* Correct answer reveal */}
      <div
        className="px-4 py-4 rounded-2xl text-center"
        style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
      >
        <p className="font-mono text-[12px] text-white/40 uppercase tracking-wide mb-2">სწორი პასუხი</p>
        <p className="font-display font-bold text-[18px] text-green-400">{q.correctAnswer}</p>
        {q.explanation && (
          <p className="font-mono text-[12px] text-white/30 mt-2">{q.explanation}</p>
        )}
      </div>

      {/* Answers to judge */}
      <div className="space-y-3">
        {teams.map(team => {
          const answer: WWWAnswer | undefined = match.answers[team.id];
          if (!answer) return (
            <div
              key={team.id}
              className="px-3 py-3 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="font-mono text-xs text-white/30">{team.name} — პასუხი არ გამოუგზავნია</span>
            </div>
          );
          const judged = answer.isCorrect !== undefined;
          return (
            <div
              key={team.id}
              className="rounded-xl overflow-hidden"
              style={{
                background: judged
                  ? (answer.isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(255,45,85,0.06)')
                  : `${team.color}0d`,
                border: `1px solid ${judged
                  ? (answer.isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(255,45,85,0.25)')
                  : `${team.color}25`}`,
              }}
            >
              <div
                className="px-3 py-2 border-b flex items-center gap-2"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} />
                <span className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</span>
                {judged && (
                  <span
                    className="ml-auto font-mono text-[12px] font-bold"
                    style={{ color: answer.isCorrect ? '#22c55e' : '#ff2d55' }}
                  >
                    {answer.isCorrect ? '✓ სწორი' : '✗ არასწორი'}
                  </span>
                )}
              </div>
              <div className="px-3 py-3">
                <p className="font-mono text-[15px] text-white">{answer.answerText || <em className="text-white/30">— პასუხი ცარიელია —</em>}</p>
              </div>
              {isHost && !judged && (
                <div className="px-3 pb-3 flex gap-2">
                  <button
                    onClick={() => onJudge(team.id, true)}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                  >
                    ✓ სწორია
                  </button>
                  <button
                    onClick={() => onJudge(team.id, false)}
                    className="flex-1 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.35)', color: '#ff2d55' }}
                  >
                    ✗ არასწორი
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!isHost && pendingCount > 0 && (
        <div className="text-center font-mono text-xs text-white/30 py-2">ჰოსტი ამოწმებს პასუხებს…</div>
      )}
    </div>
  );
}

// ── RoundResultScreen ─────────────────────────────────────────────────────────
function RoundResultScreen({
  match, isHost, onNext,
}: {
  match: WWWMatchPublic; isHost: boolean; onNext: () => void;
}) {
  const q = match.currentQuestion;
  const isLast = match.currentQuestionIndex + 1 >= match.totalQuestions;

  return (
    <div className="space-y-4 pt-2">
      {q && (
        <div
          className="px-4 py-4 rounded-2xl text-center"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <p className="font-mono text-[12px] text-white/40 uppercase tracking-wide mb-2">სწორი პასუხი იყო</p>
          <p className="font-display font-bold text-[18px] text-green-400">{q.correctAnswer}</p>
          {q.explanation && (
            <p className="font-mono text-[12px] text-white/30 mt-2">{q.explanation}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {match.teams.filter(t => t.playerIds.length > 0).map(team => {
          const answer: WWWAnswer | undefined = match.answers[team.id];
          return (
            <div
              key={team.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: `${team.color}0d`, border: `1px solid ${team.color}25` }}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: team.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-bold" style={{ color: team.color }}>{team.name}</p>
                {answer && (
                  <p className="font-mono text-[12px] text-white/40 truncate">{answer.answerText}</p>
                )}
              </div>
              {answer?.isCorrect !== undefined && (
                <span
                  className="font-mono text-sm font-bold"
                  style={{ color: answer.isCorrect ? '#22c55e' : '#ff2d55' }}
                >
                  {answer.isCorrect ? '✓' : '✗'}
                </span>
              )}
              <span
                className="font-display font-bold text-xl ml-1"
                style={{ color: team.color }}
              >
                {match.scores[team.id] ?? 0}
              </span>
            </div>
          );
        })}
      </div>

      {isHost ? (
        <button
          onClick={onNext}
          className="w-full py-4 rounded-2xl font-display font-bold text-[15px] transition-all active:scale-95"
          style={{ background: 'rgba(168,85,247,0.18)', border: `1px solid ${ACCENT}45`, color: ACCENT }}
        >
          {isLast ? 'შედეგები ▶' : `შემდეგი შეკ ${match.currentQuestionIndex + 2} ▶`}
        </button>
      ) : (
        <div className="text-center font-mono text-xs text-white/30 py-2">ჰოსტი გააგრძელებს…</div>
      )}
    </div>
  );
}

// ── FinishedScreen ────────────────────────────────────────────────────────────
function FinishedScreen({ match, onLeave }: { match: WWWMatchPublic; onLeave: () => void }) {
  const sorted = [...match.teams].sort((a, b) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0));
  const winner = sorted[0];

  return (
    <div className="space-y-4 pt-4 text-center">
      <div>
        <p className="font-mono text-[12px] text-white/30 uppercase tracking-wide mb-3">გამარჯვებული</p>
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{
            background: `${winner?.color ?? ACCENT}20`,
            border: `2px solid ${winner?.color ?? ACCENT}`,
            boxShadow: `0 0 32px ${winner?.color ?? ACCENT}40`,
          }}
        >
          <span className="text-4xl">🏆</span>
        </div>
        <p className="font-display font-bold text-2xl" style={{ color: winner?.color ?? ACCENT }}>
          {winner?.name ?? '?'}
        </p>
        <p className="font-mono text-sm text-white/40 mt-1">{match.scores[winner?.id ?? ''] ?? 0} ქულა</p>
      </div>

      <div className="space-y-2">
        {sorted.map((team, i) => (
          <div
            key={team.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: `${team.color}0d`, border: `1px solid ${team.color}25` }}
          >
            <span className="font-mono text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
            <span className="font-mono text-sm flex-1 text-left" style={{ color: team.color }}>{team.name}</span>
            <span className="font-display font-bold text-xl" style={{ color: team.color }}>
              {match.scores[team.id] ?? 0}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={onLeave}
        className="w-full py-3 rounded-2xl font-mono text-[15px] transition-all active:scale-95"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
      >
        თამაშების მენიუ ←
      </button>
    </div>
  );
}

// ── Main WWWGame component ─────────────────────────────────────────────────────
export function WWWGame() {
  const {
    match, leaveMatch, startMatch, setRole, advanceDiscussion,
    submitAnswer, judgeAnswer, nextQuestion, sendChat,
    error, clearError,
  } = useWWWStore();
  const profile = useAuthStore(s => s.profile);
  const myId = profile?.id ?? '';
  const myNickname = profile?.username ?? 'Player';

  const voice = useWWWVoice();

  // LiveKit voice (each match == one LiveKit room). Replaces the mesh voice when
  // enabled; spectators are listen-only.
  const { enabled: livekitEnabled, resolved: livekitResolved } = useLiveKitGate();
  const lkSpectator = !!match && (match.players[myId]?.isSpectator ?? false);
  // Voice isolation: during the private discussion each team gets its OWN LiveKit
  // room (A and B can't hear each other; the host sits in the shared room). In
  // every other phase everyone shares one room so the host presents & reveals.
  const lkMyTeam = match ? (match.players[myId]?.teamId ?? null) : null;
  const lkRoomId = match?.id
    ? (match.status === 'discussion' && lkMyTeam ? `www_${match.id}_${lkMyTeam}` : `www_${match.id}`)
    : null;
  const lkVoice = useLivekitRoomVoice({
    roomId: lkRoomId,
    identity: myId || null,
    active: livekitEnabled && !!match?.id && match?.status !== 'finished',
    listenOnly: lkSpectator,
  });

  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-join the legacy mesh voice — skipped when LiveKit owns voice.
  useEffect(() => {
    if (!match) return;
    if (!livekitResolved || livekitEnabled) return;
    const myPlayer = match.players[myId];
    if (myPlayer?.isSpectator) {
      voice.joinListen(match.id);
    } else {
      voice.joinVoice(match.id);
    }
    return () => {
      voice.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, livekitResolved, livekitEnabled]);

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

  const handleSendChat = useCallback(() => {
    if (!chatText.trim()) return;
    sendChat(chatText.trim(), myNickname);
    setChatText('');
  }, [chatText, sendChat, myNickname]);

  const handleSubmitAnswer = useCallback(() => {
    if (!answerText.trim()) return;
    submitAnswer(answerText.trim());
    setAnswerText('');
  }, [answerText, submitAnswer]);

  if (!match) return null;

  const isHost = match.hostId === myId;
  const myPlayer = match.players[myId];
  const myTeam = myPlayer?.teamId ? match.teams.find(t => t.id === myPlayer.teamId) : null;
  const isCaptain = myPlayer?.isCaptain ?? false;
  const isSpectator = myPlayer?.isSpectator ?? false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: '#03000d' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.05)' }}
      >
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
          <p className="font-mono text-[12px] text-white/30 mt-0.5">
            {match.status !== 'waiting' && match.status !== 'finished'
              ? `შეკ ${match.currentQuestionIndex + 1}/${match.totalQuestions}`
              : `კოდი: ${match.code}`}
          </p>
        </div>
        <button
          onClick={() => setChatOpen(o => !o)}
          className="relative w-8 h-8 flex items-center justify-center rounded-lg transition-all active:scale-90"
          style={{
            background: 'rgba(168,85,247,0.1)',
            border: `1px solid ${chatOpen ? ACCENT + '50' : 'rgba(168,85,247,0.25)'}`,
            color: chatOpen ? ACCENT : 'rgba(255,255,255,0.4)',
          }}
        >
          💬
          {match.chat.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-500" />
          )}
        </button>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            onClick={clearError}
            className="mx-4 mt-3 px-3 py-2 rounded-xl text-xs font-mono cursor-pointer flex-shrink-0"
            style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#ff2d55' }}
          >
            {error} ✕
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team panels */}
      <div className="flex gap-2 px-4 py-2 flex-shrink-0">
        {match.teams.filter(t => t.playerIds.length > 0 || match.scores[t.id] !== undefined).map(team => (
          <TeamPanel
            key={team.id}
            team={team}
            match={match}
            myId={myId}
            speakingSocketIds={voice.speakingSocketIds}
            peers={voice.peers}
            isTalking={voice.isTalking}
          />
        ))}
      </div>

      {/* Voice status — LiveKit bar when enabled, else the legacy mesh status */}
      {livekitEnabled ? (
        <div className="px-4 pb-1 flex-shrink-0"><LiveKitVoiceBarView voice={lkVoice} /></div>
      ) : voice.joined && (
        <div className="px-4 pb-1 flex-shrink-0">
          <VoiceStatusBar status={voice.status} peers={voice.peers} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {match.status === 'waiting' && (
          <WaitingScreen match={match} isHost={isHost} myId={myId} onStart={startMatch} onSetRole={setRole} />
        )}
        {match.status === 'question' && (
          <QuestionScreen match={match} isHost={isHost} onAdvance={advanceDiscussion} />
        )}
        {match.status === 'discussion' && (
          <DiscussionScreen
            match={match}
            isHost={isHost}
            myId={myId}
            isCaptain={isCaptain}
            isSpectator={isSpectator}
            answerText={answerText}
            onAnswerChange={setAnswerText}
            onSubmit={handleSubmitAnswer}
            timeLeft={timeLeft}
            voice={voice}
          />
        )}
        {match.status === 'judging' && (
          <JudgingScreen match={match} isHost={isHost} onJudge={judgeAnswer} />
        )}
        {match.status === 'round_result' && (
          <RoundResultScreen match={match} isHost={isHost} onNext={nextQuestion} />
        )}
        {match.status === 'finished' && (
          <FinishedScreen match={match} onLeave={leaveMatch} />
        )}
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
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: 'rgba(168,85,247,0.1)' }}
            >
              <span className="font-mono text-xs text-white/50">ჩათი</span>
              <button onClick={() => setChatOpen(false)} className="text-white/40 text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1" style={{ maxHeight: '30vh' }}>
              {match.chat.length === 0 && (
                <p className="font-mono text-xs text-white/20 text-center py-4">ჩათი ცარიელია</p>
              )}
              {match.chat.map((msg, i) => {
                const ch = msg.channel ?? 'broadcast';
                const team = ch === 'team_a' || ch === 'team_b' ? match.teams.find(t => t.id === ch) : null;
                const nameColor = team ? team.color : ACCENT;
                const tag = ch === 'broadcast' ? '📢' : team ? `● ${team.name}` : '';
                return (
                  <div key={i} className="flex gap-2 text-xs font-mono items-baseline">
                    {tag && <span style={{ color: nameColor, fontSize: 10, flexShrink: 0 }}>{tag}</span>}
                    <span style={{ color: nameColor }}>{msg.nickname}:</span>
                    <span className="text-white/70 flex-1">{msg.text}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t" style={{ borderColor: 'rgba(168,85,247,0.1)' }}>
              <input
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
                placeholder="დაწერე შეტყობინება…"
                className="flex-1 bg-transparent text-xs text-white font-mono outline-none placeholder-white/20 px-3 py-2 rounded-xl border border-white/10 focus:border-white/25"
              />
              <button
                onClick={handleSendChat}
                className="px-3 py-2 rounded-xl text-xs font-mono transition-all active:scale-95"
                style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: ACCENT }}
              >
                →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
