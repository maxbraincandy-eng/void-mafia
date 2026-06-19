import type { WWWMatchPublic } from '@/store/wwwStore';

interface Props {
  match: WWWMatchPublic;
  myUserId: string;
  onLeave: () => void;
}

export function WWWFinish({ match, onLeave }: Props) {
  // Find winner
  let maxScore = -1;
  let winnerTeamId: string | null = null;
  for (const [teamId, score] of Object.entries(match.scores)) {
    if (score > maxScore) {
      maxScore = score;
      winnerTeamId = teamId;
    }
  }

  // Check tie
  const scoreValues = Object.values(match.scores);
  const isTie = scoreValues.every(s => s === scoreValues[0]);

  const winnerTeam = winnerTeamId ? match.teams.find(t => t.id === winnerTeamId) : null;

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4 py-8"
      style={{ background: '#03000d', color: '#fff' }}
    >
      {/* Trophy / title */}
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="font-display font-bold text-2xl mb-2" style={{ color: '#fff' }}>
          თამაში დასრულდა!
        </h1>

        {isTie ? (
          <p className="font-display text-lg" style={{ color: '#fbbf24' }}>ფრე!</p>
        ) : winnerTeam ? (
          <div>
            <p className="font-mono text-sm mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>გამარჯვებული:</p>
            <p
              className="font-display font-bold text-2xl"
              style={{ color: winnerTeam.color, textShadow: `0 0 20px ${winnerTeam.color}60` }}
            >
              {winnerTeam.name}
            </p>
          </div>
        ) : null}
      </div>

      {/* Score table */}
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden mb-6"
        style={{ background: 'rgba(10,6,28,0.8)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="font-mono text-[10px] uppercase tracking-widest text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            საბოლოო ანგარიში
          </p>
        </div>
        {match.teams.map(team => {
          const score = match.scores[team.id] ?? 0;
          const isWinner = !isTie && team.id === winnerTeamId;
          return (
            <div
              key={team.id}
              className="flex items-center px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span className="text-lg mr-2">{isWinner ? '🏆' : '  '}</span>
              <span className="font-mono text-sm flex-1" style={{ color: team.color }}>
                {team.name}
              </span>
              <span
                className="font-mono font-bold text-xl"
                style={{
                  color: team.color,
                  textShadow: isWinner ? `0 0 10px ${team.color}60` : 'none',
                }}
              >
                {score}
              </span>
              <span className="font-mono text-[10px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                / {match.totalQuestions}
              </span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="w-full max-w-sm space-y-2">
        <button
          onClick={onLeave}
          className="w-full py-3 rounded-2xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,0.12)', border: '1px solid rgba(155,0,255,0.3)', color: '#c084fc' }}
        >
          რემატჩი
        </button>
        <button
          onClick={onLeave}
          className="w-full py-2.5 rounded-2xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
        >
          თამაშების განყოფილებაში დაბრუნება
        </button>
      </div>
    </div>
  );
}
