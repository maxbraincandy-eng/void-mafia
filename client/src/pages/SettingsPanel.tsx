import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { socket, emitWithAck } from '@/lib/socket';
import { useT } from '@/store/langStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import type { Res } from '@/types/index';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Reusable primitives ───────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[12px] font-mono uppercase tracking-[0.25em] text-neon-purple/40 mb-2 px-1 mt-5 first:mt-0">
      {label}
    </p>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 px-3 rounded-xl bg-white/[0.025] border border-white/[0.05] mb-1.5">
      <div className="min-w-0">
        <p className="text-sm text-white/80 font-mono leading-tight">{label}</p>
        {sub && <p className="text-[12px] text-white/30 font-mono mt-0.5 leading-tight">{sub}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-all duration-300 flex-shrink-0"
      style={{
        background: value
          ? 'linear-gradient(90deg, #9b00ff, #00e5ff)'
          : 'rgba(255,255,255,0.08)',
        border: value ? '1px solid rgba(155,0,255,0.5)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: value ? '0 0 10px rgba(155,0,255,0.3)' : 'none',
      }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white shadow-md transition-all duration-300"
        style={{
          width: '20px', height: '20px',
          left: value ? 'calc(100% - 22px)' : '2px',
        }}
      />
    </button>
  );
}

function Slider({ value, onChange, min = 0, max = 100 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-28 accent-neon-purple cursor-pointer"
      style={{ accentColor: '#9b00ff' }}
    />
  );
}

