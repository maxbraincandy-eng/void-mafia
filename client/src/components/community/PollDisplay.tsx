import { useT } from '@/store/langStore';
import type { CommunityPostV2, PollResult } from '@/types/index';

interface Props {
  post: CommunityPostV2;
  onVote: (optionId: string) => Promise<void>;
  voting: boolean;
}

export function PollDisplay({ post, onVote, voting }: Props) {
  const t = useT();
  const poll = post.poll;
  if (!poll) return null;

  const isExpired = poll.endsAt !== null && Date.now() > poll.endsAt;
  const showResults = poll.myVote !== null || isExpired;
  const totalVotes = poll.results?.reduce((sum, r) => sum + r.count, 0) ?? 0;

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-white/10 p-3" style={{ background: 'rgba(155,0,255,0.06)' }}>
      <p className="font-mono text-xs font-semibold text-white/80">{poll.question}</p>
      {isExpired && (
        <p className="font-mono text-[12px] text-white/35 uppercase tracking-wider">{t.community.poll.expired}</p>
      )}
      <div className="space-y-1.5">
        {poll.options.map(opt => {
          const result: PollResult | undefined = poll.results?.find(r => r.option.id === opt.id);
          const pct = result?.percent ?? 0;
          const isMyVote = poll.myVote === opt.id;

          if (showResults) {
            return (
              <div key={opt.id} className="relative rounded-lg overflow-hidden" style={{ minHeight: 36 }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all"
                  style={{
                    width: `${pct}%`,
                    background: isMyVote ? 'rgba(155,0,255,0.35)' : 'rgba(255,255,255,0.07)',
                  }}
                />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="font-mono text-xs text-white/80 flex items-center gap-1.5">
                    {isMyVote && <span style={{ color: '#9b00ff' }}>✓</span>}
                    {opt.text}
                  </span>
                  <span className="font-mono text-[12px] text-white/45">{pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.id}
              onClick={() => onVote(opt.id)}
              disabled={voting}
              className="w-full text-left px-3 py-2 rounded-lg border font-mono text-xs text-white/70 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ border: '1px solid rgba(155,0,255,0.25)', background: 'rgba(255,255,255,0.03)' }}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
      {showResults && (
        <p className="font-mono text-[12px] text-white/30">{totalVotes} {t.community.poll.votes}</p>
      )}
    </div>
  );
}
