import { useEffect, useState } from 'react';
import { useIQStore } from '@/store/iqStore';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import type { IQScope, IQLeaderRow } from '@/types/iq';

/** VOID IQ public leaderboard with scope filters. */
const SCOPES: { key: IQScope; label: string }[] = [
  { key: 'all', label: 'ALL TIME' },
  { key: 'weekly', label: 'WEEKLY' },
  { key: 'monthly', label: 'MONTHLY' },
  { key: 'friends', label: 'FRIENDS' },
  { key: 'clan', label: 'CLAN' },
];

function medal(rank: number): string { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''; }

export function IQLeaderboard({ onBack }: { onBack: () => void }) {
  const { board, myRow, scope, loadingBoard, fetchBoard, modRemove } = useIQStore();
  const myId = useAuthStore(s => s.profile?.id ?? s.uid);
  const isMod = useAuthStore(s => !!s.profile?.isModerator);
  const openProfile = useSocialStore(s => s.openProfile);
  const [removeTarget, setRemoveTarget] = useState<IQLeaderRow | null>(null);

  useEffect(() => { fetchBoard('all'); }, [fetchBoard]);

  const Row = ({ r }: { r: IQLeaderRow }) => {
    const mine = r.userId === myId;
    return (
      <button onClick={() => openProfile(r.userId)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all active:scale-[0.99]"
        style={{
          background: mine ? 'rgba(0,229,255,0.09)' : 'rgba(255,255,255,0.025)',
          border: mine ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(255,255,255,0.07)',
        }}>
        <div className="w-8 text-center flex-shrink-0">
          {medal(r.rank) || <span className="font-display font-bold text-white/50 text-sm">{r.rank}</span>}
        </div>
        <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">{r.avatar || '👤'}</span>}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-display font-bold text-white text-[14px] truncate">{r.username}{mine ? ' ●' : ''}</p>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-white/40">{r.percentile}th პერცენტილი</span>
            {!r.verified && (
              <span className="font-mono text-[9px] px-1.5 py-[1px] rounded-full" style={{ background: 'rgba(255,171,64,0.14)', border: '1px solid rgba(255,171,64,0.35)', color: '#ffcf80' }}>ეჭვქვეშ</span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-display font-black text-lg" style={{ color: '#8ee9ff', fontVariantNumeric: 'tabular-nums' }}>{r.iq}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">IQ</p>
        </div>
        {isMod && (
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setRemoveTarget(r); }}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[13px]"
            style={{ background: 'rgba(255,45,85,0.1)', border: '1px solid rgba(255,45,85,0.3)', color: '#ff8ca3' }}
            title="ლიდერბორდიდან მოხსნა">✕</span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[560] flex flex-col select-none" style={{ background: 'radial-gradient(ellipse at 50% -10%, #0c1b30 0%, #06070f 55%)' }}
      onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
      <div className="flex-shrink-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center text-white/55" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>‹</button>
          <span className="font-display font-bold text-white tracking-wide">🏆 VOID IQ ლიდერბორდი</span>
          <span className="w-8" />
        </div>
        {/* Scope filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          {SCOPES.map(s => {
            const active = scope === s.key;
            return (
              <button key={s.key} onClick={() => fetchBoard(s.key)}
                className="px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: active ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(0,229,255,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  color: active ? '#8ee9ff' : 'rgba(255,255,255,0.45)',
                }}>{s.label}</button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="max-w-md mx-auto space-y-1.5">
          {loadingBoard ? (
            <p className="text-center font-mono text-[12px] text-white/35 py-16">იტვირთება…</p>
          ) : board.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🧠</p>
              <p className="font-mono text-[13px] text-white/45">
                {scope === 'friends' ? 'შენს მეგობრებს ჯერ არ გაუვლიათ ტესტი' : scope === 'clan' ? 'კლანის წევრებს ჯერ არ გაუვლიათ ტესტი' : 'ჯერ არავის დაუსრულებია ტესტი'}
              </p>
              <p className="font-mono text-[11px] text-white/30 mt-1">იყავი პირველი!</p>
            </div>
          ) : (
            board.map(r => <Row key={r.userId} r={r} />)
          )}

          {myRow && !board.some(r => r.userId === myId) && (
            <>
              <p className="text-center font-mono text-[10px] text-white/25 pt-3">— შენი პოზიცია —</p>
              <Row r={myRow} />
            </>
          )}
        </div>
      </div>

      {/* Moderator: confirm removing a player from the board */}
      {removeTarget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6" style={{ background: 'rgba(4,6,12,0.85)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 text-center" style={{ background: 'rgba(12,16,28,0.99)', border: '1px solid rgba(255,45,85,0.35)' }}>
            <p className="text-3xl mb-2">🗑</p>
            <p className="font-display font-bold text-white text-base mb-1">ლიდერბორდიდან მოხსნა?</p>
            <p className="font-mono text-[12px] text-white/50 mb-5"><b className="text-white/80">{removeTarget.username}</b> (IQ {removeTarget.iq}) — მისი შედეგები წაიშლება ლიდერბორდიდან.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setRemoveTarget(null)} className="flex-1 py-2.5 rounded-xl font-mono text-[13px] text-white/60" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>არა</button>
              <button onClick={() => { const t = removeTarget; setRemoveTarget(null); modRemove(t.userId); }}
                className="flex-1 py-2.5 rounded-xl font-display font-bold text-[13px] text-white" style={{ background: 'rgba(255,45,85,0.25)', border: '1px solid rgba(255,45,85,0.5)' }}>დიახ, მოხსენი</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
