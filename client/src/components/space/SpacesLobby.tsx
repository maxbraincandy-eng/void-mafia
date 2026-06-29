import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { SpaceMeta } from '@/hooks/useVirtualSpace';
import { emitWithAck } from '@/lib/socket';
import type { Friend, Res } from '@/types/index';

const SPACE_ICONS  = ['🌌','🎮','🎬','🎧','🔥','💎','🛸','🌃','⚡','🃏','👾','🎲'];
const SPACE_THEMES: { id: string; label: string; accent: string }[] = [
  { id: 'void',   label: 'Void',   accent: '#9b00ff' },
  { id: 'neon',   label: 'Neon',   accent: '#00e5ff' },
  { id: 'cyber',  label: 'Cyber',  accent: '#00ff88' },
  { id: 'sunset', label: 'Sunset', accent: '#ff6600' },
  { id: 'mono',   label: 'Mono',   accent: '#c0c0c0' },
];
const themeAccent = (theme: string) => SPACE_THEMES.find(t => t.id === theme)?.accent ?? '#9b00ff';

const ROOM_LAYOUTS: { id: string; label: string; desc: string; emoji: string; preview: string }[] = [
  { id: 'lounge', label: 'Lounge', desc: 'ნეონ კლუბი · დივნები', emoji: '🛋️', preview: 'linear-gradient(135deg, rgba(155,0,255,.35), rgba(0,229,255,.2))' },
  { id: 'home',   label: 'Home',   desc: 'ტელევიზორი · 4 სკამი · ცეკვა', emoji: '🏠', preview: 'linear-gradient(135deg, rgba(255,160,80,.35), rgba(255,90,60,.2))' },
];

// ── Lobby ───────────────────────────────────────────────────────────────

interface LobbyProps {
  listSpaces: () => Promise<SpaceMeta[]>;
  createSpace: (o: { name: string; icon: string; theme: string; maxPlayers: number; isPublic: boolean }) => Promise<SpaceMeta | null>;
  resolveSpace: (code: string) => Promise<{ ok: boolean; space?: SpaceMeta; error?: string }>;
  onEnter: (space: SpaceMeta) => void;
}

