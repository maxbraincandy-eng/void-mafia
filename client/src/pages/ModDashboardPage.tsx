import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '@/lib/socket';
import {
  Report, ModLog, PlayerProfilePublic, Phase,
  ModPlayerDetail, LiveRoomInfo, DashboardStats, ModNote, ModeratorLevel,
} from '@/types/index';
import type { Res } from '@/types/index';
import { ModBadge } from '@/components/ui/ModBadge';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useGameStore } from '@/store/gameStore';
import { useAuthStore } from '@/store/authStore';

// ── Permission helpers ────────────────────────────────────────────────
const MOD_RANK: Record<ModeratorLevel, number> = {
  moderator: 0, senior_moderator: 1, admin: 2, owner: 3,
};
function modRank(level: ModeratorLevel | null | undefined): number {
  if (!level) return -1;
  return MOD_RANK[level] ?? -1;
}

// ── Tab types ─────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'rooms' | 'reports' | 'players' | 'broadcast' | 'logs';
type ActionType = 'ban' | 'mute' | 'warn' | 'kick' | 'unban' | 'unmute' | 'terminate' | 'freeze' | 'unfreeze' | 'rename' | 'system_msg' | 'force_phase';

const TABS: { id: Tab; label: string; minRank: number }[] = [
  { id: 'dashboard', label: 'Dashboard', minRank: 0 },
  { id: 'rooms',     label: 'Rooms',     minRank: 0 },
  { id: 'reports',   label: 'Reports',   minRank: 0 },
  { id: 'players',   label: 'Players',   minRank: 0 },
  { id: 'broadcast', label: 'Broadcast', minRank: 1 },  // senior_mod+
  { id: 'logs',      label: 'Logs',      minRank: 2 },  // admin+
];

