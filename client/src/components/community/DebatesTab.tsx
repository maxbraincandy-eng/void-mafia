import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  useDebateStore, DebateFull, DebateSide, DebateParticipant,
  getActiveSide, DebatePhase,
} from '@/store/debateStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { Spinner, EmptyState } from '@/components/community/shared';
import { socket } from '@/lib/socket';
import { useDebateVoice } from '@/hooks/useDebateVoice';

// ── Phase Banner ────────────────────────────────────────────────────────
function PhaseBanner({ debate }: { debate: DebateFull }) {
  const t = useT();
  const [timeLeft, setTimeLeft] = useState(0);

  const phaseLabels: Record<string, string> = {
    waiting: t.community.debates.waiting,
    ...t.community.debates.phases,
  };

  useEffect(() => {
    if (!debate.phaseStartedAt || !debate.phaseDuration) { setTimeLeft(0); return; }
    const update = () => {
      const elapsed = (Date.now() - debate.phaseStartedAt!) / 1000;
      setTimeLeft(Math.max(0, debate.phaseDuration - elapsed));
    };
    update();
    const interval = setInterval(update, 500);
    return () => clearInterval(interval);
  }, [debate.phaseStartedAt, debate.phaseDuration]);

  const pct = debate.phaseDuration > 0 ? (timeLeft / debate.phaseDuration) * 100 : 0;
  const activeSide = getActiveSide(debate.phase as DebatePhase);
  const phaseLabel = phaseLabels[debate.phase] ?? debate.phase;

  return (
    <div className="rounded-2xl p-3 mb-3" style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.2)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{
          color: activeSide === 'pro' ? '#00f5ff' : activeSide === 'con' ? '#ff6060' : '#c084fc',
        }}>
          {phaseLabel}
        </span>
        {timeLeft > 0 && (
          <span className="font-mono text-[11px]" style={{ color: timeLeft < 30 ? '#ff6060' : 'rgba(255,255,255,0.5)' }}>
            {Math.floor(timeLeft / 60)}:{String(Math.floor(timeLeft % 60)).padStart(2, '0')}
          </span>
        )}
      </div>
      {debate.phaseDuration > 0 && (
        <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: pct > 50 ? 'linear-gradient(90deg, #9b00ff, #00f5ff)' : pct > 20 ? '#ffaa00' : '#ff4444',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Speaker card ────────────────────────────────────────────────────────
function SpeakerCard({ participant, isActive, isSpeaking }: { participant: DebateParticipant; isActive: boolean; isSpeaking?: boolean }) {
  const color = participant.side === 'pro' ? '#00f5ff' : '#ff6060';
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
        style={{
          background: isActive ? color + '25' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isActive ? color + '50' : 'rgba(255,255,255,0.08)'}`,
          color,
        }}
      >
        {(participant.username ?? '?').charAt(0).toUpperCase()}
      </div>
      <span className="font-mono text-[9px] text-white/60 truncate flex-1">{participant.username ?? '???'}</span>
      {isActive && (
        <motion.span
          animate={isSpeaking ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
          transition={{ repeat: Infinity, duration: 0.7 }}
          className="text-[8px]"
        >
          🎙
        </motion.span>
      )}
    </div>
  );
}

// ── Debate Grid ─────────────────────────────────────────────────────────
function DebateGrid({ debate, speakingSocketIds }: { debate: DebateFull; speakingSocketIds?: string[] }) {
  const t = useT();
  const proSpeakers = debate.participants.filter(p => p.side === 'pro');
  const conSpeakers = debate.participants.filter(p => p.side === 'con');
  const activeSide = getActiveSide(debate.phase as DebatePhase);

  return (
    <div className="grid grid-cols-2 gap-2 mb-3">
      {/* Pro side */}
      <div
        className="rounded-xl p-2"
        style={{
          background: activeSide === 'pro' ? 'rgba(0,245,255,0.08)' : 'rgba(0,245,255,0.03)',
          border: `1px solid ${activeSide === 'pro' ? 'rgba(0,245,255,0.3)' : 'rgba(0,245,255,0.12)'}`,
        }}
      >
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#00f5ff' }} />
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#00f5ff' }}>{t.community.debates.pro}</span>
          {activeSide === 'pro' && (
            <span className="ml-auto font-mono text-[9px] text-white/40 animate-pulse">● {t.community.debates.speaking}</span>
          )}
        </div>
        {proSpeakers.length === 0 ? (
          <p className="font-mono text-[9px] text-white/20 text-center py-2">{'No speakers'}</p>
        ) : (
          proSpeakers.map(p => (
            <SpeakerCard key={p.id} participant={p} isActive={activeSide === 'pro'}
              isSpeaking={speakingSocketIds?.some(sid => sid === p.playerId)} />
          ))
        )}
      </div>

      {/* Con side */}
      <div
        className="rounded-xl p-2"
        style={{
          background: activeSide === 'con' ? 'rgba(255,96,96,0.08)' : 'rgba(255,96,96,0.03)',
          border: `1px solid ${activeSide === 'con' ? 'rgba(255,96,96,0.3)' : 'rgba(255,96,96,0.12)'}`,
        }}
      >
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff6060' }} />
          <span className="font-mono text-[9px] uppercase tracking-widest" style={{ color: '#ff6060' }}>{t.community.debates.con}</span>
          {activeSide === 'con' && (
            <span className="ml-auto font-mono text-[9px] text-white/40 animate-pulse">● {t.community.debates.speaking}</span>
          )}
        </div>
        {conSpeakers.length === 0 ? (
          <p className="font-mono text-[9px] text-white/20 text-center py-2">{'No speakers'}</p>
        ) : (
          conSpeakers.map(p => (
            <SpeakerCard key={p.id} participant={p} isActive={activeSide === 'con'}
              isSpeaking={speakingSocketIds?.some(sid => sid === p.playerId)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Raised Hands Panel ──────────────────────────────────────────────────
function RaisedHandsPanel({
  debate,
  onPromote,
}: {
  debate: DebateFull;
  onPromote: (playerId: string) => void;
}) {
  if (debate.raisedHands.length === 0) return null;
  return (
    <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(155,0,255,0.06)', border: '1px solid rgba(155,0,255,0.2)' }}>
      <p className="font-mono text-[9px] uppercase tracking-widest text-white/40 mb-2">✋ Raised Hands</p>
      {debate.raisedHands.map(h => (
        <div key={h.playerId} className="flex items-center gap-2 py-1">
          <span className="font-mono text-[10px] text-white/60 flex-1">{h.username ?? '???'}</span>
          <span
            className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: h.side === 'pro' ? 'rgba(0,245,255,0.1)' : 'rgba(255,96,96,0.1)',
              color: h.side === 'pro' ? '#00f5ff' : '#ff6060',
            }}
          >
            {h.side.toUpperCase()}
          </span>
          <button
            onClick={() => onPromote(h.playerId)}
            className="font-mono text-[9px] px-2 py-1 rounded-lg transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
          >
            Bring Up
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Vote Bar ────────────────────────────────────────────────────────────
function VoteBar({ side, count, total, label }: { side: 'pro' | 'con'; count: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const color = side === 'pro' ? '#00f5ff' : '#ff6060';
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px]" style={{ color }}>{label}</span>
        <span className="font-mono text-[10px] text-white/40">{count} ({pct}%)</span>
      </div>
      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Debate Room ─────────────────────────────────────────────────────────
function DebateRoom({ debate, onBack, uid, username }: { debate: DebateFull; onBack: () => void; uid: string; username: string }) {
  const t = useT();
  const { joinDebate, postArgument, vote, closeDebate, startDebate, skipPhase, raiseHand, lowerHand, promote } = useDebateStore();
  const [argumentText, setArgumentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pro' | 'con' | 'all'>('all');
  const voiceJoinedSide = useRef<DebateSide | null>(null);

  const voice = useDebateVoice();

  const isCreator = debate.createdBy === uid;
  const myPart = debate.myParticipation;
  const canPostArg = myPart && myPart.side !== 'spectator' && debate.status === 'open';
  const activeSide = getActiveSide(debate.phase as DebatePhase);
  const isHandRaised = debate.raisedHands.some(h => h.playerId === uid);

  // Auto-join voice when participation changes
  useEffect(() => {
    if (!myPart || !uid) return;
    const side = myPart.side;
    if (voiceJoinedSide.current === side) return;
    voiceJoinedSide.current = side;
    voice.join(debate.id, side, username);
  }, [myPart?.side, debate.id, uid, username]);

  // Leave voice on unmount
  useEffect(() => {
    return () => { voice.leave(debate.id); };
  }, [debate.id]);

  const visibleArgs = debate.arguments.filter(a => activeTab === 'all' || a.side === activeTab);

  async function handleJoin(side: DebateSide) {
    if (!uid) return;
    await joinDebate(debate.id, side).catch(() => {});
  }

  async function handlePost() {
    if (!argumentText.trim() || posting) return;
    setPosting(true);
    try {
      await postArgument(debate.id, argumentText.trim());
      setArgumentText('');
    } catch {}
    setPosting(false);
  }

  async function handleStart() {
    await startDebate(debate.id).catch(() => {});
  }

  async function handleSkip() {
    await skipPhase(debate.id).catch(() => {});
  }

  async function handleRaiseHand(side: 'pro' | 'con') {
    await raiseHand(debate.id, side).catch(() => {});
  }

  async function handleLowerHand() {
    await lowerHand(debate.id).catch(() => {});
  }

  async function handlePromote(playerId: string) {
    await promote(debate.id, playerId).catch(() => {});
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/40 font-mono text-[11px] hover:text-white/70 transition-colors"
        >
          ← {t.community.debates.back}
        </button>
        {/* Voice status */}
        {voice.joined && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full"
            style={{ background: 'rgba(155,0,255,0.1)', border: '1px solid rgba(155,0,255,0.25)' }}>
            <motion.span
              animate={voice.isSpeaker ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
              transition={{ repeat: Infinity, duration: 0.9 }}
              className="text-[10px]"
            >
              {voice.isSpeaker ? '🎙' : '👂'}
            </motion.span>
            <span className="font-mono text-[9px]" style={{ color: '#c084fc' }}>
              {voice.isSpeaker ? 'MIC ON' : 'LIVE'}
            </span>
          </div>
        )}
      </div>

      {/* Debate header */}
      <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(155,0,255,0.06)', border: '1px solid rgba(155,0,255,0.2)' }}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-white/90 font-mono text-sm leading-snug">{debate.topic}</h3>
          <span
            className="flex-shrink-0 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider"
            style={{
              background: debate.status === 'open' ? 'rgba(0,245,255,0.1)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${debate.status === 'open' ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.12)'}`,
              color: debate.status === 'open' ? '#00f5ff' : 'rgba(255,255,255,0.35)',
            }}
          >
            {debate.status === 'open' ? t.community.debates.open : t.community.debates.finished}
          </span>
        </div>
        {debate.description && <p className="text-white/35 text-[11px] font-mono">{debate.description}</p>}

        {/* Vote counts */}
        <div className="flex gap-3 mt-3">
          <VoteBar side="pro" count={debate.votesCounts.pro} total={debate.votesCounts.pro + debate.votesCounts.con} label={t.community.debates.pro} />
          <VoteBar side="con" count={debate.votesCounts.con} total={debate.votesCounts.pro + debate.votesCounts.con} label={t.community.debates.con} />
        </div>

        {debate.winnerSide && (
          <p className="mt-2 text-[11px] font-mono" style={{ color: '#c084fc' }}>
            {t.community.debates.winner}: {debate.winnerSide === 'pro' ? t.community.debates.pro : t.community.debates.con}
          </p>
        )}
      </div>

      {/* Phase Banner */}
      <PhaseBanner debate={debate} />

      {/* Debate Grid */}
      <DebateGrid debate={debate} speakingSocketIds={voice.speakingSocketIds} />

      {/* Raised Hands (creator only) */}
      {isCreator && (
        <RaisedHandsPanel debate={debate} onPromote={handlePromote} />
      )}

      {/* Action bar */}
      {uid && debate.status === 'open' && (
        <div className="flex flex-wrap gap-2 mb-4">
          {/* Start button for creator in waiting phase */}
          {isCreator && debate.phase === 'waiting' && (
            <button
              onClick={handleStart}
              className="flex-1 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
              style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
            >
              ▶ {t.community.debates.startDebate}
            </button>
          )}

          {/* Skip for active side speaker or creator */}
          {debate.phase !== 'waiting' && debate.phase !== 'finished' && debate.phase !== 'voting' && (
            (myPart?.side === activeSide || isCreator) && (
              <button
                onClick={handleSkip}
                className="px-3 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }}
              >
                ⏭ {t.community.debates.skipTurn}
              </button>
            )
          )}

          {/* Join side buttons */}
          {(['pro', 'con', 'spectator'] as DebateSide[]).map(side => {
            const active = myPart?.side === side;
            const count = debate.participants.filter(p => p.side === side).length;
            return (
              <button
                key={side}
                onClick={() => handleJoin(side)}
                className="flex-1 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                style={{
                  background: active
                    ? side === 'pro' ? 'rgba(0,245,255,0.18)' : side === 'con' ? 'rgba(255,60,60,0.18)' : 'rgba(155,0,255,0.18)'
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active
                    ? side === 'pro' ? 'rgba(0,245,255,0.45)' : side === 'con' ? 'rgba(255,60,60,0.45)' : 'rgba(155,0,255,0.45)'
                    : 'rgba(255,255,255,0.1)'}`,
                  color: active
                    ? side === 'pro' ? '#00f5ff' : side === 'con' ? '#ff6060' : '#c084fc'
                    : 'rgba(255,255,255,0.45)',
                }}
              >
                {side === 'pro' ? t.community.debates.pro : side === 'con' ? t.community.debates.con : t.community.debates.spectator} ({count})
              </button>
            );
          })}

          {/* Voting phase actions for spectators */}
          {debate.phase === 'voting' && myPart?.side === 'spectator' && (
            <>
              {(['pro', 'con'] as const).map(side => {
                const voted = debate.myVote?.side === side;
                return (
                  <button
                    key={side}
                    onClick={() => vote(debate.id, side).catch(() => {})}
                    className="flex-1 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                    style={{
                      background: voted
                        ? side === 'pro' ? 'rgba(0,245,255,0.12)' : 'rgba(255,60,60,0.12)'
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${voted
                        ? side === 'pro' ? 'rgba(0,245,255,0.35)' : 'rgba(255,60,60,0.35)'
                        : 'rgba(255,255,255,0.08)'}`,
                      color: voted
                        ? side === 'pro' ? '#00f5ff' : '#ff6060'
                        : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {voted ? '✓ ' : ''}{t.community.debates.vote} {side === 'pro' ? t.community.debates.pro : t.community.debates.con}
                  </button>
                );
              })}
            </>
          )}

          {/* Raise/lower hand for spectators */}
          {myPart?.side === 'spectator' && debate.phase !== 'voting' && (
            isHandRaised ? (
              <button
                onClick={handleLowerHand}
                className="px-3 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}
              >
                {t.community.debates.lowerHand}
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleRaiseHand('pro')}
                  className="flex-1 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                  style={{ background: 'rgba(0,245,255,0.06)', border: '1px solid rgba(0,245,255,0.2)', color: '#00f5ff' }}
                >
                  {t.community.debates.raiseHandPro}
                </button>
                <button
                  onClick={() => handleRaiseHand('con')}
                  className="flex-1 py-2 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                  style={{ background: 'rgba(255,96,96,0.06)', border: '1px solid rgba(255,96,96,0.2)', color: '#ff6060' }}
                >
                  {t.community.debates.raiseHandCon}
                </button>
              </>
            )
          )}

          {/* Close debate (creator) */}
          {isCreator && (
            <button
              onClick={() => closeDebate(debate.id).catch(() => {})}
              className="px-3 py-2 rounded-xl font-mono text-[10px] text-white/40 hover:text-red-400 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {t.community.debates.close}
            </button>
          )}
        </div>
      )}

      {/* Vote display for finished debates */}
      {debate.status === 'finished' && (
        <div className="flex gap-2 mb-4">
          {(['pro', 'con'] as const).map(side => {
            const voted = debate.myVote?.side === side;
            return (
              <button
                key={side}
                onClick={() => vote(debate.id, side).catch(() => {})}
                className="flex-1 py-1.5 rounded-xl font-mono text-[10px] transition-all active:scale-95"
                style={{
                  background: voted
                    ? side === 'pro' ? 'rgba(0,245,255,0.12)' : 'rgba(255,60,60,0.12)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${voted
                    ? side === 'pro' ? 'rgba(0,245,255,0.35)' : 'rgba(255,60,60,0.35)'
                    : 'rgba(255,255,255,0.08)'}`,
                  color: voted
                    ? side === 'pro' ? '#00f5ff' : '#ff6060'
                    : 'rgba(255,255,255,0.35)',
                }}
              >
                {voted ? '✓ ' : ''}{t.community.debates.vote} {side === 'pro' ? t.community.debates.pro : t.community.debates.con}
              </button>
            );
          })}
        </div>
      )}

      {/* Arguments filter tabs */}
      <div className="flex gap-2 mb-3">
        {(['all', 'pro', 'con'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-3 py-1 rounded-full font-mono text-[10px] transition-all"
            style={{
              background: activeTab === tab ? 'rgba(155,0,255,0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${activeTab === tab ? 'rgba(155,0,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: activeTab === tab ? '#c084fc' : 'rgba(255,255,255,0.4)',
            }}
          >
            {tab === 'all' ? t.community.debates.allArgs : tab === 'pro' ? t.community.debates.pro : t.community.debates.con}
          </button>
        ))}
      </div>

      {/* Arguments list */}
      <div className="flex flex-col gap-2 mb-4">
        {visibleArgs.length === 0 && <EmptyState text={t.community.debates.noArgs} />}
        {visibleArgs.map(arg => (
          <div
            key={arg.id}
            className="rounded-xl p-3"
            style={{
              background: arg.side === 'pro' ? 'rgba(0,245,255,0.05)' : 'rgba(255,60,60,0.05)',
              border: `1px solid ${arg.side === 'pro' ? 'rgba(0,245,255,0.15)' : 'rgba(255,60,60,0.15)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: arg.side === 'pro' ? '#00f5ff' : '#ff6060' }}
              />
              <span className="font-mono text-[10px] text-white/50">{arg.username ?? '???'}</span>
              <span className="font-mono text-[9px] text-white/25 ml-auto">
                {new Date(arg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-white/75 text-xs font-mono leading-relaxed">{arg.content}</p>
          </div>
        ))}
      </div>

      {/* Post argument input — explicit dark background, no white */}
      {canPostArg && (
        <div className="flex gap-2">
          <input
            value={argumentText}
            onChange={e => setArgumentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
            placeholder={t.community.debates.argPh}
            maxLength={1000}
            className="flex-1 rounded-xl px-3 py-2 text-white text-xs font-mono outline-none border border-white/8 focus:border-white/20 transition-colors placeholder-white/20"
            style={{ background: '#0d0a1a' }}
          />
          <button
            onClick={handlePost}
            disabled={!argumentText.trim() || posting}
            className="px-3 py-2 rounded-xl font-mono text-[11px] transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
          >
            {posting ? '…' : t.community.debates.send}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main DebatesTab ─────────────────────────────────────────────────────
export function DebatesTab() {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const {
    debates, activeDebate, loading,
    fetchDebates, openDebate, closeActiveDebate, createDebate,
    onNewDebate, onParticipantUpdate, onNewArgument, onVoteUpdate, onDebateClosed,
    onPhaseUpdate, onHandsUpdate,
  } = useDebateStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchDebates('open');
  }, [fetchDebates]);

  useEffect(() => {
    socket.on('debate:new', onNewDebate as any);
    socket.on('debate:participant_update', onParticipantUpdate as any);
    socket.on('debate:new_argument', onNewArgument as any);
    socket.on('debate:vote_update', onVoteUpdate as any);
    socket.on('debate:closed', onDebateClosed as any);
    socket.on('debate:phase_update', onPhaseUpdate as any);
    socket.on('debate:hands_update', onHandsUpdate as any);
    return () => {
      socket.off('debate:new', onNewDebate as any);
      socket.off('debate:participant_update', onParticipantUpdate as any);
      socket.off('debate:new_argument', onNewArgument as any);
      socket.off('debate:vote_update', onVoteUpdate as any);
      socket.off('debate:closed', onDebateClosed as any);
      socket.off('debate:phase_update', onPhaseUpdate as any);
      socket.off('debate:hands_update', onHandsUpdate as any);
    };
  }, [onNewDebate, onParticipantUpdate, onNewArgument, onVoteUpdate, onDebateClosed, onPhaseUpdate, onHandsUpdate]);

  async function handleCreate() {
    if (!newTopic.trim() || creating) return;
    setCreating(true);
    try {
      await createDebate(newTopic, newDesc);
      setNewTopic('');
      setNewDesc('');
      setShowCreate(false);
    } catch {}
    setCreating(false);
  }

  if (activeDebate) {
    return <DebateRoom debate={activeDebate} onBack={closeActiveDebate} uid={profile?.id ?? ''} username={profile?.username ?? 'Player'} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-white/40">{t.community.debates.title}</h2>
        {profile && (
          <button
            onClick={() => setShowCreate(s => !s)}
            className="px-3 py-1.5 rounded-xl font-mono text-[10px] transition-all active:scale-95"
            style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.35)', color: '#c084fc' }}
          >
            + {t.community.debates.create}
          </button>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl p-4 mb-4"
            style={{ background: 'rgba(155,0,255,0.08)', border: '1px solid rgba(155,0,255,0.25)' }}
          >
            <input
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              placeholder={t.community.debates.topicPh}
              maxLength={200}
              className="w-full bg-transparent border-b border-white/10 text-white text-sm font-mono pb-1 mb-3 outline-none placeholder-white/25"
            />
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder={t.community.debates.descPh}
              maxLength={500}
              rows={2}
              className="w-full bg-transparent border-b border-white/10 text-white/70 text-xs font-mono pb-1 mb-3 outline-none placeholder-white/20 resize-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 rounded-xl font-mono text-[10px] text-white/40 hover:text-white/70 transition-colors"
              >
                {t.community.debates.cancel}
              </button>
              <button
                onClick={handleCreate}
                disabled={!newTopic.trim() || creating}
                className="px-4 py-1.5 rounded-xl font-mono text-[10px] transition-all active:scale-95 disabled:opacity-40"
                style={{ background: 'rgba(155,0,255,0.25)', border: '1px solid rgba(155,0,255,0.4)', color: '#c084fc' }}
              >
                {creating ? '…' : t.community.debates.post}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <Spinner />}
      {!loading && debates.length === 0 && <EmptyState text={t.community.debates.empty} />}

      <div className="flex flex-col gap-3">
        {debates.map(d => (
          <button
            key={d.id}
            onClick={() => openDebate(d.id)}
            className="rounded-2xl p-4 text-left transition-all active:scale-[0.98] hover:border-white/16"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-white/85 text-sm font-mono leading-snug">{d.topic}</p>
              <span
                className="flex-shrink-0 px-2 py-0.5 rounded-full font-mono text-[9px] uppercase tracking-wider"
                style={{
                  background: d.status === 'open' ? 'rgba(0,245,255,0.1)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${d.status === 'open' ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.12)'}`,
                  color: d.status === 'open' ? '#00f5ff' : 'rgba(255,255,255,0.35)',
                }}
              >
                {d.status === 'open' ? t.community.debates.open : t.community.debates.finished}
              </span>
            </div>
            {d.description && <p className="text-white/35 text-[11px] font-mono line-clamp-2">{d.description}</p>}
            {d.phase && d.phase !== 'waiting' && d.phase !== 'finished' && (
              <p className="mt-1 font-mono text-[9px] text-white/30">{(t.community.debates.phases as any)[d.phase] ?? d.phase}</p>
            )}
            {d.winnerSide && (
              <p className="mt-2 text-[10px] font-mono" style={{ color: '#c084fc' }}>
                {t.community.debates.winner}: {d.winnerSide === 'pro' ? t.community.debates.pro : t.community.debates.con}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