export function SpacesLobby({ listSpaces, createSpace, resolveSpace, onEnter }: LobbyProps) {
  const [spaces, setSpaces] = useState<SpaceMeta[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  const refresh = useCallback(() => { listSpaces().then(setSpaces); }, [listSpaces]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000); // live online counts
    return () => clearInterval(t);
  }, [refresh]);

  const joinByCode = async () => {
    if (!code.trim()) return;
    setCodeBusy(true); setCodeError(null);
    const res = await resolveSpace(code.trim());
    setCodeBusy(false);
    if (res.ok && res.space) onEnter(res.space);
    else setCodeError(res.error ?? 'ვერ მოიძებნა');
  };

  return (
    <div className="px-5 py-6 flex flex-col gap-5 max-w-md mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display font-bold text-white" style={{ fontSize: 18, letterSpacing: '0.04em' }}>Void Spaces</p>
          <p className="font-mono text-[11px] text-white/35 mt-0.5">აირჩიე სივრცე ან შექმენი შენი</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3.5 py-2 rounded-xl font-mono text-[12px] uppercase tracking-wider transition-all active:scale-95"
          style={{ background: 'rgba(155,0,255,.16)', border: '1px solid rgba(155,0,255,.45)', color: '#c084fc' }}
        >
          + Create
        </button>
      </div>

      {/* Join by code */}
      <div className="rounded-2xl p-3" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">კოდით შესვლა</p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') joinByCode(); }}
            placeholder="AX4P-92KT"
            maxLength={9}
            className="flex-1 font-mono text-sm text-white outline-none px-3 py-2 rounded-xl tracking-widest"
            style={{ background: 'rgba(255,255,255,.04)', border: `1px solid ${codeError ? 'rgba(255,45,85,.5)' : 'rgba(255,255,255,.1)'}` }}
          />
          <button
            onClick={joinByCode}
            disabled={!code.trim() || codeBusy}
            className="px-4 py-2 rounded-xl font-mono text-[12px] transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(0,229,255,.1)', border: '1px solid rgba(0,229,255,.3)', color: '#00e5ff' }}
          >
            {codeBusy ? '…' : '→'}
          </button>
        </div>
        {codeError && <p className="font-mono text-[10px] text-neon-red/80 mt-1.5">{codeError}</p>}
      </div>

      {/* Public spaces */}
      <div className="flex flex-col gap-2.5">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">საჯარო სივრცეები</p>
        {spaces === null && (
          <div className="flex justify-center py-8">
            <div style={{ width: 22, height: 22, border: '2px solid rgba(155,0,255,.3)', borderTopColor: '#9b00ff', borderRadius: '50%', animation: 'vs-spin .7s linear infinite' }} />
          </div>
        )}
        {spaces?.length === 0 && <p className="font-mono text-[11px] text-white/20 py-4 text-center">ცარიელია — შექმენი პირველი!</p>}
        {spaces?.map(sp => {
          const accent = themeAccent(sp.theme);
          const full = sp.online >= sp.maxPlayers;
          return (
            <button
              key={sp.id}
              onClick={() => !full && onEnter(sp)}
              disabled={full}
              className="flex items-center gap-3 p-3 rounded-2xl transition-all active:scale-[0.98] text-left disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accent}14, rgba(255,255,255,.02))`, border: `1px solid ${accent}3a` }}
            >
              <div className="flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 44, borderRadius: 14, background: `${accent}1f`, border: `1px solid ${accent}40`, fontSize: 22 }}>
                {sp.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-white truncate">{sp.name}</p>
                <p className="font-mono text-[10px] text-white/35 truncate">
                  {sp.persistent ? 'Official' : sp.ownerName} · {sp.online}/{sp.maxPlayers}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: sp.online > 0 ? '#00ff88' : 'rgba(255,255,255,.2)', boxShadow: sp.online > 0 ? '0 0 6px #00ff88' : 'none' }} />
                <span className="font-mono text-[12px]" style={{ color: full ? 'rgba(255,45,85,.7)' : accent }}>{full ? 'სავსე' : 'Join'}</span>
              </div>
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateSpaceModal createSpace={createSpace} onClose={() => setShowCreate(false)} onCreated={sp => { setShowCreate(false); onEnter(sp); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────

function CreateSpaceModal({ createSpace, onClose, onCreated }: {
  createSpace: LobbyProps['createSpace'];
  onClose: () => void;
  onCreated: (sp: SpaceMeta) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(SPACE_ICONS[0]);
  const [theme, setTheme] = useState('void');
  const [layout, setLayout] = useState('lounge');
  const [maxPlayers, setMaxPlayers] = useState(12);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const accent = themeAccent(theme);

  const create = async () => {
    setBusy(true);
    const sp = await createSpace({ name: name.trim() || 'Void Space', icon, theme, layout, maxPlayers, isPublic });
    setBusy(false);
    if (sp) onCreated(sp);
  };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{
          width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto',
          background: 'rgba(8,3,22,.99)', backdropFilter: 'blur(28px)',
          border: `1.5px solid ${accent}55`, borderRadius: 22,
          padding: '20px',
        }}
      >
        <p className="font-display font-bold text-white mb-4" style={{ fontSize: 16 }}>ახალი Space</p>

        {/* Preview */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl" style={{ background: `${accent}12`, border: `1px solid ${accent}33` }}>
          <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: 14, background: `${accent}22`, border: `1px solid ${accent}44`, fontSize: 24 }}>{icon}</div>
          <div className="min-w-0">
            <p className="font-mono text-sm text-white truncate">{name.trim() || 'Void Space'}</p>
            <p className="font-mono text-[10px] text-white/35">{isPublic ? 'საჯარო' : 'პირადი'} · max {maxPlayers}</p>
          </div>
        </div>

        <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">სახელი</label>
        <input value={name} onChange={e => setName(e.target.value)} maxLength={28} placeholder="My Space"
          className="w-full font-mono text-sm text-white outline-none px-3 py-2.5 rounded-xl mt-1.5 mb-4"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }} />

        <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">აიქონი</label>
        <div className="flex flex-wrap gap-2 mt-1.5 mb-4">
          {SPACE_ICONS.map(ic => (
            <button key={ic} onClick={() => setIcon(ic)}
              className="flex items-center justify-center transition-all active:scale-90"
              style={{ width: 38, height: 38, borderRadius: 12, fontSize: 19, background: icon === ic ? `${accent}25` : 'rgba(255,255,255,.04)', border: `1px solid ${icon === ic ? accent : 'rgba(255,255,255,.08)'}` }}>
              {ic}
            </button>
          ))}
        </div>

        <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">თემა</label>
        <div className="flex gap-2 mt-1.5 mb-4">
          {SPACE_THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              className="flex-1 py-2 rounded-xl font-mono text-[11px] transition-all active:scale-95"
              style={{ background: theme === t.id ? `${t.accent}22` : 'rgba(255,255,255,.03)', border: `1px solid ${theme === t.id ? t.accent : 'rgba(255,255,255,.08)'}`, color: theme === t.id ? t.accent : 'rgba(255,255,255,.4)' }}>
              {t.label}
            </button>
          ))}
        </div>

        <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">ოთახი</label>
        <div className="flex gap-2 mt-1.5 mb-4">
          {ROOM_LAYOUTS.map(l => (
            <button key={l.id} onClick={() => setLayout(l.id)}
              className="flex-1 rounded-xl transition-all active:scale-95 overflow-hidden text-left"
              style={{ background: layout === l.id ? `${accent}1f` : 'rgba(255,255,255,.03)', border: `1px solid ${layout === l.id ? accent : 'rgba(255,255,255,.08)'}` }}>
              <div style={{ height: 46, background: l.preview, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{l.emoji}</div>
              <div style={{ padding: '5px 8px' }}>
                <p className="font-mono text-[11px]" style={{ color: layout === l.id ? accent : 'rgba(255,255,255,.6)' }}>{l.label}</p>
                <p className="font-mono text-[8px] text-white/30">{l.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">მაქს. მოთამაშე · {maxPlayers}</label>
        <input type="range" min={2} max={50} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
          className="w-full mt-2 mb-4" style={{ accentColor: accent }} />

        <div className="flex gap-2 mb-5">
          {[{ v: true, label: '🌐 საჯარო' }, { v: false, label: '🔒 პირადი' }].map(o => (
            <button key={String(o.v)} onClick={() => setIsPublic(o.v)}
              className="flex-1 py-2.5 rounded-xl font-mono text-[12px] transition-all active:scale-95"
              style={{ background: isPublic === o.v ? `${accent}22` : 'rgba(255,255,255,.03)', border: `1px solid ${isPublic === o.v ? accent : 'rgba(255,255,255,.08)'}`, color: isPublic === o.v ? accent : 'rgba(255,255,255,.4)' }}>
              {o.label}
            </button>
          ))}
        </div>

        <button onClick={create} disabled={busy}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${accent}35, ${accent}18)`, border: `1.5px solid ${accent}`, color: accent, letterSpacing: '0.12em' }}>
          {busy ? '...' : 'შექმნა →'}
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Invite panel ────────────────────────────────────────────────────────

export function SpaceInvitePanel({ space, inviteToSpace, onClose }: {
  space: SpaceMeta;
  inviteToSpace: (profileId: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [invited, setInvited] = useState<Record<string, 'sent' | 'failed'>>({});
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const link = `voidmafia.one/lounge/${space.code}`;

  useEffect(() => {
    emitWithAck<void, Res<Friend[]>>('friend:list').then(res => {
      setFriends(res.ok ? (res.data ?? []) : []);
    }).catch(() => setFriends([]));
  }, []);

  const copy = (text: string, which: 'code' | 'link') => {
    navigator.clipboard.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };

  const doInvite = async (f: Friend) => {
    const res = await inviteToSpace(f.profileId);
    setInvited(prev => ({ ...prev, [f.profileId]: res.ok ? 'sent' : 'failed' }));
  };

  const online = (friends ?? []).filter(f => f.isOnline);
  const offline = (friends ?? []).filter(f => !f.isOnline);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        style={{
          width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto',
          background: 'rgba(8,3,22,.99)', backdropFilter: 'blur(28px)',
          border: '1.5px solid rgba(155,0,255,.4)', borderRadius: 22,
          padding: '20px',
        }}
      >
        <p className="font-display font-bold text-white mb-1" style={{ fontSize: 16 }}>მოწვევა · {space.icon} {space.name}</p>
        <p className="font-mono text-[11px] text-white/35 mb-4">გააზიარე კოდი ან მოიწვიე მეგობარი</p>

        {/* Code + link */}
        <div className="flex flex-col gap-2 mb-5">
          <button onClick={() => copy(space.code, 'code')} className="flex items-center justify-between p-3 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'rgba(0,229,255,.08)', border: '1px solid rgba(0,229,255,.25)' }}>
            <span className="font-mono text-lg tracking-widest" style={{ color: '#00e5ff' }}>{space.code}</span>
            <span className="font-mono text-[11px] text-white/40">{copied === 'code' ? '✓ copied' : '⧉ code'}</span>
          </button>
          <button onClick={() => copy(link, 'link')} className="flex items-center justify-between p-3 rounded-xl transition-all active:scale-[0.98]"
            style={{ background: 'rgba(155,0,255,.08)', border: '1px solid rgba(155,0,255,.25)' }}>
            <span className="font-mono text-[12px] truncate" style={{ color: '#c084fc' }}>{link}</span>
            <span className="font-mono text-[11px] text-white/40 flex-shrink-0 ml-2">{copied === 'link' ? '✓ copied' : '⧉ link'}</span>
          </button>
        </div>

        {/* Friends */}
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-2">მეგობრები</p>
        {friends === null && <p className="font-mono text-[11px] text-white/20 py-3 text-center">იტვირთება…</p>}
        {friends?.length === 0 && <p className="font-mono text-[11px] text-white/20 py-3 text-center">მეგობრები არ გყავს</p>}
        <div className="flex flex-col gap-1.5">
          {[...online, ...offline].map(f => {
            const st = invited[f.profileId];
            return (
              <div key={f.profileId} className="flex items-center gap-2.5 p-2 rounded-xl" style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
                <div className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(155,0,255,.15)', border: '1px solid rgba(155,0,255,.25)', fontSize: 14 }}>
                  {f.avatarUrl ? <img src={f.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : f.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] text-white/85 truncate">{f.username}</p>
                  <p className="font-mono text-[9px]" style={{ color: f.isOnline ? '#00ff88' : 'rgba(255,255,255,.25)' }}>{f.isOnline ? 'online' : 'offline'}</p>
                </div>
                <button
                  onClick={() => doInvite(f)}
                  disabled={!f.isOnline || st === 'sent'}
                  className="px-3 py-1.5 rounded-lg font-mono text-[11px] transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
                  style={{ background: st === 'sent' ? 'rgba(0,255,136,.12)' : 'rgba(155,0,255,.14)', border: `1px solid ${st === 'sent' ? 'rgba(0,255,136,.3)' : 'rgba(155,0,255,.35)'}`, color: st === 'sent' ? '#00ff88' : '#c084fc' }}>
                  {st === 'sent' ? '✓ sent' : st === 'failed' ? 'retry' : 'invite'}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
