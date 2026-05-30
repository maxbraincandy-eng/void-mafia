import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { socket } from '@/lib/socket';
import { Report, ModLog, PlayerProfilePublic, RoomListItem } from '@/types/index';
import type { Res } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';

type Tab = 'reports' | 'rooms' | 'players' | 'logs';

export function ModDashboardPage() {
  const [tab, setTab] = useState<Tab>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ profileId: string; name: string } | null>(null);
  const [actionType, setActionType] = useState<'ban' | 'mute' | 'warn' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionDuration, setActionDuration] = useState(3600);

  const load = (t: Tab) => {
    setLoading(true);
    setTab(t);
    const event = t === 'reports' ? 'mod:get_reports'
      : t === 'rooms' ? 'mod:get_rooms'
      : t === 'players' ? 'mod:get_players'
      : 'mod:get_logs';

    socket.emit(event as any, (res: Res<any>) => {
      setLoading(false);
      if (!res.ok) return;
      if (t === 'reports') setReports(res.data);
      else if (t === 'rooms') setRooms(res.data);
      else if (t === 'players') setPlayers(res.data);
      else setLogs(res.data);
    });
  };

  useEffect(() => { load('reports'); }, []);

  const resolveReport = (reportId: string, status: 'resolved' | 'rejected') => {
    socket.emit('mod:resolve_report', { reportId, status, notes: '' }, (res: Res<null>) => {
      if (res.ok) load('reports');
    });
  };

  const doAction = () => {
    if (!actionTarget || !actionType || !actionReason.trim()) return;
    if (actionType === 'ban') {
      socket.emit('mod:ban', { targetProfileId: actionTarget.profileId, reason: actionReason, duration: actionDuration }, (res: Res<null>) => {
        if (res.ok) { setActionTarget(null); setActionType(null); }
      });
    } else if (actionType === 'mute') {
      socket.emit('mod:mute', { targetProfileId: actionTarget.profileId, reason: actionReason, duration: actionDuration }, (res: Res<null>) => {
        if (res.ok) { setActionTarget(null); setActionType(null); }
      });
    } else {
      socket.emit('mod:warn', { targetProfileId: actionTarget.profileId, reason: actionReason }, (res: Res<null>) => {
        if (res.ok) { setActionTarget(null); setActionType(null); }
      });
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'reports', label: 'Reports' },
    { id: 'rooms',   label: 'Rooms' },
    { id: 'players', label: 'Players' },
    { id: 'logs',    label: 'Logs' },
  ];

  const statusColor: Record<string, string> = {
    open: 'text-neon-red',
    reviewing: 'text-neon-pink',
    resolved: 'text-neon-green',
    rejected: 'text-white/30',
  };

  return (
    <div className="min-h-screen bg-void scanlines pb-20 relative overflow-hidden">
      {/* Green ambient for mod */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-green/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-neon-green tracking-widest">MOD CONTROL</h1>
              <ModBadge level="admin" size="sm" />
            </div>
            <p className="text-white/25 font-mono text-xs">Application Moderator Dashboard</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-void-50/40 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => load(t.id)}
              className={`flex-1 py-2 rounded-lg font-mono text-xs transition-all ${
                tab === t.id
                  ? 'bg-neon-green/15 text-neon-green border border-neon-green/25'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-neon-green border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* Reports */}
        {!loading && tab === 'reports' && (
          <div className="space-y-3">
            {reports.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No reports</p>}
            {reports.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass-panel border border-neon-green/10 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-white text-sm font-mono">
                      <span className="text-neon-red">{r.reportedName}</span>
                      <span className="text-white/30 mx-1">reported by</span>
                      <span className="text-neon-cyan">{r.reporterName}</span>
                    </p>
                    <p className="text-white/40 text-xs font-mono">{r.reason.replace(/_/g, ' ')} · {new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-mono uppercase ${statusColor[r.status] ?? 'text-white/30'}`}>
                    {r.status}
                  </span>
                </div>
                {r.details && <p className="text-white/50 text-xs font-mono mb-3 italic">"{r.details}"</p>}
                {r.status === 'open' && (
                  <div className="flex gap-2">
                    <button onClick={() => resolveReport(r.id, 'resolved')}
                      className="px-3 py-1 text-xs font-mono text-neon-green border border-neon-green/30 rounded-lg hover:bg-neon-green/10">
                      Resolve
                    </button>
                    <button onClick={() => resolveReport(r.id, 'rejected')}
                      className="px-3 py-1 text-xs font-mono text-white/30 border border-white/10 rounded-lg hover:text-white/60">
                      Reject
                    </button>
                    <button onClick={() => { setActionTarget({ profileId: r.reportedPlayerId, name: r.reportedName }); setActionType('warn'); }}
                      className="px-3 py-1 text-xs font-mono text-neon-pink border border-neon-pink/30 rounded-lg hover:bg-neon-pink/10 ml-auto">
                      Warn
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Rooms */}
        {!loading && tab === 'rooms' && (
          <div className="space-y-2">
            {rooms.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No active rooms</p>}
            {rooms.map(r => (
              <div key={r.id} className="glass-panel border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="font-mono text-neon-cyan text-sm font-bold">{r.code}</span>
                  <span className="text-white/30 font-mono text-xs ml-2">{r.playerCount} players · {r.phase}</span>
                  <p className="text-white/20 text-xs font-mono">Host: {r.hostName}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Players */}
        {!loading && tab === 'players' && (
          <div className="space-y-2">
            {players.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No players online</p>}
            {players.map(p => (
              <div key={p.id} className="glass-panel border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-bold ${p.isModerator ? 'text-neon-green' : 'text-white'}`}>{p.username}</span>
                    {p.isModerator && <ModBadge level={p.moderatorLevel} />}
                  </div>
                  <p className="text-white/25 text-xs font-mono">G:{p.stats.gamesPlayed} W:{p.stats.wins} ({p.stats.winRate}%)</p>
                </div>
                <div className="flex gap-1">
                  {(['warn', 'mute', 'ban'] as const).map(a => (
                    <button key={a} onClick={() => { setActionTarget({ profileId: p.id, name: p.username }); setActionType(a); }}
                      className={`px-2 py-1 text-[10px] font-mono uppercase rounded-lg border transition-all ${
                        a === 'ban' ? 'border-neon-red/30 text-neon-red hover:bg-neon-red/10'
                        : a === 'mute' ? 'border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10'
                        : 'border-white/10 text-white/30 hover:text-white/60'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Logs */}
        {!loading && tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No logs yet</p>}
            {logs.map(l => (
              <div key={l.id} className="glass-panel border border-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neon-green text-xs font-mono font-bold uppercase">{l.actionType}</span>
                  <span className="text-white/20 text-xs font-mono">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-white/50 text-xs font-mono">
                  <span className="text-neon-cyan">{l.moderatorName}</span> → <span className="text-white/70">{l.targetName}</span>
                </p>
                {l.reason && <p className="text-white/30 text-xs font-mono italic mt-0.5">"{l.reason}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionTarget && actionType && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => { setActionTarget(null); setActionType(null); }}>
          <div className="glass-panel border border-neon-green/20 rounded-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <h3 className="font-display font-bold text-neon-green tracking-widest uppercase mb-1 capitalize">
              {actionType} Player
            </h3>
            <p className="text-white/40 font-mono text-xs mb-4">{actionTarget.name}</p>

            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="Reason…"
              className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 mb-3"
            />

            {(actionType === 'ban' || actionType === 'mute') && (
              <select
                value={actionDuration}
                onChange={e => setActionDuration(Number(e.target.value))}
                className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none mb-3"
              >
                <option value={900}>15 minutes</option>
                <option value={3600}>1 hour</option>
                <option value={10800}>3 hours</option>
                <option value={43200}>12 hours</option>
                <option value={86400}>24 hours</option>
                <option value={604800}>7 days</option>
              </select>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setActionTarget(null); setActionType(null); }}
                className="flex-1 py-2 border border-white/10 text-white/40 font-mono text-xs rounded-xl hover:text-white/70">
                Cancel
              </button>
              <button onClick={doAction} disabled={!actionReason.trim()}
                className="flex-1 py-2 bg-neon-green/15 border border-neon-green/30 text-neon-green font-mono font-bold text-xs rounded-xl hover:bg-neon-green/25 disabled:opacity-40 capitalize">
                {actionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
