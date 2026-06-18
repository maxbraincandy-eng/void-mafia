import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebateStore, DebateFull, DebateSide } from '@/store/debateStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { Spinner, EmptyState } from '@/components/community/shared';
import { socket } from '@/lib/socket';

export function DebatesTab() {
  const t = useT();
  const profile = useAuthStore(s => s.profile);
  const {
    debates, activeDebate, loading,
    fetchDebates, openDebate, closeActiveDebate, createDebate,
    onNewDebate, onParticipantUpdate, onNewArgument, onVoteUpdate, onDebateClosed,
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
    return () => {
      socket.off('debate:new', onNewDebate as any);
      socket.off('debate:participant_update', onParticipantUpdate as any);
      socket.off('debate:new_argument', onNewArgument as any);
      socket.off('debate:vote_update', onVoteUpdate as any);
      socket.off('debate:closed', onDebateClosed as any);
    };
  }, [onNewDebate, onParticipantUpdate, onNewArgument, onVoteUpdate, onDebateClosed]);

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
    return <DebateRoom debate={activeDebate} onBack={closeActiveDebate} uid={profile?.id ?? ''} />;
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
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-xl font-mono text-[10px] text-white/40 hover:text-white/70 transition-colors">
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

function DebateRoom({ debate, onBack, uid }: { debate: DebateFull; onBack: () => void; uid: string }) {
  const t = useT();
  const { joinDebate, postArgument, vote, closeDebate } = useDebateStore();
  const [argumentText, setArgumentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeTab, setActiveTab] = useState<'pro' | 'con' | 'all'>('all');

  const isCreator = debate.createdBy === uid;
  const myPart = debate.myParticipation;
  const canPostArg = myPart && myPart.side !== 'spectator';

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

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-white/40 font-mono text-[11px] mb-4 hover:text-white/70 transition-colors">
        ← {t.community.debates.back}
      </button>

      <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(155,0,255,0.06)', border: '1px solid rgba(155,0,255,0.2)' }}>
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

        {/* Winner badge */}
        {debate.winnerSide && (
          <p className="mt-2 text-[11px] font-mono" style={{ color: '#c084fc' }}>
            {t.community.debates.winner}: {debate.winnerSide === 'pro' ? t.community.debates.pro : t.community.debates.con}
          </p>
        )}
      </div>

      {/* Join side buttons */}
      {uid && debate.status === 'open' && (
        <div className="flex gap-2 mb-4">
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
        </div>
      )}

      {/* Vote buttons (for finished debates or voting) */}
      {uid && (
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
          {isCreator && debate.status === 'open' && (
            <button
              onClick={() => closeDebate(debate.id).catch(() => {})}
              className="px-3 py-1.5 rounded-xl font-mono text-[10px] text-white/40 hover:text-red-400 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {t.community.debates.close}
            </button>
          )}
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

      {/* Post argument input */}
      {canPostArg && debate.status === 'open' && (
        <div className="flex gap-2">
          <input
            value={argumentText}
            onChange={e => setArgumentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost(); } }}
            placeholder={t.community.debates.argPh}
            maxLength={1000}
            className="flex-1 bg-white/4 rounded-xl px-3 py-2 text-white/80 text-xs font-mono outline-none placeholder-white/20 border border-white/8 focus:border-white/20 transition-colors"
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
