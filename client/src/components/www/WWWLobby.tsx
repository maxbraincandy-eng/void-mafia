import { useState } from 'react';
import type { WWWMatchPublic, WWWTeam, WWWPlayer } from '@/store/wwwStore';
import type { useWWWVoice } from '@/hooks/useWWWVoice';

interface Props {
  match: WWWMatchPublic;
  myUserId: string;
  voice: ReturnType<typeof useWWWVoice>;
  onJoinTeam: (teamId: string) => void;
  onAssignCaptain: (targetUserId: string, teamId: string) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function WWWLobby({ match, myUserId, voice, onJoinTeam, onAssignCaptain, onStart, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = match.hostId === myUserId;

  function copyCode() {
    navigator.clipboard?.writeText(match.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getTeamPlayers(team: WWWTeam): WWWPlayer[] {
    return team.playerIds
      .map(id => match.players[id])
      .filter(Boolean) as WWWPlayer[];
  }

  const myPlayer = match.players[myUserId];
  const myTeamId = myPlayer?.teamId;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'rgba(155,0,255,0.2)', background: 'rgba(10,6,28,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <p className="font-display font-bold text-white text-sm">რა? სად? როდის?</p>
            <p className="font-mono text-[10px] text-white/35">ლობი</p>
          </div>
        </div>
        <button
          onClick={onLeave}
          className="font-mono text-[10px] text-white/35 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/25 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Match code */}
        <div className="text-center space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">მატჩის კოდი</p>
          <button
            onClick={copyCode}
            className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl border font-mono text-lg tracking-widest transition-all active:scale-95"
            style={{ border: '1px solid rgba(155,0,255,0.4)', background: 'rgba(155,0,255,0.08)', color: '#c084fc' }}
          >
            <span>{match.code}</span>
            <span className="text-xs opacity-60">{copied ? '✓' : '⎘'}</span>
          </button>
          <p className="font-mono text-[9px] text-white/20">გაუზიარე კოდი მეგობრებს</p>
        </div>

        {/* Settings summary */}
        <div
          className="rounded-xl px-4 py-3 grid grid-cols-2 gap-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">კითხვები</p>
            <p className="font-mono text-sm text-white">{match.settings.questionsCount}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">განხილვა</p>
            <p className="font-mono text-sm text-white">{match.settings.discussionSeconds}წმ</p>
          </div>
          <div>
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">კატეგორია</p>
            <p className="font-mono text-sm text-white">{match.settings.questionCategory}</p>
          </div>
          <div>
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">სირთულე</p>
            <p className="font-mono text-sm text-white">{match.settings.difficulty}</p>
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-3">
          {match.teams.map((team) => {
            const players = getTeamPlayers(team);
            const isMyTeam = myTeamId === team.id;
            return (
              <div
                key={team.id}
                className="rounded-xl p-3 space-y-2"
                style={{
                  background: `${team.color}11`,
                  border: `1px solid ${team.color}44`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm" style={{ color: team.color }}>
                    {team.name}
                  </span>
                  <span className="font-mono text-[9px] text-white/30">{players.length} მოთ.</span>
                </div>

                {/* Players */}
                <div className="space-y-1 min-h-[60px]">
                  {players.map(p => (
                    <div key={p.userId} className="flex items-center gap-1.5">
                      {p.userId === team.captainId && (
                        <span className="text-xs" title="კაპიტანი">👑</span>
                      )}
                      <span className="font-mono text-xs text-white truncate flex-1">
                        {p.nickname}
                        {p.userId === myUserId && ' ✦'}
                      </span>
                      {isHost && p.userId !== team.captainId && (
                        <button
                          onClick={() => onAssignCaptain(p.userId, team.id)}
                          className="text-[8px] font-mono px-1 py-0.5 rounded"
                          style={{ color: team.color, border: `1px solid ${team.color}44` }}
                        >
                          კაპ
                        </button>
                      )}
                    </div>
                  ))}
                  {players.length === 0 && (
                    <p className="font-mono text-[10px] text-white/20 italic">ცარიელია</p>
                  )}
                </div>

                {/* Join button */}
                {!isMyTeam && myPlayer?.role !== 'spectator' && (
                  <button
                    onClick={() => onJoinTeam(team.id)}
                    className="w-full py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
                    style={{ background: `${team.color}20`, border: `1px solid ${team.color}44`, color: team.color }}
                  >
                    {myTeamId ? 'გადასვლა' : 'შესვლა'}
                  </button>
                )}
                {isMyTeam && (
                  <div
                    className="text-center py-1.5 rounded-lg font-mono text-[10px]"
                    style={{ background: `${team.color}15`, color: team.color }}
                  >
                    ✓ შენი გუნდი
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Spectators */}
        {match.spectators.length > 0 && (
          <div
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">მაყურებლები</p>
            <div className="flex flex-wrap gap-1">
              {match.spectators.map(id => (
                <span key={id} className="font-mono text-[10px] text-white/40 px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {match.players[id]?.nickname ?? id.slice(0, 6)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Host controls */}
        {isHost && (
          <button
            onClick={onStart}
            className="w-full py-3 rounded-xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(0,245,255,0.25))', border: '1px solid rgba(155,0,255,0.4)', color: '#fff' }}
          >
            თამაშის დაწყება
          </button>
        )}
        {!isHost && (
          <div className="text-center">
            <p className="font-mono text-[10px] text-white/30">ჰოსტის მოლოდინი…</p>
          </div>
        )}
      </div>
    </div>
  );
}
