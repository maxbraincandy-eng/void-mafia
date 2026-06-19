import type { WWWMatchPublic } from '@/store/wwwStore';

interface Props {
  match: WWWMatchPublic;
  myUserId: string;
  onLeave: () => void;
}

export function WWWFinish({ match, myUserId, onLeave }: Props) {
  // Determine winner
  const topScore = Math.max(...Object.values(match.scores));
  const winners = match.teams.filter(t => (match.scores[t.id] ?? 0) === topScore);
  const isTie = winners.length > 1;

  return (
    <div
      className="fixed inset-0 flex flex-col z-50 overflow-y-auto"
      style={{ background: '#03000d' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(155,0,255,0.2)', background: 'rgba(10,6,28,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <p className="font-display font-bold text-white text-sm">თამაში დასრულდა</p>
        </div>
        <button
          onClick={onLeave}
          className="font-mono text-[10px] text-white/35 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/25 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 p-4 space-y-6">
        {/* Winner announcement */}
        <div className="text-center space-y-2 py-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">
            {isTie ? 'ფრე!' : 'გამარჯვებული'}
          </p>
          {isTie ? (
            <p className="font-display text-2xl font-bold text-white">ფრე</p>
          ) : (
            winners.map(t => (
              <div key={t.id}>
                <p className="font-display text-3xl font-bold" style={{ color: t.color }}>
                  {t.name}
                </p>
                <p className="font-mono text-sm text-white/50">{match.scores[t.id]} ქულა</p>
              </div>
            ))
          )}
        </div>

        {/* Final scores */}
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">საბოლოო ქულები</p>
          {match.teams
            .sort((a, b) => (match.scores[b.id] ?? 0) - (match.scores[a.id] ?? 0))
            .map((t, idx) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="font-mono text-lg w-6 text-center" style={{ color: idx === 0 ? '#ffd700' : 'rgba(255,255,255,0.3)' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                </span>
                <span className="font-mono text-sm text-white flex-1" style={{ color: t.color }}>
                  {t.name}
                </span>
                <span className="font-mono text-lg font-bold" style={{ color: t.color }}>
                  {match.scores[t.id] ?? 0}
                </span>
              </div>
            ))}
        </div>

        {/* Player list */}
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">მოთამაშეები</p>
          {match.teams.map(team => (
            <div key={team.id} className="space-y-1">
              <p className="font-mono text-[10px] font-bold" style={{ color: team.color }}>{team.name}</p>
              {team.playerIds.map(id => {
                const p = match.players[id];
                return p ? (
                  <div key={id} className="flex items-center gap-1.5 ml-2">
                    {id === team.captainId && <span className="text-xs">👑</span>}
                    <span className="font-mono text-xs text-white/70">
                      {p.nickname}{id === myUserId && ' ✦'}
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onLeave}
            className="flex-1 py-3 rounded-xl font-mono text-sm text-white/50 border border-white/15 hover:text-white/80 hover:border-white/30 transition-colors"
          >
            თამაშებში დაბრუნება
          </button>
        </div>
      </div>
    </div>
  );
}
