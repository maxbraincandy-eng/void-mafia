import { useState } from 'react';
import type { WWWMatchPublic, WWWTeam, WWWPlayer } from '@/store/wwwStore';
import type { useWWWVoice } from '@/hooks/useWWWVoice';
import { WWWVoiceBar } from './WWWVoiceBar';

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
  const myPlayer = match.players[myUserId];
  const isHost = match.hostId === myUserId;

  function copyCode() {
    navigator.clipboard?.writeText(match.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const canStart = isHost && match.teams.every(t => t.playerIds.length > 0);

  const categoryLabel: Record<string, string> = {
    philosophy: 'ფილოსოფია', history: 'ისტორია', science: 'მეცნიერება',
    movies: 'კინო', literature: 'ლიტერატურა', geography: 'გეოგრაფია',
    psychology: 'ფსიქოლოგია', logic: 'ლოგიკა', general: 'საერთო', mixed: 'შერეული',
  };
  const diffLabel: Record<string, string> = {
    easy: 'მარტივი', medium: 'საშუალო', hard: 'რთული', mixed: 'შერეული',
  };

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: '#03000d', color: '#fff' }}
    >
      {/* Voice bar */}
      <WWWVoiceBar voice={voice} matchId={match.id} myRole={myPlayer?.role ?? 'spectator'} />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
          კოდი
        </p>
        <button
          onClick={copyCode}
          className="font-mono text-3xl font-bold tracking-widest transition-all active:scale-95"
          style={{ color: copied ? '#00f5ff' : '#fff', textShadow: copied ? '0 0 12px #00f5ff' : 'none' }}
        >
          {match.code}
        </button>
        {copied && (
          <p className="font-mono text-[10px] mt-0.5" style={{ color: '#00f5ff' }}>დაკოპირდა!</p>
        )}

        <h1 className="font-display font-bold text-xl mt-3" style={{ color: '#fff' }}>
          რა? სად? როდის?
        </h1>

        {/* Pills */}
        <div className="flex flex-wrap justify-center gap-1.5 mt-2">
          <Pill label={categoryLabel[match.settings.questionCategory] ?? match.settings.questionCategory} color="#9b00ff" />
          <Pill label={diffLabel[match.settings.difficulty] ?? match.settings.difficulty} color="#00f5ff" />
          <Pill label={`${match.settings.questionsCount} კითხვა`} color="#fbbf24" />
          <Pill label={`${match.settings.discussionSeconds}წმ`} color="#22c55e" />
        </div>
      </div>

      {/* Teams */}
      <div className="flex-1 px-3 pb-4">
        <div className="grid grid-cols-2 gap-3">
          {match.teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              players={match.players}
              myUserId={myUserId}
              isHost={isHost}
              onJoin={() => onJoinTeam(team.id)}
              onAssignCaptain={(uid) => onAssignCaptain(uid, team.id)}
            />
          ))}
        </div>

        {/* Spectators */}
        {match.spectators.length > 0 && (
          <div className="mt-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="font-mono text-[9px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              მაყურებლები ({match.spectators.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {match.spectators.map(uid => {
                const p = match.players[uid];
                return p ? (
                  <span key={uid} className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                    {p.nickname}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex flex-col gap-2">
          {isHost && (
            <button
              onClick={onStart}
              disabled={!canStart}
              className="w-full py-3 rounded-2xl font-display font-bold text-sm uppercase tracking-wider transition-all active:scale-95 disabled:opacity-30"
              style={{
                background: canStart ? 'rgba(0,245,255,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${canStart ? 'rgba(0,245,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: canStart ? '#00f5ff' : 'rgba(255,255,255,0.3)',
                boxShadow: canStart ? '0 0 20px rgba(0,245,255,0.15)' : 'none',
              }}
            >
              {canStart ? 'თამაშის დაწყება' : 'ველოდებით მოთამაშეებს...'}
            </button>
          )}
          {!isHost && (
            <p className="text-center font-mono text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              ჰოსტს ელოდებათ...
            </p>
          )}
          <button
            onClick={onLeave}
            className="w-full py-2 rounded-2xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
            style={{ background: 'rgba(255,45,85,0.08)', border: '1px solid rgba(255,45,85,0.2)', color: 'rgba(255,45,85,0.6)' }}
          >
            გამოსვლა
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}40`, color }}
    >
      {label}
    </span>
  );
}

function TeamCard({
  team, players, myUserId, isHost, onJoin, onAssignCaptain,
}: {
  team: WWWTeam;
  players: Record<string, WWWPlayer>;
  myUserId: string;
  isHost: boolean;
  onJoin: () => void;
  onAssignCaptain: (uid: string) => void;
}) {
  const myTeamId = players[myUserId]?.teamId;
  const isMyTeam = myTeamId === team.id;
  const isMember = team.playerIds.includes(myUserId);

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'rgba(10,6,28,0.8)',
        border: `1px solid ${team.color}30`,
      }}
    >
      {/* Team header */}
      <div
        className="px-3 py-2 text-center"
        style={{ background: `${team.color}15`, borderBottom: `1px solid ${team.color}25` }}
      >
        <p className="font-display font-bold text-sm" style={{ color: team.color }}>
          {team.name}
        </p>
        <p className="font-mono text-[9px] mt-0.5" style={{ color: `${team.color}80` }}>
          {team.playerIds.length} მოთამაშე
        </p>
      </div>

      {/* Players list */}
      <div className="flex-1 p-2 space-y-1 min-h-[60px]">
        {team.playerIds.length === 0 ? (
          <p className="font-mono text-[9px] text-center py-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            ცარიელი
          </p>
        ) : (
          team.playerIds.map(uid => {
            const p = players[uid];
            if (!p) return null;
            const isCaptain = team.captainId === uid;
            return (
              <div key={uid} className="flex items-center gap-1.5">
                <span
                  className="font-mono text-[10px] flex-1 truncate"
                  style={{ color: p.connected ? '#fff' : 'rgba(255,255,255,0.35)' }}
                >
                  {p.nickname}
                  {!p.connected && <span className="ml-1 opacity-50">(off)</span>}
                </span>
                {isCaptain && <span title="კაპიტანი">👑</span>}
                {isHost && !isCaptain && uid !== myUserId && (
                  <button
                    onClick={() => onAssignCaptain(uid)}
                    className="font-mono text-[8px] px-1 rounded transition-all active:scale-95"
                    style={{ background: `${team.color}20`, color: team.color, border: `1px solid ${team.color}30` }}
                    title="კაპიტნად დანიშვნა"
                  >
                    👑
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Join button */}
      {!isMember && (
        <div className="p-2 pt-0">
          <button
            onClick={onJoin}
            className="w-full py-1.5 rounded-xl font-mono text-[10px] uppercase tracking-wider transition-all active:scale-95"
            style={{
              background: `${team.color}15`,
              border: `1px solid ${team.color}35`,
              color: team.color,
            }}
          >
            გუნდში შესვლა
          </button>
        </div>
      )}
      {isMyTeam && (
        <div className="px-2 pb-2">
          <p className="text-center font-mono text-[9px]" style={{ color: `${team.color}60` }}>
            შენი გუნდი
          </p>
        </div>
      )}
    </div>
  );
}
