import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { emitWithAck } from '@/lib/socket';
import { ClanPublic, ClanMember } from '@/types/index';
import { PoweredBy } from '@/components/ui/PoweredBy';

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

const RARITY_TAG: Record<string, string> = {
  owner:   'bg-neon-pink/20 text-neon-pink border-neon-pink/30',
  officer: 'bg-neon-purple/20 text-purple-300 border-purple-500/30',
  member:  'bg-white/5 text-white/50 border-white/10',
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
  const [clans, setClans]           = useState<ClanPublic[]>([]);
  const [myClan, setMyClan]         = useState<ClanPublic | null>(null);
  const [members, setMembers]       = useState<ClanMember[]>([]);
  const [selected, setSelected]     = useState<ClanPublic | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState({ name: '', tag: '', description: '' });

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
    loadAll();
  }

  const amInSelected = myClan?.id === selected?.id;
  const amInAnyClan  = !!myClan;

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

        {/* My clan banner */}
        {myClan && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-2xl border border-neon-purple/25 bg-neon-purple/6 px-4 py-3 flex items-center gap-3 cursor-pointer"
            onClick={() => loadClanDetail(myClan)}
          >
            <div className="w-9 h-9 rounded-xl bg-neon-purple/20 border border-neon-purple/30 flex items-center justify-center font-display font-bold text-neon-purple text-sm">
              {myClan.tag}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-white text-sm">{myClan.name}</p>
              <p className="font-mono text-[10px] text-white/40">{myClan.memberCount} members · <WinRate wins={myClan.wins} losses={myClan.losses} /> win rate</p>
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
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs flex-shrink-0"
                  style={{ background: 'rgba(155,0,255,0.15)', border: '1px solid rgba(155,0,255,0.25)', color: 'rgba(180,80,255,0.9)' }}
                >
                  {clan.tag}
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
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm px-4 pb-6"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/95 backdrop-blur-2xl overflow-hidden"
              style={{ boxShadow: '0 0 80px rgba(155,0,255,0.2)' }}
            >
              {/* Clan header */}
              <div className="px-5 pt-5 pb-4 border-b border-white/6">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-bold text-sm"
                    style={{ background: 'rgba(155,0,255,0.2)', border: '1px solid rgba(155,0,255,0.35)', color: 'rgba(180,80,255,1)' }}
                  >
                    {selected.tag}
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

              {/* Members */}
              <div className="px-5 py-4 max-h-64 overflow-y-auto space-y-1.5">
                {members.map(m => (
                  <div key={m.playerId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/2">
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/60">
                      {m.username[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 font-mono text-xs text-white/70">{m.username}</span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${RARITY_TAG[m.role] ?? RARITY_TAG.member}`}>
                      {m.role}
                    </span>
                  </div>
                ))}
                {members.length === 0 && (
                  <p className="text-center py-4 font-mono text-xs text-white/20">Loading members...</p>
                )}
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