const PHASE_COLORS: Record<string, string> = {
  lobby: 'text-white/40', role_reveal: 'text-neon-pink', night: 'text-neon-blue',
  morning: 'text-yellow-300', day: 'text-yellow-400', speech: 'text-neon-cyan',
  voting: 'text-neon-red', death_speech: 'text-orange-400', game_over: 'text-white/25',
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

// ── Action Modal ──────────────────────────────────────────────────────
interface ActionState {
  type: ActionType;
  targetId: string;
  targetName: string;
  roomId?: string;
}

export function ModDashboardPage() {
  const addToast = useGameStore(s => s.addToast);
  const profile = useAuthStore(s => s.profile);
  const rank = modRank(profile?.moderatorLevel);
  // Convenience helpers
  const can = (minRank: number) => rank >= minRank;

  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(false);

  // Tab data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [rooms, setRooms] = useState<LiveRoomInfo[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [players, setPlayers] = useState<PlayerProfilePublic[]>([]);
  const [logs, setLogs] = useState<ModLog[]>([]);
  const [maintenance, setMaintenance] = useState(false);

  // UI state
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'reviewing' | 'resolved' | 'rejected'>('open');
  const [logFilter, setLogFilter] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [systemMsg, setSystemMsg] = useState('');
  const [selectedRoomForMsg, setSelectedRoomForMsg] = useState<string>('');
  const [selectedPhaseRoom, setSelectedPhaseRoom] = useState<string>('');
  const [selectedPhase, setSelectedPhase] = useState<Phase>('night');

  // Player detail
  const [playerDetail, setPlayerDetail] = useState<ModPlayerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Action modal
  const [action, setAction] = useState<ActionState | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionDuration, setActionDuration] = useState(3600);
  const [actionNewName, setActionNewName] = useState('');

  // Confirm modal
  const [confirm, setConfirm] = useState<{ title: string; msg: string; onConfirm: () => void } | null>(null);

  // ── Data loaders ──────────────────────────────────────────────────
  const loadDashboard = useCallback(() => {
    setLoading(true);
    socket.emit('mod:get_dashboard' as any, (res: Res<DashboardStats>) => {
      setLoading(false);
      if (res.ok) setStats(res.data);
      else addToast(res.error, 'error');
    });
    socket.emit('mod:get_maintenance' as any, (res: Res<{ enabled: boolean }>) => {
      if (res.ok) setMaintenance(res.data.enabled);
    });
  }, [addToast]);

  const loadRooms = useCallback(() => {
    setLoading(true);
    socket.emit('mod:get_rooms_live' as any, (res: Res<LiveRoomInfo[]>) => {
      setLoading(false);
      if (res.ok) setRooms(res.data);
      else addToast(res.error, 'error');
    });
  }, [addToast]);

  const loadReports = useCallback(() => {
    setLoading(true);
    socket.emit('mod:get_reports' as any, (res: Res<Report[]>) => {
      setLoading(false);
      if (res.ok) setReports(res.data);
      else addToast(res.error, 'error');
    });
  }, [addToast]);

  const loadPlayers = useCallback(() => {
    setLoading(true);
    socket.emit('mod:get_players' as any, (res: Res<PlayerProfilePublic[]>) => {
      setLoading(false);
      if (res.ok) setPlayers(res.data);
      else addToast(res.error, 'error');
    });
  }, [addToast]);

  const loadLogs = useCallback(() => {
    setLoading(true);
    socket.emit('mod:get_logs' as any, (res: Res<ModLog[]>) => {
      setLoading(false);
      if (res.ok) setLogs(res.data);
      else addToast(res.error, 'error');
    });
  }, [addToast]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setPlayerDetail(null);
    if (t === 'dashboard') loadDashboard();
    else if (t === 'rooms') loadRooms();
    else if (t === 'reports') loadReports();
    else if (t === 'players') loadPlayers();
    else if (t === 'logs') loadLogs();
  };

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Auto-refresh rooms tab
  useEffect(() => {
    if (tab !== 'rooms') return;
    const id = setInterval(loadRooms, 8000);
    return () => clearInterval(id);
  }, [tab, loadRooms]);

  // ── Actions ───────────────────────────────────────────────────────
  const openAction = (type: ActionType, targetId: string, targetName: string, roomId?: string) => {
    setAction({ type, targetId, targetName, roomId });
    setActionReason('');
    setActionNewName('');
  };
  const closeAction = () => setAction(null);

  const doAction = () => {
    if (!action) return;
    const { type, targetId, targetName, roomId } = action;

    const onOk = (label: string) => (res: Res<any>) => {
      if (res.ok) {
        addToast(`${label} — ${targetName}`, 'success');
        closeAction();
        if (tab === 'players' && playerDetail) openPlayerDetail(targetId);
        if (tab === 'rooms') loadRooms();
        if (tab === 'reports') loadReports();
      } else {
        addToast(res.error, 'error');
      }
    };

    if (type === 'ban') {
      if (!actionReason.trim()) { addToast('Reason required', 'error'); return; }
      socket.emit('mod:ban' as any, { targetProfileId: targetId, reason: actionReason, duration: actionDuration }, onOk('Banned'));
    } else if (type === 'mute') {
      if (!actionReason.trim()) { addToast('Reason required', 'error'); return; }
      socket.emit('mod:mute' as any, { targetProfileId: targetId, reason: actionReason, duration: actionDuration }, onOk('Muted'));
    } else if (type === 'warn') {
      if (!actionReason.trim()) { addToast('Reason required', 'error'); return; }
      socket.emit('mod:warn' as any, { targetProfileId: targetId, reason: actionReason }, onOk('Warned'));
    } else if (type === 'kick') {
      if (!actionReason.trim()) { addToast('Reason required', 'error'); return; }
      socket.emit('mod:kick_player' as any, { targetProfileId: targetId, reason: actionReason }, onOk('Kicked'));
    } else if (type === 'unban') {
      socket.emit('mod:unban' as any, { targetProfileId: targetId }, onOk('Unbanned'));
    } else if (type === 'unmute') {
      socket.emit('mod:unmute' as any, { targetProfileId: targetId }, onOk('Unmuted'));
    } else if (type === 'terminate') {
      socket.emit('mod:terminate_game' as any, { roomId: targetId, reason: actionReason || 'Rule violation' }, onOk('Terminated'));
    } else if (type === 'freeze') {
      if (!actionReason.trim()) { addToast('Reason required', 'error'); return; }
      socket.emit('mod:freeze_account' as any, { targetProfileId: targetId, reason: actionReason }, onOk('Account frozen'));
    } else if (type === 'unfreeze') {
      socket.emit('mod:unfreeze_account' as any, { targetProfileId: targetId }, onOk('Account unfrozen'));
    } else if (type === 'rename') {
      if (!actionNewName.trim()) { addToast('New name required', 'error'); return; }
      socket.emit('mod:rename_player' as any, { targetProfileId: targetId, newName: actionNewName, reason: actionReason }, onOk('Renamed'));
    } else if (type === 'system_msg') {
      if (!actionReason.trim()) { addToast('Message required', 'error'); return; }
      socket.emit('mod:system_message' as any, { roomId: targetId, message: actionReason }, onOk('Message sent'));
    } else if (type === 'force_phase') {
      socket.emit('mod:force_phase' as any, { roomId: targetId, phase: actionReason as Phase }, (res: Res<null>) => {
        if (res.ok) { addToast(`Phase set to ${actionReason}`, 'success'); closeAction(); loadRooms(); }
        else addToast(res.error, 'error');
      });
    }
  };

  // ── Player Detail ─────────────────────────────────────────────────
  const openPlayerDetail = (profileId: string) => {
    setDetailLoading(true);
    setPlayerDetail(null);
    socket.emit('mod:get_player_detail' as any, { targetProfileId: profileId }, (res: Res<ModPlayerDetail>) => {
      setDetailLoading(false);
      if (res.ok) setPlayerDetail(res.data);
      else addToast(res.error, 'error');
    });
  };

  const submitNote = (targetId: string) => {
    if (!newNote.trim()) return;
    socket.emit('mod:add_note' as any, { targetProfileId: targetId, note: newNote }, (res: Res<null>) => {
      if (res.ok) {
        addToast('Note added', 'success');
        setNewNote('');
        openPlayerDetail(targetId);
      } else addToast(res.error, 'error');
    });
  };

  // ── Report Actions ─────────────────────────────────────────────────
  const resolveReport = (reportId: string, status: 'resolved' | 'rejected') => {
    socket.emit('mod:resolve_report' as any, { reportId, status, notes: '' }, (res: Res<null>) => {
      if (res.ok) { addToast(status === 'resolved' ? 'Report resolved' : 'Report rejected', 'success'); loadReports(); }
      else addToast(res.error, 'error');
    });
  };

  const assignReport = (reportId: string) => {
    socket.emit('mod:assign_report' as any, { reportId, modId: '' }, (res: Res<null>) => {
      if (res.ok) { addToast('Assigned to you', 'success'); loadReports(); }
      else addToast(res.error, 'error');
    });
  };

  // ── Broadcast ─────────────────────────────────────────────────────
  const sendBroadcast = () => {
    if (!broadcastMsg.trim()) { addToast('Message required', 'error'); return; }
    setConfirm({
      title: 'Send Broadcast',
      msg: `Send to all active rooms: "${broadcastMsg}"?`,
      onConfirm: () => {
        setConfirm(null);
        socket.emit('mod:broadcast' as any, { message: broadcastMsg }, (res: Res<null>) => {
          if (res.ok) { addToast('Broadcast sent', 'success'); setBroadcastMsg(''); }
          else addToast(res.error, 'error');
        });
      },
    });
  };

  const toggleMaintenance = (newVal: boolean) => {
    setConfirm({
      title: newVal ? 'Enable Maintenance Mode' : 'Disable Maintenance Mode',
      msg: newVal
        ? 'Non-moderators will not be able to create or join rooms.'
        : 'All players will be able to join rooms again.',
      onConfirm: () => {
        setConfirm(null);
        socket.emit('mod:toggle_maintenance' as any, { enabled: newVal }, (res: Res<{ enabled: boolean }>) => {
          if (res.ok) { setMaintenance(res.data.enabled); addToast(`Maintenance mode ${res.data.enabled ? 'enabled' : 'disabled'}`, 'success'); }
          else addToast(res.error, 'error');
        });
      },
    });
  };

  // ── Filtered data ─────────────────────────────────────────────────
  const filteredReports = reports.filter(r => reportFilter === 'all' || r.status === reportFilter);
  const filteredPlayers = players.filter(p => {
    const q = playerSearch.trim().toLowerCase().replace(/^#/, '');
    return !q || p.username.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.publicId != null && String(p.publicId).includes(q));
  });
  const filteredLogs = logs.filter(l => !logFilter || l.actionType.includes(logFilter) || l.targetName.toLowerCase().includes(logFilter.toLowerCase()) || l.moderatorName.toLowerCase().includes(logFilter.toLowerCase()));

  const statusColor: Record<string, string> = {
    open: 'text-neon-red', reviewing: 'text-neon-pink', resolved: 'text-neon-green', rejected: 'text-white/25',
  };

  return (
    <div className="min-h-screen bg-void scanlines pb-24 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-neon-green/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-neon-green tracking-widest">MOD CONTROL</h1>
              <ModBadge level="admin" size="sm" />
            </div>
            <p className="text-white/25 font-mono text-xs">Moderator Dashboard</p>
          </div>
          {maintenance && (
            <span className="ml-auto text-[10px] font-mono uppercase border border-orange-400/40 text-orange-400 px-2 py-0.5 rounded-lg animate-pulse">Maintenance</span>
          )}
        </div>

        {/* Tabs - scrollable, filtered by rank */}
        <div className="flex gap-1 mb-5 bg-void-50/40 rounded-xl p-1 overflow-x-auto no-scrollbar">
          {TABS.filter(t => can(t.minRank)).map(t => (
            <button key={t.id} onClick={() => switchTab(t.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg font-mono text-xs transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-neon-green/15 text-neon-green border border-neon-green/25' : 'text-white/30 hover:text-white/60'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-neon-green border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* ── Dashboard ─────────────────────────────────────────── */}
        {!loading && tab === 'dashboard' && (
          <div className="space-y-4">
            {stats ? (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Online', value: stats.onlinePlayers, color: 'text-neon-green' },
                  { label: 'Active Rooms', value: stats.activeRooms, color: 'text-neon-cyan' },
                  { label: 'Open Reports', value: stats.openReports, color: stats.openReports > 0 ? 'text-neon-red' : 'text-white/40' },
                  { label: 'Bans (24h)', value: stats.recentBans, color: 'text-neon-pink' },
                ].map(s => (
                  <div key={s.label} className="glass-panel border border-white/5 rounded-xl p-4 text-center">
                    <p className={`font-display text-3xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-white/30 font-mono text-xs mt-1">{s.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/25 font-mono text-sm text-center py-8">Loading stats…</p>
            )}
            <div className="flex gap-2">
              <button onClick={loadDashboard} className="flex-1 py-2 border border-neon-green/20 text-neon-green/60 font-mono text-xs rounded-xl hover:text-neon-green hover:border-neon-green/40 transition-all">
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* ── Rooms ─────────────────────────────────────────────── */}
        {tab === 'rooms' && !loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white/30 font-mono text-xs">{rooms.length} active room{rooms.length !== 1 ? 's' : ''}</p>
              <button onClick={loadRooms} className="text-neon-green/50 font-mono text-xs hover:text-neon-green transition-all">↻ Refresh</button>
            </div>
            {rooms.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No active rooms</p>}
            {rooms.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass-panel border border-white/5 rounded-xl overflow-hidden">
                {/* Room header */}
                <div className="p-3 flex items-center gap-2" onClick={() => setExpandedRoom(expandedRoom === r.id ? null : r.id)}>
                  <div className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neon-cyan text-sm font-bold">{r.code}</span>
                      {r.isPrivate && <span className="text-[9px] font-mono text-white/30 border border-white/10 rounded px-1">PVT</span>}
                      {r.isPaused && <span className="text-[9px] font-mono text-yellow-400 border border-yellow-400/30 rounded px-1">PAUSED</span>}
                      <span className={`text-xs font-mono ${PHASE_COLORS[r.phase] ?? 'text-white/40'}`}>{r.phase}</span>
                    </div>
                    <p className="text-white/25 font-mono text-xs">{r.playerCount}p · Day {r.day} · Host: {r.hostName}</p>
                  </div>
                  <span className="text-white/20 text-xs">{expandedRoom === r.id ? '▲' : '▼'}</span>
                </div>

                {/* Room actions */}
                <div className="px-3 pb-2 flex flex-wrap gap-1">
                  {r.phase !== 'lobby' && r.phase !== 'game_over' && (
                    <>
                      {r.isPaused ? (
                        <button onClick={() => {
                          socket.emit('mod:resume_timer' as any, { roomId: r.id }, (res: Res<null>) => {
                            if (res.ok) { addToast('Timer resumed', 'success'); loadRooms(); } else addToast(res.error, 'error');
                          });
                        }} className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-green/30 text-neon-green hover:bg-neon-green/10 transition-all">
                          ▶ Resume
                        </button>
                      ) : (
                        <button onClick={() => {
                          socket.emit('mod:pause_timer' as any, { roomId: r.id }, (res: Res<null>) => {
                            if (res.ok) { addToast('Timer paused', 'success'); loadRooms(); } else addToast(res.error, 'error');
                          });
                        }} className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all">
                          ⏸ Pause
                        </button>
                      )}
                      {can(2) && (
                        <button onClick={() => openAction('terminate', r.id, `Room ${r.code}`)}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-all">
                          Terminate
                        </button>
                      )}
                      <button onClick={() => openAction('system_msg', r.id, `Room ${r.code}`)}
                        className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-all">
                        Msg
                      </button>
                      {can(2) && (
                        <button onClick={() => { openAction('force_phase', r.id, `Room ${r.code}`); setActionReason('night'); }}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10 transition-all">
                          Phase
                        </button>
                      )}
                      <button onClick={() => {
                        socket.emit('mod:voice_mute_room' as any, { roomId: r.id, reason: 'Muted by moderator' }, (res: Res<null>) => {
                          if (res.ok) addToast('Voice muted', 'success'); else addToast(res.error, 'error');
                        });
                      }} className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-white/10 text-white/30 hover:text-white/60 transition-all">
                        🔇 Voice
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded player list */}
                <AnimatePresence>
                  {expandedRoom === r.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 overflow-hidden">
                      <div className="p-3 space-y-1 max-h-48 overflow-y-auto">
                        {r.players.length === 0 && <p className="text-white/25 font-mono text-xs text-center">No players</p>}
                        {r.players.map(p => (
                          <div key={p.id} className="flex items-center gap-2 py-0.5">
                            <span className={`text-xs font-mono ${p.isAlive ? 'text-white/70' : 'text-white/25 line-through'}`}>
                              {p.seat}. {p.name}
                            </span>
                            {!p.isConnected && <span className="text-[9px] font-mono text-white/20">offline</span>}
                            {p.profileId && (
                              <button onClick={() => { openPlayerDetail(p.profileId!); switchTab('players'); }}
                                className="ml-auto text-[9px] font-mono text-neon-cyan/40 hover:text-neon-cyan transition-all">
                                view
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Reports ───────────────────────────────────────────── */}
        {tab === 'reports' && !loading && (
          <div className="space-y-3">
            {/* Filter */}
            <div className="flex gap-1 flex-wrap">
              {(['all', 'open', 'reviewing', 'resolved', 'rejected'] as const).map(f => (
                <button key={f} onClick={() => setReportFilter(f)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase rounded-lg border transition-all ${
                    reportFilter === f ? 'border-neon-green/40 bg-neon-green/10 text-neon-green' : 'border-white/10 text-white/30 hover:text-white/60'
                  }`}>
                  {f}
                </button>
              ))}
              <button onClick={loadReports} className="ml-auto text-neon-green/50 font-mono text-xs hover:text-neon-green transition-all">↻</button>
            </div>

            {filteredReports.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No reports</p>}
            {filteredReports.map(r => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="glass-panel border border-white/5 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-mono truncate">
                      <span className="text-neon-red">{r.reportedName}</span>
                      <span className="text-white/25 mx-1">←</span>
                      <span className="text-neon-cyan">{r.reporterName}</span>
                    </p>
                    <p className="text-white/30 text-xs font-mono">{r.reason.replace(/_/g, ' ')} · {new Date(r.createdAt).toLocaleDateString()}</p>
                    {r.assignedModeratorId && <p className="text-white/20 text-xs font-mono">Assigned</p>}
                  </div>
                  <span className={`text-xs font-mono uppercase ml-2 flex-shrink-0 ${statusColor[r.status] ?? 'text-white/25'}`}>{r.status}</span>
                </div>
                {r.details && <p className="text-white/40 text-xs font-mono mb-3 italic line-clamp-2">"{r.details}"</p>}
                <div className="flex gap-1 flex-wrap">
                  {r.status === 'open' && can(1) && (
                    <>
                      <button onClick={() => resolveReport(r.id, 'resolved')}
                        className="px-2 py-1 text-[10px] font-mono text-neon-green border border-neon-green/30 rounded-lg hover:bg-neon-green/10">
                        Resolve
                      </button>
                      <button onClick={() => resolveReport(r.id, 'rejected')}
                        className="px-2 py-1 text-[10px] font-mono text-white/30 border border-white/10 rounded-lg hover:text-white/60">
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === 'open' && (
                    <button onClick={() => assignReport(r.id)}
                      className="px-2 py-1 text-[10px] font-mono text-neon-blue border border-neon-blue/30 rounded-lg hover:bg-neon-blue/10">
                      Assign me
                    </button>
                  )}
                  <button onClick={() => openAction('warn', r.reportedPlayerId, r.reportedName)}
                    className="px-2 py-1 text-[10px] font-mono text-yellow-400 border border-yellow-400/30 rounded-lg hover:bg-yellow-400/10 ml-auto">
                    Warn
                  </button>
                  <button onClick={() => openAction('mute', r.reportedPlayerId, r.reportedName)}
                    className="px-2 py-1 text-[10px] font-mono text-neon-pink border border-neon-pink/30 rounded-lg hover:bg-neon-pink/10">
                    Mute
                  </button>
                  {can(1) && (
                    <button onClick={() => openAction('ban', r.reportedPlayerId, r.reportedName)}
                      className="px-2 py-1 text-[10px] font-mono text-neon-red border border-neon-red/30 rounded-lg hover:bg-neon-red/10">
                      Ban
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Players ───────────────────────────────────────────── */}
        {tab === 'players' && !loading && (
          <div className="space-y-3">
            {!playerDetail ? (
              <>
                <input type="text" value={playerSearch} onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Search by name, #ID…"
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-green/40" />
                <div className="flex items-center justify-between">
                  <p className="text-white/20 font-mono text-xs">{filteredPlayers.length} players</p>
                  <button onClick={loadPlayers} className="text-neon-green/50 font-mono text-xs hover:text-neon-green transition-all">↻ Refresh</button>
                </div>
                {filteredPlayers.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No players found</p>}
                {filteredPlayers.map(p => (
                  <div key={p.id} className="glass-panel border border-white/5 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openPlayerDetail(p.id)}>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-sm font-bold truncate ${p.isModerator ? 'text-neon-green' : 'text-white'}`}>{p.username}</span>
                          {p.isModerator && <ModBadge level={p.moderatorLevel} size="sm" />}
                        </div>
                        <p className="text-white/25 text-xs font-mono">
                          G:{p.stats.gamesPlayed} W:{p.stats.wins}
                          {p.publicId != null && <span className="ml-2 text-neon-cyan/50">#{p.publicId}</span>}
                          <span className="ml-2">Lv{p.level}</span>
                        </p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end">
                        <button onClick={() => openAction('warn', p.id, p.username)}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all">
                          warn
                        </button>
                        <button onClick={() => openAction('mute', p.id, p.username)}
                          className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10 transition-all">
                          mute
                        </button>
                        {can(1) && (
                          <button onClick={() => openAction('ban', p.id, p.username)}
                            className="px-2 py-1 text-[10px] font-mono uppercase rounded-lg border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-all">
                            ban
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <PlayerDetailPanel
                detail={playerDetail}
                loading={detailLoading}
                newNote={newNote}
                setNewNote={setNewNote}
                rank={rank}
                onClose={() => setPlayerDetail(null)}
                onSubmitNote={() => submitNote(playerDetail.profile.id)}
                onAction={openAction}
              />
            )}
          </div>
        )}

        {/* ── Broadcast ─────────────────────────────────────────── */}
        {tab === 'broadcast' && (
          <div className="space-y-4">
            {/* Maintenance toggle */}
            <div className="glass-panel border border-white/5 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-mono text-sm text-white font-bold">Maintenance Mode</p>
                  <p className="text-white/30 font-mono text-xs">Block non-mods from joining rooms</p>
                </div>
                <button onClick={() => toggleMaintenance(!maintenance)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${maintenance ? 'bg-orange-500/50' : 'bg-white/10'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${maintenance ? 'left-7 bg-orange-400' : 'left-1 bg-white/30'}`} />
                </button>
              </div>
              {maintenance && <p className="text-orange-400/70 font-mono text-xs">⚠ Server is in maintenance mode</p>}
            </div>

            {/* Broadcast message */}
            <div className="glass-panel border border-white/5 rounded-xl p-4 space-y-3">
              <p className="font-mono text-sm text-white font-bold">Broadcast to All Rooms</p>
              <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
                placeholder="Message to all active rooms…"
                rows={3}
                className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-green/40 resize-none" />
              <button onClick={sendBroadcast} disabled={!broadcastMsg.trim()}
                className="w-full py-2 border border-neon-green/30 bg-neon-green/10 text-neon-green font-mono text-sm rounded-xl hover:bg-neon-green/20 disabled:opacity-40 transition-all">
                Send Broadcast
              </button>
            </div>
          </div>
        )}

        {/* ── Logs ──────────────────────────────────────────────── */}
        {tab === 'logs' && !loading && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <input type="text" value={logFilter} onChange={e => setLogFilter(e.target.value)}
                placeholder="Filter by action, mod, player…"
                className="flex-1 bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-green/40" />
              <button onClick={loadLogs} className="text-neon-green/50 font-mono text-xs hover:text-neon-green transition-all px-2">↻</button>
            </div>
            {filteredLogs.length === 0 && <p className="text-white/25 font-mono text-sm text-center py-8">No logs</p>}
            {filteredLogs.map(l => (
              <div key={l.id} className="glass-panel border border-white/5 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-mono font-bold uppercase ${
                    l.actionType === 'ban' ? 'text-neon-red' : l.actionType === 'mute' ? 'text-neon-pink'
                    : l.actionType === 'warn' ? 'text-yellow-400' : l.actionType === 'freeze' ? 'text-orange-400'
                    : l.actionType === 'rename' ? 'text-neon-cyan' : 'text-neon-green'
                  }`}>{l.actionType.replace(/_/g, ' ')}</span>
                  <span className="text-white/20 text-[10px] font-mono">{fmtTime(l.createdAt)}</span>
                </div>
                <p className="text-white/50 text-xs font-mono">
                  <span className="text-neon-cyan">{l.moderatorName}</span> → <span className="text-white/70">{l.targetName}</span>
                  {l.duration && <span className="text-white/25 ml-1">({fmtDuration(l.duration)})</span>}
                </p>
                {l.reason && <p className="text-white/25 text-xs font-mono italic mt-0.5 line-clamp-1">"{l.reason}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Action Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {action && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={closeAction}>
            <motion.div initial={{ y: 40, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}
              className="glass-panel border border-neon-green/20 rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <h3 className={`font-display font-bold tracking-widest uppercase mb-1 ${
                action.type === 'ban' || action.type === 'terminate' || action.type === 'freeze' ? 'text-neon-red'
                : action.type === 'mute' ? 'text-neon-pink'
                : action.type === 'rename' ? 'text-neon-cyan'
                : action.type === 'unban' || action.type === 'unmute' || action.type === 'unfreeze' ? 'text-neon-green'
                : 'text-yellow-400'
              }`}>
                {action.type.replace('_', ' ')}
              </h3>
              <p className="text-white/40 font-mono text-xs mb-4">{action.targetName}</p>

              {(action.type === 'unban' || action.type === 'unmute' || action.type === 'unfreeze') ? (
                <p className="text-white/50 font-mono text-sm mb-4">Confirm this action on <span className="text-white font-bold">{action.targetName}</span>?</p>
              ) : action.type === 'force_phase' ? (
                <select value={actionReason} onChange={e => setActionReason(e.target.value)}
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none mb-3">
                  {(['night', 'morning', 'day', 'speech', 'voting'] as Phase[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              ) : action.type === 'rename' ? (
                <>
                  <input type="text" value={actionNewName} onChange={e => setActionNewName(e.target.value)}
                    placeholder="New username…"
                    className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 mb-3" />
                  <input type="text" value={actionReason} onChange={e => setActionReason(e.target.value)}
                    placeholder="Reason (optional)…"
                    className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 mb-3" />
                </>
              ) : (
                <>
                  <input type="text" value={actionReason} onChange={e => setActionReason(e.target.value)}
                    placeholder={action.type === 'system_msg' ? 'Message…' : 'Reason…'}
                    className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-neon-green/40 mb-3" />
                  {(action.type === 'ban' || action.type === 'mute') && (
                    <select value={actionDuration} onChange={e => setActionDuration(Number(e.target.value))}
                      className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none mb-3">
                      <option value={900}>15 minutes</option>
                      <option value={3600}>1 hour</option>
                      <option value={10800}>3 hours</option>
                      <option value={43200}>12 hours</option>
                      <option value={86400}>24 hours</option>
                      <option value={604800}>7 days</option>
                      <option value={2592000}>30 days</option>
                    </select>
                  )}
                </>
              )}

              <div className="flex gap-2">
                <button onClick={closeAction} className="flex-1 py-2 border border-white/10 text-white/40 font-mono text-xs rounded-xl hover:text-white/70">Cancel</button>
                <button onClick={doAction}
                  className={`flex-1 py-2 border font-mono font-bold text-xs rounded-xl transition-all capitalize ${
                    action.type === 'ban' || action.type === 'terminate' || action.type === 'freeze' ? 'bg-neon-red/15 border-neon-red/30 text-neon-red hover:bg-neon-red/25'
                    : action.type === 'mute' ? 'bg-neon-pink/15 border-neon-pink/30 text-neon-pink hover:bg-neon-pink/25'
                    : action.type === 'rename' ? 'bg-neon-cyan/15 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/25'
                    : 'bg-neon-green/15 border-neon-green/30 text-neon-green hover:bg-neon-green/25'
                  }`}>
                  Confirm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirm Modal ─────────────────────────────────────────── */}
      <ConfirmModal
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.msg ?? ''}
        confirmLabel="Confirm"
        dangerous
        onConfirm={confirm?.onConfirm ?? (() => {})}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ── Player Detail Panel ───────────────────────────────────────────────
function PlayerDetailPanel({
  detail, loading, newNote, setNewNote, rank, onClose, onSubmitNote, onAction,
}: {
  detail: ModPlayerDetail;
  loading: boolean;
  newNote: string;
  setNewNote: (v: string) => void;
  rank: number;
  onClose: () => void;
  onSubmitNote: () => void;
  onAction: (type: ActionType, targetId: string, targetName: string) => void;
}) {
  const p = detail.profile;
  const can = (minRank: number) => rank >= minRank;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onClose} className="text-white/30 hover:text-white transition-all">← Back</button>
        <span className="font-mono text-neon-cyan font-bold">{p.username}</span>
        {p.isModerator && <ModBadge level={p.moderatorLevel} size="sm" />}
        {detail.accountFrozen && <span className="text-[10px] font-mono text-orange-400 border border-orange-400/30 rounded px-1">FROZEN</span>}
      </div>

      {/* Quick stats */}
      <div className="glass-panel border border-white/5 rounded-xl p-4">
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div><p className="font-mono text-lg font-bold text-neon-cyan">{p.stats.gamesPlayed}</p><p className="text-white/25 font-mono text-xs">Games</p></div>
          <div><p className="font-mono text-lg font-bold text-neon-green">{p.stats.wins}</p><p className="text-white/25 font-mono text-xs">Wins</p></div>
          <div><p className={`font-mono text-lg font-bold ${detail.reportCount > 2 ? 'text-neon-red' : 'text-white/50'}`}>{detail.reportCount}</p><p className="text-white/25 font-mono text-xs">Reports</p></div>
        </div>
        <p className="text-white/20 font-mono text-[10px] truncate">{p.id}</p>
        {p.publicId != null && <p className="text-white/30 font-mono text-xs">#{p.publicId} · Lv{p.level}</p>}
      </div>

      {/* Active ban/mute */}
      {detail.ban && (
        <div className="glass-panel border border-neon-red/15 rounded-xl p-3">
          <p className="text-neon-red text-xs font-mono font-bold">BANNED until {new Date(detail.ban.expiresAt).toLocaleDateString()}</p>
          <p className="text-white/40 text-xs font-mono">{detail.ban.reason}</p>
          <p className="text-white/20 text-[10px] font-mono">by {detail.ban.issuedByName}</p>
          {can(1) && (
            <button onClick={() => onAction('unban', p.id, p.username)} className="mt-2 px-3 py-1 text-[10px] font-mono text-neon-green border border-neon-green/30 rounded-lg hover:bg-neon-green/10">
              Unban
            </button>
          )}
        </div>
      )}
      {detail.mute && (
        <div className="glass-panel border border-neon-pink/15 rounded-xl p-3">
          <p className="text-neon-pink text-xs font-mono font-bold">MUTED until {new Date(detail.mute.expiresAt).toLocaleDateString()}</p>
          <p className="text-white/40 text-xs font-mono">{detail.mute.reason}</p>
          <button onClick={() => onAction('unmute', p.id, p.username)} className="mt-2 px-3 py-1 text-[10px] font-mono text-neon-green border border-neon-green/30 rounded-lg hover:bg-neon-green/10">
            Unmute
          </button>
        </div>
      )}

      {/* Warnings */}
      {detail.warnings.length > 0 && (
        <div className="glass-panel border border-yellow-400/10 rounded-xl p-3">
          <p className="text-yellow-400 text-xs font-mono font-bold mb-2">{detail.warnings.length} Warning{detail.warnings.length !== 1 ? 's' : ''}</p>
          {detail.warnings.slice(0, 3).map(w => (
            <p key={w.id} className="text-white/30 text-[10px] font-mono mb-1">· {w.reason} — <span className="text-white/20">{w.issuedByName}</span></p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1">
        <button onClick={() => onAction('warn', p.id, p.username)}
          className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10 transition-all">
          warn
        </button>
        <button onClick={() => onAction('mute', p.id, p.username)}
          className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-neon-pink/30 text-neon-pink hover:bg-neon-pink/10 transition-all">
          mute
        </button>
        <button onClick={() => onAction('kick', p.id, p.username)}
          className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/10 transition-all">
          kick
        </button>
        {can(1) && (
          <>
            <button onClick={() => onAction('ban', p.id, p.username)}
              className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-neon-red/30 text-neon-red hover:bg-neon-red/10 transition-all">
              ban
            </button>
            <button onClick={() => onAction('rename', p.id, p.username)}
              className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 transition-all">
              rename
            </button>
            {detail.accountFrozen ? (
              <button onClick={() => onAction('unfreeze', p.id, p.username)}
                className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-neon-green/30 text-neon-green hover:bg-neon-green/10 transition-all">
                unfreeze
              </button>
            ) : (
              <button onClick={() => onAction('freeze', p.id, p.username)}
                className="px-3 py-1.5 text-[10px] font-mono uppercase rounded-lg border border-orange-400/30 text-orange-400 hover:bg-orange-400/10 transition-all">
                freeze
              </button>
            )}
          </>
        )}
      </div>

      {/* Mod notes */}
      <div className="glass-panel border border-white/5 rounded-xl p-4 space-y-3">
        <p className="font-mono text-xs text-white/60 font-bold">Internal Notes</p>
        {detail.notes.length === 0 && <p className="text-white/20 font-mono text-xs">No notes yet</p>}
        {detail.notes.map(n => (
          <div key={n.id} className="border-l-2 border-neon-green/20 pl-2">
            <p className="text-white/60 text-xs font-mono">{n.note}</p>
            <p className="text-white/20 text-[10px] font-mono">{n.modName} · {new Date(n.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
            placeholder="Add note…"
            onKeyDown={e => { if (e.key === 'Enter') onSubmitNote(); }}
            className="flex-1 bg-void-50/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-white/25 focus:outline-none focus:border-neon-green/40" />
          <button onClick={onSubmitNote} disabled={!newNote.trim()}
            className="px-3 py-1.5 text-xs font-mono border border-neon-green/30 text-neon-green rounded-xl hover:bg-neon-green/10 disabled:opacity-40 transition-all">
            Add
          </button>
        </div>
      </div>

      {loading && <div className="text-center py-4"><div className="w-5 h-5 border-2 border-neon-green border-t-transparent rounded-full animate-spin mx-auto" /></div>}
    </div>
  );
}
