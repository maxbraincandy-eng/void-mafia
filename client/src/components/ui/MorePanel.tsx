import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/langStore';
import { useSettingsStore } from '@/store/settingsStore';
import { onSettingsChange } from '@/lib/audioEngine';
import { SettingsPanel } from '@/pages/SettingsPanel';
import { CoinHistoryModal } from '@/components/ui/CoinHistoryModal';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { AchievementsModal } from '@/components/ui/AchievementsModal';
import { SeasonPassModal } from '@/components/ui/SeasonPassModal';
import { ReferralModal } from '@/components/ui/ReferralModal';

interface MenuItem {
  icon: string;
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
      <p className="text-[12px] font-mono font-bold uppercase tracking-[0.22em] text-white/20">
        {title}
      </p>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
    </div>
  );
}

function MenuRow({ item, index }: { item: MenuItem; index: number }) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 + index * 0.04, duration: 0.22, ease: 'easeOut' }}
      onClick={item.comingSoon ? undefined : item.onClick}
      disabled={item.comingSoon}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all duration-150 group disabled:cursor-default active:scale-[0.98]"
      style={{ background: 'transparent' }}
      onMouseEnter={e => {
        if (!item.comingSoon)
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg transition-transform duration-150 group-active:scale-95"
        style={{
          background: item.comingSoon ? 'rgba(255,255,255,0.04)' : item.iconBg,
          boxShadow: item.comingSoon ? 'none' : `0 0 14px ${item.iconGlow}`,
        }}
      >
        <span className={item.comingSoon ? 'opacity-25 grayscale' : ''}>{item.icon}</span>
      </div>

      {/* Text */}
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-display font-bold tracking-wide leading-none ${item.comingSoon ? 'text-white/20' : 'text-white/85'}`}>
            {item.label}
          </p>
          {item.badge && !item.comingSoon && (
            <span
              className="text-[12px] font-mono font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full leading-none"
              style={{ background: item.badge.color + '22', color: item.badge.color, border: `1px solid ${item.badge.color}44` }}
            >
              {item.badge.text}
            </span>
          )}
        </div>
        <p className={`text-[12px] font-mono mt-1 leading-tight ${item.comingSoon ? 'text-white/12' : 'text-white/30'}`}>
          {item.description}
        </p>
      </div>

      {/* Right side */}
      {item.comingSoon ? (
        <span
          className="text-[12px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          soon
        </span>
      ) : (
        <svg
          width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-white/15 group-hover:text-white/40 transition-colors flex-shrink-0"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </motion.button>
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

function AudioToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative w-10 h-[22px] rounded-full transition-all duration-300 flex-shrink-0"
      style={{
        background: value
          ? 'linear-gradient(90deg, #9b00ff, #00e5ff)'
          : 'rgba(255,255,255,0.08)',
        border: value ? '1px solid rgba(155,0,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
        boxShadow: value ? '0 0 8px rgba(155,0,255,0.25)' : 'none',
      }}
    >
      <span
        className="absolute top-[2px] rounded-full bg-white shadow transition-all duration-300"
        style={{ width: '18px', height: '18px', left: value ? 'calc(100% - 20px)' : '2px' }}
      />
    </button>
  );
}

export function MorePanel({ isOwner = false, isMod = false, onEconomyClick, onShopClick, onReplaysClick, onClansClick, onLeaderboardClick, onMessagesClick, onModClick }: MorePanelProps) {
  const { morePanelOpen, closeMoreMenu } = useSocialStore();
  const profile = useAuthStore(s => s.profile);
  const profileId = profile?.id ?? null;
  const t = useT();
  const mp = t.morePanel;
  const sfxEnabled = useSettingsStore(s => s.sfxEnabled);
  const musicEnabled = useSettingsStore(s => s.musicEnabled);
  const updateSettings = useSettingsStore(s => s.update);

  const toggleSfx = (v: boolean) => { updateSettings({ sfxEnabled: v }); onSettingsChange(); };
  const toggleMusic = (v: boolean) => { updateSettings({ musicEnabled: v }); onSettingsChange(); };

  const [showSettings, setShowSettings] = useState(false);
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
          icon: '⚔️',
          label: 'კლანები',
          description: 'კლანური ბრძოლები და რეიტინგი',
          iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(220,38,38,0.1))',
          iconGlow: 'rgba(239,68,68,0.2)',
          onClick: open(() => onClansClick?.()),
        },
        {
          icon: '🏅',
          label: 'ლიდერბორდი',
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
        ...(isMod && onModClick ? [{
          icon: '🛡',
          label: 'მოდერაცია',
          description: 'სამართავი პანელი',
          iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(220,38,38,0.1))',
          iconGlow: 'rgba(239,68,68,0.2)',
          onClick: open(onModClick),
        }] : []),
        ...(isOwner && onEconomyClick ? [{
          icon: '👑',
          label: mp.economyAdmin.label,
          description: mp.economyAdmin.desc,
          iconBg: 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(220,38,38,0.1))',
          iconGlow: 'rgba(239,68,68,0.2)',
          onClick: open(onEconomyClick),
        }] : []),
      ],
    },
  ];

  let globalIndex = 0;

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
              className="fixed top-0 left-0 bottom-0 z-[80] flex flex-col"
              style={{
                width: 'min(310px, 88vw)',
                background: 'linear-gradient(180deg, rgba(8,4,22,0.99) 0%, rgba(5,2,15,0.99) 100%)',
                borderRight: '1px solid rgba(138,43,226,0.15)',
                boxShadow: '12px 0 48px rgba(0,0,0,0.7), 1px 0 0 rgba(138,43,226,0.08)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-14 pb-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-[0.3em] text-neon-purple/40 mb-1">
                    Menu
                  </p>
                  <h2 className="font-display font-black text-white/90 text-lg tracking-widest">
                    VOID MAFIA
                  </h2>
                  {profile?.username && (
                    <p className="text-[12px] font-mono text-white/25 mt-0.5 truncate max-w-[160px]">
                      {profile.username}
                    </p>
                  )}
                </div>
                <button
                  onClick={closeMoreMenu}
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-white/30 hover:text-white/60 transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Sections */}
              <div className="flex-1 overflow-y-auto px-3 pb-4">

                {/* Audio quick toggles */}
                <div
                  className="mt-3 mb-1 rounded-2xl px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">🔊</span>
                      <p className="text-xs font-mono text-white/70">ხმის ეფექტები</p>
                    </div>
                    <AudioToggle value={sfxEnabled} onChange={toggleSfx} />
                  </div>
                  <div className="h-px mx-0" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">🎵</span>
                      <p className="text-xs font-mono text-white/70">ბექგრაუნდ მუსიკა</p>
                    </div>
                    <AudioToggle value={musicEnabled} onChange={toggleMusic} />
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
              <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[12px] font-mono font-bold uppercase tracking-[0.2em] px-2 py-1 rounded-lg"
                    style={{
                      background: 'linear-gradient(135deg, rgba(138,43,226,0.15), rgba(0,229,255,0.06))',
                      border: '1px solid rgba(138,43,226,0.2)',
                      color: 'rgba(138,43,226,0.7)',
                    }}
                  >
                    V1.0
                  </span>
                  <p className="font-mono text-[12px] text-white/12 tracking-widest uppercase">
                    Void Mafia
                  </p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
      <CoinHistoryModal open={showCoinHistory} onClose={() => setShowCoinHistory(false)} />
      <HowToPlayModal open={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
      <AchievementsModal open={showAchievements} onClose={() => setShowAchievements(false)} profileId={profileId} />
      <SeasonPassModal open={showSeasonPass} onClose={() => setShowSeasonPass(false)} />
      <ReferralModal open={showReferral} onClose={() => setShowReferral(false)} />
    </>
  );
}
