import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROLES = [
  { key: 'mafia',       icon: '🔫', name: 'მაფია',          team: 'mafia',   badge: '🔴', desc: 'ღამით კლავს მოქალაქეს' },
  { key: 'don',         icon: '♛',  name: 'დონი',           team: 'mafia',   badge: '🔴', desc: 'მაფიის ლიდერი, sheriff-ის გამოძიებას ვერ ხვდება' },
  { key: 'yakuza',      icon: '⚔️', name: 'იაკუძა',         team: 'mafia',   badge: '🔴', desc: 'კლავს ღამით, yakuza-ს ფრაქცია' },
  { key: 'shogun',      icon: '👺', name: 'შოგუნი',          team: 'mafia',   badge: '🔴', desc: 'იაკუძის ლიდერი' },
  { key: 'citizen',     icon: '👤', name: 'მოქალაქე',        team: 'town',    badge: '🔵', desc: 'ხმის მიცემა და დაკვირვება' },
  { key: 'sheriff',     icon: '🔍', name: 'შერიფი',          team: 'town',    badge: '🔵', desc: 'ღამით ამოწმებს მოთამაშის ეჭვმიტანილობას' },
  { key: 'doctor',      icon: '💊', name: 'ექიმი',           team: 'town',    badge: '🔵', desc: 'ღამით იცავს ერთ მოთამაშეს' },
  { key: 'bodyguard',   icon: '🛡', name: 'მცველი',          team: 'town',    badge: '🔵', desc: 'იცავს სამიზნეს, თვითონ კვდება' },
  { key: 'escort',      icon: '💃', name: 'ესკორტი',         team: 'town',    badge: '🔵', desc: 'ბლოკავს სამიზნის ქმედებას' },
  { key: 'vigilante',   icon: '🔫', name: 'ვიჯილანტი',       team: 'town',    badge: '🔵', desc: 'ღამით ისვრის (შეზღუდული)' },
  { key: 'tracker',     icon: '👁', name: 'ტრეკერი',         team: 'town',    badge: '🔵', desc: 'ხედავს ვინ მოინახულა სამიზნე' },
  { key: 'veteran',     icon: '🎖️', name: 'ვეტერანი',        team: 'town',    badge: '🔵', desc: '"მზად" რეჟიმში მოსვლისას კლავს მოსულს' },
  { key: 'mayor',       icon: '🏛', name: 'მერი',            team: 'town',    badge: '🔵', desc: 'გამომჟღავნებისას 3 ხმა' },
  { key: 'maniac',      icon: '🌀', name: 'მანიაკი',         team: 'neutral', badge: '⚪', desc: 'მარტო კლავს ყველას' },
  { key: 'jester',      icon: '🃏', name: 'ჯესტერი',         team: 'neutral', badge: '⚪', desc: 'სურს ხმით მოკვლა' },
  { key: 'arsonist',    icon: '🔥', name: 'მაწვარი',         team: 'neutral', badge: '⚪', desc: 'ასველებს, შემდეგ ყველას წვავს' },
  { key: 'cult_leader', icon: '🕯️', name: 'კულტის ლიდერი',  team: 'cult',    badge: '🟣', desc: 'ღამით ცვლის ალიანსს' },
  { key: 'cultist',     icon: '😶', name: 'კულტისტი',        team: 'cult',    badge: '🟣', desc: 'გადაბირებული მოთამაშე' },
] as const;

const PHASES = [
  { icon: '🌙', name: 'ღამე',         desc: 'მაფია და სპეციალური როლები მოქმედებენ ფარულად' },
  { icon: '☀️', name: 'დღე',          desc: 'ყველა განიხილავს, ვინ შეიძლება იყოს მაფია' },
  { icon: '🎤', name: 'სიტყვა',       desc: 'თითოეული მოთამაშე ლაპარაკობს რიგრიგობით' },
  { icon: '⚖️', name: 'კენჭისყრა',   desc: 'ხმის მიცემა ეჭვმიტანილის გარიცხვაზე' },
  { icon: '🛡', name: 'დაცვა',        desc: 'ნომინირებული ამართლებს თავს (თუ ჩართულია)' },
  { icon: '💀', name: 'ბოლო სიტყვა', desc: 'გარიცხული ლაპარაკობს ბოლოს' },
];

const RULES = [
  'მაფიამ უნდა მოაღწიოს ქალაქელების ტოლ ან მეტ რაოდენობამდე',
  'ქალაქელებმა უნდა გამოარიყონ ყველა მაფიელი',
  'მანიაკი იმარჯვებს ყველა სხვის მოკვლით',
  'ჯესტერი იმარჯვებს ხმით გარიცხვით',
  'ფოლი: 3 ფოლი = გაფრთხილება, 4 = გარიცხვა',
  'Skip Discussion: 3+ ხმა გადადის სიტყვის ფაზაში',
];

const TEAM_COLOR: Record<string, string> = {
  mafia:   'text-red-400',
  town:    'text-neon-cyan',
  neutral: 'text-white/50',
  cult:    'text-neon-purple',
};

const TABS = ['როლები', 'ფაზები', 'წესები'] as const;
type Tab = typeof TABS[number];

export function HowToPlayModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('როლები');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm px-0 sm:px-4 pb-0"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
            style={{
              background: 'rgba(6,3,18,0.98)',
              border: '1px solid rgba(138,43,226,0.18)',
              boxShadow: '0 -8px 60px rgba(138,43,226,0.08)',
              maxHeight: '82vh',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/6 flex-shrink-0">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-neon-purple/50 mb-0.5">Guide</p>
                <h2 className="font-display font-bold text-white text-base">How to Play</h2>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex gap-1 px-4 pt-3 pb-0 flex-shrink-0">
              {TABS.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all"
                  style={{
                    background: tab === t ? 'rgba(138,43,226,0.2)' : 'rgba(255,255,255,0.03)',
                    border: tab === t ? '1px solid rgba(138,43,226,0.35)' : '1px solid rgba(255,255,255,0.07)',
                    color: tab === t ? 'rgba(200,150,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === 'როლები' && (
                <div className="grid grid-cols-1 gap-2">
                  {ROLES.map(role => (
                    <div
                      key={role.key}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-xl w-7 text-center flex-shrink-0">{role.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-bold text-white/85 text-sm">{role.name}</span>
                          <span className="text-xs">{role.badge}</span>
                        </div>
                        <p className={`font-mono text-[10px] mt-0.5 ${TEAM_COLOR[role.team]}/70`}>{role.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'ფაზები' && (
                <div className="flex flex-col gap-2">
                  {PHASES.map((phase, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="text-2xl flex-shrink-0 mt-0.5">{phase.icon}</span>
                      <div>
                        <p className="font-display font-bold text-white/85 text-sm">{phase.name}</p>
                        <p className="font-mono text-[11px] text-white/45 mt-0.5">{phase.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'წესები' && (
                <div className="flex flex-col gap-2 pt-1">
                  {RULES.map((rule, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <span className="font-mono text-neon-purple/60 text-sm flex-shrink-0 mt-0.5">•</span>
                      <p className="font-mono text-[12px] text-white/65 leading-relaxed">{rule}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
