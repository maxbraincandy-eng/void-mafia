import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useT, useLangStore } from '@/store/langStore';
import type { Lang } from '@/i18n/translations';
import { useSettingsStore } from '@/store/settingsStore';
import { onSettingsChange } from '@/lib/audioEngine';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { ProfileEditPanel } from '@/components/ui/ProfileEditPanel';
import { CoinHistoryModal } from '@/components/ui/CoinHistoryModal';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { AchievementsModal } from '@/components/ui/AchievementsModal';
import { SeasonPassModal } from '@/components/ui/SeasonPassModal';
import { ReferralModal } from '@/components/ui/ReferralModal';
import { VoidStatsIcon } from '@/components/ui/VoidStatsIcon';
import { VoidClansIcon } from '@/components/ui/VoidClansIcon';
import { CLIENT_VERSION } from '@/version';

interface MenuItem {
  icon: ReactNode;
  label: string;
  description: string;
  iconBg: string;
  iconGlow: string;
  badge?: { text: string; color: string };
  comingSoon?: boolean;
  onClick?: () => void;
}

interface Section {
  title: string;
  items: MenuItem[];
}

function SectionLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-4 pb-1">
      <p className="text-[11px] font-mono font-bold uppercase tracking-[0.28em] text-white/18">
        {title}
      </p>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function MenuRow({ item, index }: { item: MenuItem; index: number }) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 + index * 0.035, duration: 0.2, ease: 'easeOut' }}
      onClick={item.comingSoon ? undefined : item.onClick}
      disabled={item.comingSoon}
      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-2xl transition-all duration-150 group disabled:cursor-default active:scale-[0.98]"
      style={{ background: 'transparent' }}
      onMouseEnter={e => {
        if (!item.comingSoon)
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg transition-transform duration-150 group-active:scale-95"
        style={{
          background: item.comingSoon ? 'rgba(255,255,255,0.04)' : item.iconBg,
          boxShadow: item.comingSoon ? 'none' : `0 0 14px ${item.iconGlow}`,
        }}
      >
        <span className={item.comingSoon ? 'opacity-25 grayscale' : ''}>{item.icon}</span>
      </div>

      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-display font-bold tracking-wide leading-none ${item.comingSoon ? 'text-white/20' : 'text-white/85'}`}>
            {item.label}
          </p>
          {item.badge && !item.comingSoon && (
            <span
              className="text-[11px] font-mono font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full leading-none"
              style={{ background: item.badge.color + '22', color: item.badge.color, border: `1px solid ${item.badge.color}44` }}
            >
              {item.badge.text}
            </span>
          )}
        </div>
        <p className={`text-[12px] font-mono mt-0.5 leading-tight ${item.comingSoon ? 'text-white/12' : 'text-white/28'}`}>
          {item.description}
        </p>
      </div>

      {item.comingSoon ? (
        <span
          className="text-[12px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          soon
        </span>
      ) : (
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-white/12 group-hover:text-white/35 transition-colors flex-shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </motion.button>
  );
}

function AudioToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-[22px] rounded-full transition-all duration-300 flex-shrink-0"
      style={{
        background: value ? 'var(--vm-toggle-on)' : 'rgba(255,255,255,0.08)',
        border: value ? '1px solid var(--vm-toggle-on-border)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: value ? 'var(--vm-toggle-on-shadow)' : 'none',
      }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white shadow transition-all duration-300"
        style={{ width: '18px', height: '18px', left: value ? 'calc(100% - 20px)' : '2px' }}
      />
    </button>
  );
}

function LogOutButton({ onClose }: { onClose: () => void }) {
  const logout = useAuthStore(s => s.logout);
  return (
    <button
      onClick={() => { logout(); onClose(); }}
      className="w-full py-2.5 rounded-xl border border-neon-red/25 text-neon-red/70 font-mono text-xs tracking-widest uppercase hover:bg-neon-red/10 hover:text-neon-red hover:border-neon-red/40 transition-all"
    >
      Log Out
    </button>
  );
}

interface MorePanelProps {
  isOwner?: boolean;
  isMod?: boolean;
  onEconomyClick?: () => void;
  onShopClick?: () => void;
  onReplaysClick?: () => void;
  onClansClick?: () => void;
  onLeaderboardClick?: () => void;
  onMessagesClick?: () => void;
  onModClick?: () => void;
}

export function MorePanel({ isOwner = false, isMod = false, onEconomyClick, onShopClick, onReplaysClick, onClansClick, onLeaderboardClick, onMessagesClick, onModClick }: MorePanelProps) {
  const { morePanelOpen, closeMoreMenu } = useSocialStore();
  const profile = useAuthStore(s => s.profile);
  const profileId = profile?.id ?? null;
  const t = useT();
  const mp = t.morePanel;
  const sfxEnabled = useSettingsStore(s => s.sfxEnabled);
  const musicEnabled = useSettingsStore(s => s.musicEnabled);
  const themeMode = useSettingsStore(s => s.themeMode) ?? 'void-neon';
  const updateSettings = useSettingsStore(s => s.update);
  const lang = useLangStore(s => s.lang);
  const setLang = useLangStore(s => s.setLang);

  const toggleSfx = (v: boolean) => { updateSettings({ sfxEnabled: v }); onSettingsChange(); };
  const toggleMusic = (v: boolean) => { updateSettings({ musicEnabled: v }); onSettingsChange(); };

  const [showSettings, setShowSettings] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showCoinHistory, setShowCoinHistory] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSeasonPass, setShowSeasonPass] = useState(false);
  const [showReferral, setShowReferral] = useState(false);

  const open = (fn: () => void) => () => { closeMoreMenu(); setTimeout(fn, 220); };

  const sections: Section[] = [
    {
      title: 'ნავიგაცია',
      items: [
        {
          icon: '✏️',
          label: 'პროფილის რედაქტირება',
          description: 'სახელი და სურათი',
          iconBg: 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,229,255,0.1))',
          iconGlow: 'rgba(155,0,255,0.2)',
          onClick: open(() => setShowProfileEdit(true)),
        },
        {
          icon: <VoidClansIcon size={22} color="#ef4444" />,
          label: 'კლანები',
          description: 'კლანური ბრძოლები და რეიტინგი',
          iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(220,38,38,0.1))',
          iconGlow: 'rgba(239,68,68,0.2)',
          onClick: open(() => onClansClick?.()),
        },
        {
          icon: <VoidStatsIcon size={22} color="#facc15" />,
          label: 'ტოპი',
          description: 'სეზონის საუკეთესო მოთამაშეები',
          iconBg: 'linear-gradient(135deg, rgba(250,204,21,0.28), rgba(245,158,11,0.1))',
          iconGlow: 'rgba(250,204,21,0.2)',
          onClick: open(() => onLeaderboardClick?.()),
        },
        {
          icon: '💬',
          label: 'შეტყობინებები',
          description: 'პირდაპირი შეტყობინებები',
          iconBg: 'linear-gradient(135deg, rgba(0,229,255,0.22), rgba(0,180,200,0.08))',
          iconGlow: 'rgba(0,229,255,0.18)',
          onClick: open(() => onMessagesClick?.()),
        },
      ],
    },
    {
      title: mp.sections.discover,
      items: [
        {
          icon: '❓',
          label: mp.howToPlay.label,
          description: mp.howToPlay.desc,
          iconBg: 'linear-gradient(135deg, rgba(0,229,255,0.25), rgba(0,229,255,0.08))',
          iconGlow: 'rgba(0,229,255,0.18)',
          onClick: open(() => setShowHowToPlay(true)),
        },
        {
          icon: '📺',
          label: mp.gameReplays.label,
          description: mp.gameReplays.desc,
          iconBg: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(59,130,246,0.12))',
          iconGlow: 'rgba(99,102,241,0.2)',
          badge: { text: 'NEW', color: '#818cf8' },
          onClick: open(() => onReplaysClick?.()),
        },
      ],
    },
    {
      title: mp.sections.rewards,
      items: [
        {
          icon: '🏆',
          label: mp.seasonLeaderboard.label,
          description: mp.seasonLeaderboard.desc,
          iconBg: 'linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.12))',
          iconGlow: 'rgba(236,72,153,0.2)',
          onClick: open(() => setShowSeasonPass(true)),
        },
        {
          icon: '⭐',
          label: mp.achievements.label,
          description: mp.achievements.desc,
          iconBg: 'linear-gradient(135deg, rgba(250,204,21,0.25), rgba(251,146,60,0.12))',
          iconGlow: 'rgba(250,204,21,0.18)',
          onClick: open(() => setShowAchievements(true)),
        },
      ],
    },
    {
      title: mp.sections.economy,
      items: [
        {
          icon: '🛍️',
          label: mp.coinShop.label,
          description: mp.coinShop.desc,
          iconBg: 'linear-gradient(135deg, rgba(34,197,94,0.25), rgba(16,185,129,0.1))',
          iconGlow: 'rgba(34,197,94,0.18)',
          onClick: open(() => onShopClick?.()),
        },
        {
          icon: '🪙',
          label: mp.coinHistory.label,
          description: mp.coinHistory.desc,
          iconBg: 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.1))',
          iconGlow: 'rgba(251,191,36,0.18)',
          onClick: open(() => setShowCoinHistory(true)),
        },
        {
          icon: '🔗',
          label: mp.inviteFriends.label,
          description: mp.inviteFriends.desc,
          iconBg: 'linear-gradient(135deg, rgba(168,85,247,0.3), rgba(236,72,153,0.1))',
          iconGlow: 'rgba(168,85,247,0.2)',
          badge: { text: 'HOT', color: '#f472b6' },
          onClick: open(() => setShowReferral(true)),
        },
      ],
    },
    {
      title: mp.sections.account,
      items: [
        {
          icon: '⚙️',
          label: mp.settings.label,
          description: mp.settings.desc,
          iconBg: 'linear-gradient(135deg, rgba(100,116,139,0.3), rgba(71,85,105,0.12))',
          iconGlow: 'rgba(100,116,139,0.18)',
          onClick: open(() => setShowSettings(true)),
        },
        ...(isOwner && onEconomyClick ? [{
          icon: '👑',
          label: mp.economyAdmin.label,
          description: mp.economyAdmin.desc,
          iconBg: 'linear-gradient(135deg, rgba(251,191,36,0.28), rgba(245,158,11,0.1))',
          iconGlow: 'rgba(251,191,36,0.22)',
          onClick: open(onEconomyClick),
        }] : []),
      ],
    },
  ];

  let globalIndex = 0;
  const level = profile?.level ?? 1;

  return (
    <>
      <AnimatePresence>
        {morePanelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="more-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[70]"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
              onClick={closeMoreMenu}
            />

            {/* Panel */}
            <motion.div
              key="more-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="vm-more-panel fixed top-0 left-0 bottom-0 z-[80] flex flex-col"
              style={{
                width: 'min(310px, 88vw)',
                background: 'var(--panel-bg)',
                borderRight: '1px solid var(--panel-border)',
                boxShadow: '12px 0 48px rgba(0,0,0,0.7)',
                transition: 'background 180ms ease, border-color 180ms ease',
              }}
            >
              {/* Left edge accent */}
              <div className="absolute top-0 left-0 bottom-0 w-[2px] pointer-events-none"
                style={{ background: 'var(--vm-panel-left-accent)' }} />

              {/* Header */}
              <div className="px-4 pb-4 safe-top-plus-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-neon-purple/35">Menu</p>
                  <button
                    onClick={closeMoreMenu}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white/25 hover:text-white/55 transition-all active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* User identity */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center text-xl"
                      style={{ background: 'var(--vm-avatar-bg)', border: '1px solid var(--vm-avatar-border)' }}
                    >
                      {profile?.avatarUrl
                        ? <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
                        : <span>{profile?.avatar ?? '👤'}</span>}
                    </div>
                    {/* Level pip */}
                    <div
                      className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1"
                      style={{ background: 'var(--vm-level-pip)', boxShadow: `0 0 6px var(--vm-level-pip-shadow)`, fontSize: '10px' }}
                    >
                      <span className="font-mono font-black text-white leading-none" style={{ fontSize: '10px' }}>{level}</span>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-black text-white/90 text-base tracking-wide leading-none truncate">
                      {profile?.username ?? 'Guest'}
                    </p>
                    <p className="font-mono text-[12px] text-white/22 mt-1 truncate">VOID MAFIA</p>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">

                {/* ── Moderation quick-access (mods only) ── */}
                {isMod && onModClick && (
                  <motion.button
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08, duration: 0.2 }}
                    onClick={open(onModClick)}
                    className="w-full mt-3 flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(220,38,38,0.05))',
                      border: '1px solid rgba(239,68,68,0.28)',
                      boxShadow: '0 0 18px rgba(239,68,68,0.08)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.08))'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(135deg, rgba(239,68,68,0.14), rgba(220,38,38,0.05))'; }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                      style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.12))', boxShadow: '0 0 10px rgba(239,68,68,0.25)' }}>
                      🛡
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-display font-bold text-red-400/90 leading-none">მოდერაცია</p>
                      <p className="text-[12px] font-mono text-red-400/45 mt-0.5">სამართავი პანელი</p>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round" className="text-red-400/30 flex-shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </motion.button>
                )}

                {/* ── Audio quick toggles ── */}
                <div
                  className="mt-3 mb-1 rounded-2xl px-3"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base leading-none opacity-70">🔊</span>
                      <p className="text-xs font-mono text-white/55">ხმის ეფექტები</p>
                    </div>
                    <AudioToggle value={sfxEnabled} onChange={toggleSfx} />
                  </div>
                  <div className="h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base leading-none opacity-70">🎵</span>
                      <p className="text-xs font-mono text-white/55">ბექგრაუნდ მუსიკა</p>
                    </div>
                    <AudioToggle value={musicEnabled} onChange={toggleMusic} />
                  </div>
                </div>

                {/* ── Design theme switcher ── */}
                <div className="mt-3">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-[0.28em] text-white/18">დიზაინი</p>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateSettings({ themeMode: 'void-neon' })}
                      className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all duration-200 active:scale-95"
                      style={{
                        background: themeMode === 'void-neon'
                          ? 'linear-gradient(135deg, rgba(155,0,255,0.18), rgba(0,245,255,0.06))'
                          : 'rgba(255,255,255,0.03)',
                        border: themeMode === 'void-neon'
                          ? '1px solid rgba(155,0,255,0.42)'
                          : '1px solid rgba(255,255,255,0.07)',
                        boxShadow: themeMode === 'void-neon' ? '0 0 14px rgba(155,0,255,0.1)' : 'none',
                      }}
                    >
                      <div className="flex gap-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#9b00ff', boxShadow: '0 0 5px rgba(155,0,255,0.9)' }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#00f5ff', boxShadow: '0 0 5px rgba(0,245,255,0.9)' }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff00cc', boxShadow: '0 0 5px rgba(255,0,204,0.9)' }} />
                      </div>
                      <p className="text-[11px] font-mono font-bold tracking-widest uppercase leading-none" style={{ color: themeMode === 'void-neon' ? 'rgba(155,0,255,0.9)' : 'rgba(255,255,255,0.28)' }}>
                        Void Neon
                      </p>
                      <p className="text-[10px] font-mono leading-none" style={{ color: 'rgba(255,255,255,0.18)' }}>კიბერ-ნეონი</p>
                      {themeMode === 'void-neon' && (
                        <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'rgba(155,0,255,0.28)', border: '1px solid rgba(155,0,255,0.5)', fontSize: '9px', color: 'rgba(155,0,255,0.9)' }}>
                          ✓
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => updateSettings({ themeMode: 'minimal-glass' })}
                      className="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl transition-all duration-200 active:scale-95"
                      style={{
                        background: themeMode === 'minimal-glass'
                          ? 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(34,211,238,0.06))'
                          : 'rgba(255,255,255,0.03)',
                        border: themeMode === 'minimal-glass'
                          ? '1px solid rgba(139,92,246,0.42)'
                          : '1px solid rgba(255,255,255,0.07)',
                        boxShadow: themeMode === 'minimal-glass' ? '0 0 14px rgba(139,92,246,0.1)' : 'none',
                      }}
                    >
                      <div className="flex gap-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.82)', boxShadow: '0 0 4px rgba(255,255,255,0.4)' }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#8b5cf6' }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22d3ee' }} />
                      </div>
                      <p className="text-[11px] font-mono font-bold tracking-widest uppercase leading-none" style={{ color: themeMode === 'minimal-glass' ? 'rgba(139,92,246,0.9)' : 'rgba(255,255,255,0.28)' }}>
                        Min. Glass
                      </p>
                      <p className="text-[10px] font-mono leading-none" style={{ color: 'rgba(255,255,255,0.18)' }}>მინიმალური</p>
                      {themeMode === 'minimal-glass' && (
                        <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.28)', border: '1px solid rgba(139,92,246,0.5)', fontSize: '9px', color: 'rgba(139,92,246,0.9)' }}>
                          ✓
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* ── Language switcher ── */}
                <div className="mt-3">
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <p className="text-[11px] font-mono font-bold uppercase tracking-[0.28em] text-white/18">ენა · LANG</p>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                  <div className="flex gap-2">
                    {([
                      { id: 'ka', label: 'ქართული', sub: 'Georgian' },
                      { id: 'en', label: 'English', sub: 'English' },
                      { id: 'ru', label: 'Русский', sub: 'Russian' },
                    ] as { id: Lang; label: string; sub: string }[]).map(l => {
                      const active = lang === l.id;
                      return (
                        <button
                          key={l.id}
                          onClick={() => setLang(l.id)}
                          className="flex-1 flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl transition-all duration-200 active:scale-95"
                          style={{
                            background: active
                              ? 'linear-gradient(135deg, rgba(155,0,255,0.18), rgba(0,245,255,0.06))'
                              : 'rgba(255,255,255,0.03)',
                            border: active ? '1px solid rgba(155,0,255,0.42)' : '1px solid rgba(255,255,255,0.07)',
                            boxShadow: active ? '0 0 14px rgba(155,0,255,0.1)' : 'none',
                          }}
                        >
                          <p className="text-[13px] font-mono font-bold leading-none" style={{ color: active ? 'rgba(200,120,255,0.95)' : 'rgba(255,255,255,0.5)' }}>
                            {l.label}
                          </p>
                          <p className="text-[9px] font-mono uppercase tracking-widest leading-none" style={{ color: 'rgba(255,255,255,0.18)' }}>{l.sub}</p>
                          {active && (
                            <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: 'rgba(155,0,255,0.28)', border: '1px solid rgba(155,0,255,0.5)', fontSize: '9px', color: 'rgba(155,0,255,0.9)' }}>
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {sections.map(section => (
                  <div key={section.title}>
                    <SectionLabel title={section.title} />
                    {section.items.map(item => {
                      const idx = globalIndex++;
                      return <MenuRow key={item.label} item={item} index={idx} />;
                    })}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-4 pt-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <LogOutButton onClose={closeMoreMenu} />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-neon-green/60" style={{ boxShadow: '0 0 4px rgba(0,255,136,0.5)' }} />
                    <span className="font-mono text-[11px] text-white/18 tracking-wider uppercase">
                      {CLIENT_VERSION}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-white/10 tracking-[0.2em] uppercase">Void Mafia</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      {showProfileEdit && <ProfileEditPanel onClose={() => setShowProfileEdit(false)} />}
      <CoinHistoryModal open={showCoinHistory} onClose={() => setShowCoinHistory(false)} />
      <HowToPlayModal open={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
      <AchievementsModal open={showAchievements} onClose={() => setShowAchievements(false)} profileId={profileId} />
      <SeasonPassModal open={showSeasonPass} onClose={() => setShowSeasonPass(false)} />
      <ReferralModal open={showReferral} onClose={() => setShowReferral(false)} />
    </>
  );
}