function SelectChip<T extends string>({ options, value, onChange }: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="px-2 py-1 rounded-lg text-[12px] font-mono transition-all"
          style={o.value === value ? {
            background: 'rgba(155,0,255,0.25)',
            border: '1px solid rgba(155,0,255,0.5)',
            color: '#c084fc',
          } : {
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Change Name sub-form ──────────────────────────────────────────────

function ChangeNameSection() {
  const { profile, changeName } = useAuthStore();
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);
  const t = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true); setErr(''); setMsg('');
    const res = await changeName(newName.trim());
    setLoading(false);
    if (res.ok) {
      setMsg('Name updated!');
      setNewName('');
      setTimeout(() => setMsg(''), 3000);
    } else {
      setErr(res.error ?? 'Name change failed.');
    }
  };

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="w-full py-2.5 rounded-xl border border-white/8 text-white/40 font-mono text-xs hover:text-white/60 hover:border-white/15 transition-all mb-1.5"
      >
        {t.profile.changeName} {profile?.username ? `(${profile.username})` : ''}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-xl border border-white/8 bg-white/[0.02] mb-1.5">
      <p className="text-[12px] font-mono text-white/30 uppercase tracking-widest mb-3">{t.profile.changeName}</p>
      <input
        type="text"
        placeholder="New name…"
        value={newName}
        onChange={e => setNewName(e.target.value)}
        maxLength={20}
        className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 font-mono text-xs focus:outline-none focus:border-neon-purple/50 transition-all"
      />
      {err && <p className="text-neon-red text-[12px] font-mono">{err}</p>}
      {msg && <p className="text-neon-green text-[12px] font-mono">{msg}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => { setShow(false); setErr(''); setMsg(''); setNewName(''); }}
          className="flex-1 py-2 rounded-xl border border-white/10 text-white/30 font-mono text-xs hover:text-white/50 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!newName.trim() || loading}
          className="flex-1 py-2 rounded-xl bg-neon-purple/20 border border-neon-purple/40 text-neon-purple font-mono text-xs disabled:opacity-40 hover:bg-neon-purple/30 transition-all"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Connected Accounts sub-section ───────────────────────────────────

interface LinkedProvider { provider: string; email: string | null; displayName: string | null; }

function ConnectedAccountsSection() {
  const { uid } = useAuthStore();
  const [providers, setProviders] = useState<LinkedProvider[]>([]);
  const [msg, setMsg]   = useState('');
  const [err, setErr]   = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_linked')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      setMsg(`${params.get('oauth_linked')} account connected!`);
      setTimeout(() => setMsg(''), 4000);
    }
    if (params.get('oauth_error')) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      const m = params.get('oauth_error');
      setErr(m === '1' ? 'Connection failed. Please try again.' : decodeURIComponent(m ?? ''));
      setTimeout(() => setErr(''), 5000);
    }
  }, []);

  useEffect(() => {
    if (!uid) return;
    fetch(`/api/auth/linked?uid=${encodeURIComponent(uid)}`)
      .then(r => r.json())
      .then(data => { if (data.ok) setProviders(data.providers); })
      .catch(() => {});
  }, [uid]);

  const linkOAuth = async (provider: 'google' | 'facebook' | 'apple') => {
    if (!uid) return;
    try {
      await fetch('/api/auth/init-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ uid }),
      });
      window.location.href = `/api/auth/${provider}?link=1`;
    } catch { setErr('Failed to start linking. Please try again.'); }
  };

  const unlink = async (provider: string) => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/auth/unlink/${provider}?uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const data = await res.json();
      if (data.ok) setProviders(prev => prev.filter(p => p.provider !== provider));
      else setErr('Unlink failed.');
    } catch { setErr('Unlink failed.'); }
  };

  const ACCOUNTS = [
    {
      id: 'google' as const,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
    },
    {
      id: 'facebook' as const,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 fill-current text-[#1877F2]" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
    },
    {
      id: 'apple' as const,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 fill-current text-white/80" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="mb-1.5 p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]">
      <p className="text-[12px] font-mono uppercase tracking-[0.2em] text-white/25 mb-2">Connected Accounts</p>
      {msg && <p className="text-neon-green text-xs font-mono mb-2">{msg}</p>}
      {err && <p className="text-neon-red   text-xs font-mono mb-2">{err}</p>}
      {ACCOUNTS.map((acc, i) => {
        const linked = providers.find(p => p.provider === acc.id);
        return (
          <div key={acc.id} className={`flex items-center justify-between py-2 ${i < ACCOUNTS.length - 1 ? 'border-b border-white/5' : ''}`}>
            <div className="flex items-center gap-3">
              {acc.icon}
              <div>
                <p className="text-white/60 font-mono text-xs capitalize">{acc.id}</p>
                {linked && <p className="text-white/25 font-mono text-[11px]">{linked.email ?? linked.displayName ?? 'Connected'}</p>}
              </div>
            </div>
            {linked ? (
              <button onClick={() => unlink(acc.id)} className="text-[12px] font-mono text-neon-red/50 hover:text-neon-red/80 transition-colors uppercase tracking-wider">Disconnect</button>
            ) : (
              <button onClick={() => linkOAuth(acc.id)} className="text-[12px] font-mono text-neon-cyan/50 hover:text-neon-cyan/80 transition-colors uppercase tracking-wider">Connect</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Change Password sub-form ──────────────────────────────────────────

function ChangePasswordSection() {
  const { uid } = useAuthStore();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [err, setErr]             = useState('');
  const [show, setShow]           = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setErr('Passwords do not match.'); return; }
    if (newPw.length < 6) { setErr('New password must be at least 6 characters.'); return; }
    setLoading(true); setErr(''); setMsg('');
    try {
      const res = await new Promise<Res<void>>((resolve) => {
        (socket as any).emit('player:change_password', { uid, currentPassword: currentPw, newPassword: newPw }, resolve);
      });
      if (!res.ok) throw new Error((res as any).error);
      setMsg('Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (e: any) {
      setErr(e.message ?? 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="w-full py-2.5 rounded-xl border border-white/8 text-white/40 font-mono text-xs hover:text-white/60 hover:border-white/15 transition-all"
      >
        Change Password
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-3 rounded-xl border border-white/8 bg-white/[0.02]">
      <p className="text-[12px] font-mono text-white/30 uppercase tracking-widest mb-3">Change Password</p>
      {['Current Password', 'New Password', 'Confirm New Password'].map((label, i) => {
        const val = i === 0 ? currentPw : i === 1 ? newPw : confirmPw;
        const setter = i === 0 ? setCurrentPw : i === 1 ? setNewPw : setConfirmPw;
        return (
          <input
            key={label}
            type="password"
            placeholder={label}
            value={val}
            onChange={e => setter(e.target.value)}
            className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 font-mono text-xs focus:outline-none focus:border-neon-purple/50 transition-all"
          />
        );
      })}
      {err && <p className="text-neon-red text-[12px] font-mono">{err}</p>}
      {msg && <p className="text-neon-green text-[12px] font-mono">{msg}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => { setShow(false); setErr(''); setMsg(''); }}
          className="flex-1 py-2 rounded-xl border border-white/10 text-white/30 font-mono text-xs hover:text-white/50 transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!currentPw || !newPw || !confirmPw || loading}
          className="flex-1 py-2 rounded-xl bg-neon-purple/20 border border-neon-purple/40 text-neon-purple font-mono text-xs disabled:opacity-40 hover:bg-neon-purple/30 transition-all"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

// ── Main panel ────────────────────────────────────────────────────────

export function SettingsPanel({ open, onClose }: Props) {
  const s = useSettingsStore();
  const { profile } = useAuthStore();
  const hasEmail = !!profile;
  const push = usePushNotifications();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 z-[90] rounded-t-3xl border-t border-white/10 flex flex-col"
            style={{ background: 'rgba(6,3,20,0.99)', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
              <div>
                <h3 className="font-display font-bold text-base text-white tracking-wide">Settings</h3>
                <p className="text-[12px] font-mono text-white/25 mt-0.5">Audio, game & privacy</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-4 pb-8 pt-2">

              {/* ── Audio ─────────────────────────────────────────────── */}
              <SectionHeader label="🔊 Audio" />
              <SettingRow label="Sound Effects">
                <Toggle value={s.sfxEnabled} onChange={v => s.update({ sfxEnabled: v })} />
              </SettingRow>
              <SettingRow label="Background Music">
                <Toggle value={s.musicEnabled} onChange={v => s.update({ musicEnabled: v })} />
              </SettingRow>
              <SettingRow label="Notification Sounds">
                <Toggle value={s.notificationSounds} onChange={v => s.update({ notificationSounds: v })} />
              </SettingRow>
              <SettingRow label="Volume" sub={`${s.sfxVolume}%`}>
                <Slider value={s.sfxVolume} onChange={v => s.update({ sfxVolume: v })} />
              </SettingRow>

              {/* ── Game ──────────────────────────────────────────────── */}
              <SectionHeader label="🎮 Game" />
              <SettingRow label="Auto-Ready in Lobby" sub="Mark ready automatically when joining">
                <Toggle value={s.autoReady} onChange={v => s.update({ autoReady: v })} />
              </SettingRow>
              <SettingRow label="Role Reveal Animation" sub="Show animated role reveal at night">
                <Toggle value={s.showRoleAnimation} onChange={v => s.update({ showRoleAnimation: v })} />
              </SettingRow>
              <SettingRow label="Timer Style">
                <SelectChip
                  options={[{ label: 'Bar', value: 'bar' }, { label: 'Countdown', value: 'countdown' }]}
                  value={s.timerStyle}
                  onChange={v => s.update({ timerStyle: v })}
                />
              </SettingRow>
              <SettingRow label="Chat Timestamps" sub="Show time next to messages">
                <Toggle value={s.showChatTimestamps} onChange={v => s.update({ showChatTimestamps: v })} />
              </SettingRow>

              {/* Last Will */}
              <div className="mb-1.5 p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]">
                <p className="text-sm text-white/80 font-mono mb-1">Default Last Will</p>
                <p className="text-[12px] text-white/30 font-mono mb-2">Shown to others when you're eliminated</p>
                <textarea
                  value={s.defaultLastWill}
                  onChange={e => s.update({ defaultLastWill: e.target.value })}
                  maxLength={200}
                  rows={3}
                  placeholder="I was [role]. The mafia is..."
                  className="w-full bg-void-50/80 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 font-mono text-xs focus:outline-none focus:border-neon-purple/40 transition-all resize-none"
                />
                <p className="text-right text-[12px] font-mono text-white/20 mt-1">{s.defaultLastWill.length}/200</p>
              </div>

              {/* ── Privacy ───────────────────────────────────────────── */}
              <SectionHeader label="🔒 Privacy" />
              <SettingRow label="Friend Requests" sub="Who can send you friend requests">
                <SelectChip
                  options={[{ label: 'All', value: 'everyone' }, { label: 'None', value: 'nobody' }]}
                  value={s.friendRequestsFrom}
                  onChange={v => s.update({ friendRequestsFrom: v })}
                />
              </SettingRow>
              <SettingRow label="Direct Messages" sub="Who can DM you">
                <SelectChip
                  options={[
                    { label: 'All', value: 'everyone' },
                    { label: 'Friends', value: 'friends' },
                    { label: 'None', value: 'nobody' },
                  ]}
                  value={s.dmsFrom}
                  onChange={v => s.update({ dmsFrom: v })}
                />
              </SettingRow>
              <SettingRow label="Online Status" sub="Show when you're online">
                <Toggle value={s.showOnlineStatus} onChange={v => s.update({ showOnlineStatus: v })} />
              </SettingRow>

              {/* ── Notifications ─────────────────────────────────────── */}
              <SectionHeader label="🔔 Notifications" />
              {push.isSupported && (
                <SettingRow
                  label="Push Notifications"
                  sub={
                    push.permission === 'denied'
                      ? 'Blocked in browser settings'
                      : push.isSubscribed
                        ? 'DMs & game alerts when app is closed'
                        : 'Enable to get DMs & game alerts'
                  }
                >
                  <Toggle
                    value={push.isSubscribed}
                    onChange={v => (v ? push.subscribe() : push.unsubscribe())}
                  />
                </SettingRow>
              )}
              <SettingRow label="Game Invites">
                <Toggle value={s.notifyGameInvites} onChange={v => s.update({ notifyGameInvites: v })} />
              </SettingRow>
              <SettingRow label="Friend Requests">
                <Toggle value={s.notifyFriendRequests} onChange={v => s.update({ notifyFriendRequests: v })} />
              </SettingRow>
              <SettingRow label="Direct Messages">
                <Toggle value={s.notifyDMs} onChange={v => s.update({ notifyDMs: v })} />
              </SettingRow>

              {/* ── Accessibility ─────────────────────────────────────── */}
              <SectionHeader label="♿ Accessibility" />
              <SettingRow label="Reduce Animations" sub="Disables transitions & pulse effects">
                <Toggle value={s.reduceAnimations} onChange={v => s.update({ reduceAnimations: v })} />
              </SettingRow>
              <SettingRow label="Larger Text" sub="Increases chat & UI font size">
                <Toggle value={s.largeText} onChange={v => s.update({ largeText: v })} />
              </SettingRow>

              {/* ── Account ───────────────────────────────────────────── */}
              <SectionHeader label="Account" />
              <ChangeNameSection />
              {hasEmail && <ChangePasswordSection />}
              <ConnectedAccountsSection />

              {/* Reset all */}
              <button
                onClick={() => { if (confirm('Reset all settings to defaults?')) s.reset(); }}
                className="w-full mt-3 py-2.5 rounded-xl border border-white/6 text-white/20 font-mono text-xs hover:text-white/40 hover:border-white/12 transition-all"
              >
                Reset to defaults
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
