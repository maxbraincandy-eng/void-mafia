import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { socket } from '@/lib/socket';
import { Report, ModLog, PlayerProfilePublic, RoomListItem } from '@/types/index';
import type { Res } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';

type Tab = 'reports' | 'rooms' | 'players' | 'logs';
type ActionType = 'ban' | 'mute' | 'warn' | 'kick' | 'unban' | 'unmute' | 'terminate_game';

export function ModDashboardPage() {
  const [tab, setTab] = useState<Tab>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ profileId: string; name: string } | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionDuration, setActionDuration] = useState(3600);
  const [playerSearch, setPlayerSearch] = useState('');

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

  const closeAction = () => { setActionTarget(null); setActionType(null); setActionReason(''); };

  const doAction = () => {
    if (!actionTarget || !actionType) return;

    const clearOnOk = (res: Res<null>) => { if (res.ok) closeAction(); };

    if (actionType === 'ban') {
      if (!actionReason.trim()) return;
      socket.emit('mod:ban', { targetProfileId: actionTarget.profileId, reason: actionReason, duration: actionDuration }, clearOnOk);
    } else if (actionType === 'mute') {
      if (!actionReason.trim()) return;
      socket.emit('mod:mute', { targetProfileId: actionTarget.profileId, reason: actionReason, duration: actionDuration }, clearOnOk);
    } else if (actionType === 'warn') {
      if (!actionReason.trim()) return;
      socket.emit('mod:warn', { targetProfileId: actionTarget.profileId, reason: actionReason }, clearOnOk);
    } else if (actionType === 'kick') {
      if (!actionReason.trim()) return;
      socket.emit('mod:kick_player' as any, { targetProfileId: actionTarget.profileId, reason: actionReason }, clearOnOk);
    } else if (actionType === 'unban') {
      socket.emit('mod:unban' as any, { targetProfileId: actionTarget.profileId }, clearOnOk);
    } else if (actionType === 'unmute') {
      socket.emit('mod:unmute' as any, { targetProfileId: actionTarget.profileId }, clearOnOk);
    } else if (actionType === 'terminate_game') {
      socket.emit('mod:terminate_game' as any, { roomId: actionTarget.profileId, reason: actionReason || 'Rule violation' }, clearOnOk);
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
                {r.phase !== 'lobby' && r.phase !== 'game_over' && (
                  <button
                    onClick={() => { setActionTarget({ profileId: r.id, name: `Room ${r.code}` }); setActionType('terminate_game'); setActionReason(''); }}
                    className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-all"
                  >
                    Terminate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Players */}
        {!loading && tab === 'players' && (
          <div className="space-y-2">
            {/* Search */}
            <input
              type="text"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search by name, #ID or internal ID…"
              className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-green/40 mb-1"
            />
            {players.filter(p => {
              const q = playerSearch.trim().toLowerCase().replace(/^#/, '');
              return q === '' ||
                p.username.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q) ||
                (p.publicId != null && String(p.publicId).includes(q));
            }).length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No players found</p>}
            {players
              .filter(p => {
                const q = playerSearch.trim().toLowerCase().replace(/^#/, '');
                return q === '' ||
                  p.username.toLowerCase().includes(q) ||
                  p.id.toLowerCase().includes(q) ||
                  (p.publicId != null && String(p.publicId).includes(q));
              })
              .map(p => (
              <div key={p.id} className="glass-panel border border-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-sm font-bold ${p.isModerator ? 'text-neon-green' : 'text-white'}`}>{p.username}</span>
                      {p.isModerator && <ModBadge level={p.moderatorLevel} />}
                    </div>
                    <p className="text-white/25 text-xs font-mono">
                      G:{p.stats.gamesPlayed} W:{p.stats.wins} ({p.stats.winRate}%)
                      {p.publicId != null && <span className="ml-2 text-neon-cyan/50">#{p.publicId}</span>}
                    </p>
                    <p className="text-white/15 text-[9px] font-mono truncate max-w-[160px]">{p.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[130px]">
                    {(['warn', 'mute', 'ban', 'kick'] as const).map(a => (
                      <button key={a} onClick={() => { setActionTarget({ profileId: p.id, name: p.username }); setActionType(a); setActionReason(''); }}
                        className={`px-2 py-1 text-[10px] font-mono uppercase rounded-lg border transition-all ${
                          a === 'ban' ? 'border-neon-red/30 text-neon-red hover:bg-neon-red/10'
                          : a === 'mute' ? 'border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10'
                          : a === 'kick' ? 'border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10'
                          : 'border-white/10 text-white/30 hover:text-white/60'
                        }`}
                      >
                        {a}
                      </button>
                    ))}
                    <button onClick={() => { setActionTarget({ profileId: p.id, name: p.username }); setActionType('unban'); }}
                      className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-green/20 text-neon-green/50 hover:text-neon-green hover:border-neon-green/40 transition-all">
                      unban
                    </button>
                    <button onClick={() => { setActionTarget({ profileId: p.id, name: p.username }); setActionType('unmute'); }}
                      className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-cyan/20 text-neon-cyan/50 hover:text-neon-cyan hover:border-neon-cyan/40 transition-all">
                      unmute
                    </button>
                  </div>
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
          onClick={closeAction}>
          <div className="glass-panel border border-neon-green/20 rounded-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <h3 className={`font-display font-bold tracking-widest uppercase mb-1 capitalize ${
              actionType === 'ban' ? 'text-neon-red'
              : actionType === 'mute' ? 'text-neon-pink'
              : actionType === 'kick' ? 'text-neon-blue'
              : actionType === 'terminate_game' ? 'text-orange-400'
              : actionType === 'unban' || actionType === 'unmute' ? 'text-neon-green'
              : 'text-yellow-400'
            }`}>
              {actionType === 'terminate_game' ? 'Terminate Game' : `${actionType} Player`}
            </h3>
            <p className="text-white/40 font-mono text-xs mb-4">{actionTarget.name}</p>

            {(actionType === 'unban' || actionType === 'unmute') ? (
              <p className="text-white/50 font-mono text-sm mb-4">
                This will {actionType === 'unban' ? 'remove the ban on' : 'unmute'} <span className="text-white font-bold">{actionTarget.name}</span>.
                Are you sure?
              </p>
            ) : (
              <>
                <input
                  type="text"
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  placeholder={actionType === 'terminate_game' ? 'Reason for termination…' : 'Reason…'}
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
              </>
            )}

            <div className="flex gap-2">
              <button onClick={closeAction}
                className="flex-1 py-2 border border-white/10 text-white/40 font-mono text-xs rounded-xl hover:text-white/70">
                Cancel
              </button>
              <button
                onClick={doAction}
                disabled={actionType !== 'unban' && actionType !== 'unmute' && actionType !== 'terminate_game' && !actionReason.trim()}
                className={`flex-1 py-2 border font-mono font-bold text-xs rounded-xl transition-all disabled:opacity-40 capitalize ${
                  actionType === 'ban' ? 'bg-neon-red/15 border-neon-red/30 text-neon-red hover:bg-neon-red/25'
                  : actionType === 'mute' ? 'bg-neon-pink/15 border-neon-pink/30 text-neon-pink hover:bg-neon-pink/25'
                  : actionType === 'kick' ? 'bg-neon-blue/15 border-neon-blue/30 text-neon-blue hover:bg-neon-blue/25'
                  : actionType === 'terminate_game' ? 'bg-orange-400/15 border-orange-400/30 text-orange-400 hover:bg-orange-400/25'
                  : 'bg-neon-green/15 border-neon-green/30 text-neon-green hover:bg-neon-green/25'
                }`}
              >
                {actionType === 'terminate_game' ? 'Terminate' : actionType}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
