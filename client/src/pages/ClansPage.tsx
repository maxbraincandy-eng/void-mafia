import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useSocialStore } from '@/store/socialStore';
import { useT } from '@/store/langStore';
import { emitWithAck } from '@/lib/socket';
import { ClanPublic, ClanMember, ClanModLog, ClanRole } from '@/types/index';
import { PoweredBy } from '@/components/ui/PoweredBy';
import { ClanRoleBadge } from '@/components/ui/ClanRoleBadge';

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

const RARITY_TAG: Record<string, string> = {
  owner:     'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  admin:     'bg-neon-purple/20 text-purple-300 border-purple-500/30',
  moderator: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/30',
  member:    'bg-white/5 text-white/50 border-white/10',
};

function WinRate({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const rate  = total > 0 ? Math.round((wins / total) * 100) : 0;
  return (
    <span className={total === 0 ? 'text-white/25' : rate >= 60 ? 'text-neon-green' : rate >= 40 ? 'text-yellow-400' : 'text-neon-red'}>
      {total === 0 ? '—' : `${rate}%`}
    </span>
  );
}

export function ClansPage() {
  const profile = useAuthStore(s => s.profile);
  const myClanRole = useAuthStore(s => s.myClanRole);
  const refreshClanMembership = useAuthStore(s => s.refreshClanMembership);
  const { openProfile } = useSocialStore();
  const [clans, setClans]               = useState<ClanPublic[]>([]);
  const [myClan, setMyClan]             = useState<ClanPublic | null>(null);
  const [members, setMembers]           = useState<ClanMember[]>([]);
  const [selected, setSelected]         = useState<ClanPublic | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [showCreate, setShowCreate]     = useState(false);
  const [form, setForm]                 = useState({ name: '', tag: '', description: '' });
  const [modLogs, setModLogs]           = useState<ClanModLog[]>([]);
  const [showModLogs, setShowModLogs]   = useState(false);
  const [roleTarget, setRoleTarget]     = useState<string | null>(null);
  const [roleLoading, setRoleLoading]   = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError]     = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [listRes, mineRes] = await Promise.all([
      emitWithAck<null, Res<ClanPublic[]>>('clan:list', null),
      profile ? emitWithAck<null, Res<ClanPublic | null>>('clan:mine', null) : Promise.resolve({ ok: true, data: null } as Res<ClanPublic | null>),
    ]);
    if (listRes.ok) setClans(listRes.data);
    if (mineRes.ok) setMyClan(mineRes.data);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function loadClanDetail(clan: ClanPublic) {
    setSelected(clan);
    const res = await emitWithAck<{ clanId: string }, Res<{ clan: ClanPublic; members: ClanMember[] }>>('clan:get', { clanId: clan.id });
    if (res.ok) { setSelected(res.data.clan); setMembers(res.data.members); }
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.tag.trim()) return;
    setError('');
    const res = await emitWithAck<typeof form, Res<ClanPublic>>('clan:create', form);
    if (!res.ok) { setError(res.error); return; }
    setMyClan(res.data);
    setClans(prev => [res.data, ...prev]);
    setShowCreate(false);
    setForm({ name: '', tag: '', description: '' });
  }

  async function handleJoin(clanId: string) {
    const res = await emitWithAck<{ clanId: string }, Res<null>>('clan:join', { clanId });
    if (!res.ok) { setError(res.error); return; }
    loadAll();
  }

  async function handleLeave() {
    const res = await emitWithAck<null, Res<null>>('clan:leave', null);
    if (!res.ok) { setError(res.error); return; }
    setMyClan(null);
    refreshClanMembership();
    loadAll();
  }

  async function handleSetRole(targetPlayerId: string, newRole: ClanRole) {
    setRoleLoading(true);
    setError('');
    const res = await emitWithAck<{ targetPlayerId: string; newRole: ClanRole }, Res<null>>('clan:set_role', { targetPlayerId, newRole });
    setRoleLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setRoleTarget(null);
    if (selected) await loadClanDetail(selected);
  }

  async function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !myClan) return;
    setImageError('');
    setImageUploading(true);
    try {
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (imageData.length > 270_000) {
        setImageError('Image too large. Please use an image under ~200KB.');
        return;
      }
      const res = await emitWithAck<{ clanId: string; imageData: string }, Res<null>>(
        'clan:update_image', { clanId: myClan.id, imageData },
      );
      if (!res.ok) { setImageError(res.error); return; }
      setMyClan(prev => prev ? { ...prev, imageUrl: imageData } : prev);
      setSelected(prev => prev && prev.id === myClan.id ? { ...prev, imageUrl: imageData } : prev);
      setClans(prev => prev.map(c => c.id === myClan.id ? { ...c, imageUrl: imageData } : c));
    } catch {
      setImageError('Upload failed. Please try again.');
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function loadModLogs() {
    if (!myClan) return;
    setShowModLogs(true);
    const res = await emitWithAck<{ clanId: string }, Res<ClanModLog[]>>('clan:get_mod_logs', { clanId: myClan.id });
    if (res.ok) setModLogs(res.data);
  }

  const amInSelected = myClan?.id === selected?.id;
  const amInAnyClan  = !!myClan;
  const canManageRoles = myClanRole === 'owner' || myClanRole === 'admin';

  return (
    <div className="min-h-screen bg-neon-grid-animated scanlines pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-80 h-80 bg-neon-purple/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-neon-pink/8 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold gradient-text tracking-wide">VOID MAFIA</h1>
            <PoweredBy className="block mt-0.5" />
          </div>
          {profile && !amInAnyClan && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
              style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.4)', color: 'rgba(180,80,255,0.9)' }}
            >
              <span className="text-base">+</span> Create
            </button>
          )}
          {profile && amInAnyClan && (
            <button
              onClick={handleLeave}
              className="font-mono text-[10px] uppercase tracking-wider text-white/30 hover:text-neon-red/70 transition-colors"
            >
              Leave clan
            </button>
          )}
        </div>

        {/* Hidden file input for clan image upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleImageFileChange}
        />

        {/* My clan banner */}
        {myClan && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-neon-purple/25 bg-neon-purple/6 px-4 py-3 flex items-center gap-3"
          >
            {/* Clan logo with upload button for owner */}
            <div className="relative flex-shrink-0">
              <div
                className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center font-display font-bold text-neon-purple text-sm cursor-pointer"
                style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.35)' }}
                onClick={() => loadClanDetail(myClan)}
              >
                {myClan.imageUrl
                  ? <img src={myClan.imageUrl} alt={myClan.name} className="w-full h-full object-cover" />
                  : myClan.tag}
              </div>
              {myClanRole === 'owner' && (
                <button
                  onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  disabled={imageUploading}
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{ background: 'rgba(138,43,226,0.95)', border: '1.5px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                >
                  {imageUploading
                    ? <div className="w-2 h-2 border border-white/60 border-t-white rounded-full animate-spin" />
                    : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  }
                </button>
              )}
            </div>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadClanDetail(myClan)}>
              <p className="font-display font-bold text-white text-sm">{myClan.name}</p>
              <p className="font-mono text-[10px] text-white/40">{myClan.memberCount} members · <WinRate wins={myClan.wins} losses={myClan.losses} /> win rate</p>
              {imageError && <p className="font-mono text-[9px] text-red-400/70 mt-0.5">{imageError}</p>}
            </div>
            <span className="font-mono text-[9px] text-neon-purple/60 uppercase tracking-wider">your clan</span>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-3 px-4 py-2 rounded-xl bg-neon-red/10 border border-neon-red/25 font-mono text-xs text-neon-red/80">
            {error}
          </div>
        )}

        {/* Leaderboard */}
        <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 mb-3">
          Clan Leaderboard — {clans.length} clans
        </h2>

        {loading && !clans.length ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-neon-purple/50 border-t-neon-purple rounded-full animate-spin" />
          </div>
        ) : clans.length === 0 ? (
          <div className="text-center py-12 text-white/20 font-mono text-sm">
            No clans yet. Be the first to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {clans.map((clan, idx) => (
              <motion.div
                key={clan.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
                onClick={() => loadClanDetail(clan)}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all active:scale-[0.98]"
                style={{
                  background: myClan?.id === clan.id ? 'rgba(155,0,255,0.06)' : 'rgba(255,255,255,0.02)',
                  borderColor: myClan?.id === clan.id ? 'rgba(155,0,255,0.25)' : 'rgba(255,255,255,0.06)',
                }}
              >
                <span className="font-mono text-[10px] text-white/20 w-4 text-right flex-shrink-0">{idx + 1}</span>
                <div
                  className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center font-display font-bold text-xs flex-shrink-0"
                  style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.25)', color: 'rgba(180,80,255,0.9)' }}
                >
                  {clan.imageUrl
                    ? <img src={clan.imageUrl} alt={clan.name} className="w-full h-full object-cover" />
                    : clan.tag}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-white text-sm truncate">{clan.name}</p>
                  <p className="font-mono text-[9px] text-white/30">{clan.memberCount} members</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-display font-bold text-sm"><WinRate wins={clan.wins} losses={clan.losses} /></p>
                  <p className="font-mono text-[9px] text-white/25">{clan.wins}W {clan.losses}L</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Clan detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/95 backdrop-blur-2xl overflow-hidden"
              style={{ boxShadow: '0 0 80px rgba(155,0,255,0.2)' }}
            >
              {/* Clan header */}
              <div className="px-5 pt-5 pb-4 border-b border-white/6">
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center font-display font-bold text-sm"
                      style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.35)', color: 'rgba(180,80,255,1)' }}
                    >
                      {selected.imageUrl
                        ? <img src={selected.imageUrl} alt={selected.name} className="w-full h-full object-cover" />
                        : selected.tag}
                    </div>
                    {amInSelected && myClanRole === 'owner' && (
                      <button
                        onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        disabled={imageUploading}
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                        style={{ background: 'rgba(138,43,226,0.95)', border: '1.5px solid rgba(255,255,255,0.2)', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                      >
                        {imageUploading
                          ? <div className="w-2.5 h-2.5 border border-white/60 border-t-white rounded-full animate-spin" />
                          : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        }
                      </button>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display font-bold text-white text-lg">{selected.name}</h3>
                    <p className="font-mono text-[10px] text-white/35">{selected.memberCount} members · {selected.wins}W {selected.losses}L</p>
                  </div>
                  {profile && !amInAnyClan && (
                    <button
                      onClick={() => handleJoin(selected.id)}
                      className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider transition-all active:scale-95"
                      style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.4)', color: 'rgba(180,80,255,0.9)' }}
                    >
                      Join
                    </button>
                  )}
                </div>
                {selected.description && (
                  <p className="font-mono text-[11px] text-white/40 mt-3 leading-relaxed">{selected.description}</p>
                )}
              </div>

              {/* Members header with mod logs button */}
              <div className="px-5 pt-3 pb-1 flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">Members · {members.length}</span>
                {amInSelected && canManageRoles && (
                  <button
                    onClick={loadModLogs}
                    className="font-mono text-[9px] uppercase tracking-wider text-neon-cyan/60 hover:text-neon-cyan transition-colors"
                  >
                    Mod Logs
                  </button>
                )}
              </div>

              {/* Members */}
              <div className="px-5 pb-4 max-h-64 overflow-y-auto space-y-1.5">
                {members.map(m => {
                  const isMe = m.playerId === profile?.id;
                  const canEditThisMember = amInSelected && canManageRoles && !isMe && m.role !== 'owner';
                  return (
                    <div
                      key={m.playerId}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/2 hover:bg-white/5 transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-full bg-gradient-to-br from-neon-pink to-neon-purple flex items-center justify-center text-xs font-bold text-white overflow-hidden cursor-pointer flex-shrink-0"
                        onClick={() => openProfile(m.playerId)}
                      >
                        {m.avatarUrl
                          ? <img src={m.avatarUrl} alt={m.username} className="w-full h-full object-cover rounded-full" />
                          : (m.avatar || m.username[0]?.toUpperCase())
                        }
                      </div>
                      <span
                        className="flex-1 font-mono text-xs text-white/70 cursor-pointer truncate"
                        onClick={() => openProfile(m.playerId)}
                      >
                        {m.username}
                      </span>
                      {(m.role === 'owner' || m.role === 'admin' || m.role === 'moderator') && (
                        <ClanRoleBadge role={m.role} />
                      )}
                      {canEditThisMember ? (
                        roleTarget === m.playerId ? (
                          <div className="flex items-center gap-1">
                            {(['admin', 'moderator', 'member'] as ClanRole[])
                              .filter(r => r !== m.role)
                              .map(r => (
                                <button
                                  key={r}
                                  disabled={roleLoading}
                                  onClick={() => handleSetRole(m.playerId, r)}
                                  className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-all hover:opacity-80 disabled:opacity-40"
                                  style={{
                                    color: r === 'admin' ? '#c084fc' : r === 'moderator' ? '#22d3ee' : 'rgba(255,255,255,0.4)',
                                    borderColor: r === 'admin' ? 'rgba(192,132,252,0.4)' : r === 'moderator' ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.15)',
                                    background: 'rgba(0,0,0,0.4)',
                                  }}
                                >
                                  {r}
                                </button>
                              ))
                            }
                            <button
                              onClick={() => setRoleTarget(null)}
                              className="font-mono text-[8px] text-white/30 hover:text-white/60 ml-1"
                            >✕</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRoleTarget(m.playerId)}
                            className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 ${RARITY_TAG[m.role] ?? RARITY_TAG.member}`}
                          >
                            {m.role}
                          </button>
                        )
                      ) : (
                        <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${RARITY_TAG[m.role] ?? RARITY_TAG.member}`}>
                          {m.role}
                        </span>
                      )}
                    </div>
                  );
                })}
                {members.length === 0 && (
                  <p className="text-center py-4 font-mono text-xs text-white/20">Loading members...</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mod logs modal */}
      <AnimatePresence>
        {showModLogs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            onClick={() => setShowModLogs(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-cyan-400/20 bg-black/95 backdrop-blur-2xl overflow-hidden"
              style={{ boxShadow: '0 0 60px rgba(0,229,255,0.1)' }}
            >
              <div className="px-5 pt-5 pb-3 border-b border-white/6 flex items-center justify-between">
                <h3 className="font-display font-bold text-white text-lg">Clan Mod Logs</h3>
                <button onClick={() => setShowModLogs(false)} className="text-white/30 hover:text-white/60">✕</button>
              </div>
              <div className="px-5 py-4 max-h-80 overflow-y-auto space-y-2">
                {modLogs.length === 0 ? (
                  <p className="text-center py-6 font-mono text-xs text-white/20">No moderation actions yet.</p>
                ) : modLogs.map(log => (
                  <div key={log.id} className="rounded-xl border border-white/8 bg-white/2 px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${log.action === 'clan_warning' ? 'bg-yellow-400/15 text-yellow-300' : 'bg-red-500/15 text-red-400'}`}>
                        {log.action === 'clan_warning' ? 'Warn' : 'Kick'}
                      </span>
                      <span className="font-mono text-[9px] text-white/25">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-white/70">
                      <span className="text-white/40">Target:</span> {log.targetName}
                    </p>
                    <p className="font-mono text-xs text-white/70">
                      <span className="text-white/40">By:</span> {log.modName}
                    </p>
                    {log.reason && (
                      <p className="font-mono text-xs text-white/40 mt-1">{log.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create clan modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-neon-purple/25 bg-black/95 backdrop-blur-2xl p-6"
              style={{ boxShadow: '0 0 60px rgba(155,0,255,0.2)' }}
            >
              <h3 className="font-display font-bold text-white text-xl mb-4">Create Clan</h3>
              {error && <p className="mb-3 text-xs text-neon-red/80 font-mono">{error}</p>}
              <div className="space-y-3">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">Clan Name</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-neon-purple/40 transition-colors"
                    placeholder="Brotherhood of Shadows"
                    maxLength={32}
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">Tag (max 5 chars)</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-neon-purple/40 transition-colors uppercase"
                    placeholder="BSHDW"
                    maxLength={5}
                    value={form.tag}
                    onChange={e => setForm(f => ({ ...f, tag: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-white/40 block mb-1">Description (optional)</label>
                  <textarea
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-neon-purple/40 transition-colors resize-none"
                    placeholder="Elite players only..."
                    maxLength={200}
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim() || !form.tag.trim()}
                  className="w-full py-3 rounded-xl font-display font-semibold text-sm uppercase tracking-wider transition-all active:scale-[0.98] disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, rgba(155,0,255,0.4), rgba(255,0,204,0.3))', border: '1px solid rgba(155,0,255,0.4)' }}
                >
                  Create Clan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
