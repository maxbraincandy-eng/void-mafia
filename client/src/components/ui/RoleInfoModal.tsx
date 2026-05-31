import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RoleKey } from '@/types/index';

interface RoleInfo {
  key: RoleKey;
  icon: string;
  name: string;
  team: 'town' | 'mafia' | 'neutral' | 'cult';
  desc: string;
  ability: string;
  win: string;
}

const ROLES: RoleInfo[] = [
  // TOWN
  {
    key: 'citizen', icon: '🏙', name: 'Citizen', team: 'town',
    desc: 'An ordinary resident. No special power, but your vote is your weapon.',
    ability: 'None — observe and vote wisely during the day.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'sheriff', icon: '🔍', name: 'Sheriff', team: 'town',
    desc: 'The town detective. Investigate suspects to expose the Mafia.',
    ability: 'Each night, investigate one player — learn if they are Mafia or Innocent.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'doctor', icon: '💉', name: 'Doctor', team: 'town',
    desc: 'A healer who keeps the town alive. Save an ally from being eliminated.',
    ability: 'Each night, protect one player. If Mafia targets them, they survive.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'bodyguard', icon: '🛡', name: 'Bodyguard', team: 'town',
    desc: 'Sworn to protect. Die in place of your chosen ward.',
    ability: 'Guard a player each night. If Mafia attacks your ward, you die instead.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'vigilante', icon: '⚖️', name: 'Vigilante', team: 'town',
    desc: 'Takes justice into their own hands. Kill carefully — mistakes are costly.',
    ability: 'Each night, eliminate one player. Killing an innocent hurts the town.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'escort', icon: '💃', name: 'Escort', team: 'town',
    desc: 'A distraction expert. Prevent dangerous roles from acting.',
    ability: 'Each night, roleblock one player — their night action is cancelled.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'mayor', icon: '👑', name: 'Mayor', team: 'town',
    desc: 'The elected leader. Reveal yourself to double your voting power.',
    ability: 'Once revealed as Mayor, your vote counts twice in every vote.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'tracker', icon: '👁', name: 'Tracker', team: 'town',
    desc: 'A surveillance expert. Follow someone and see who they visit.',
    ability: 'Each night, tail one player and discover who they visited that night.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'veteran', icon: '🎖️', name: 'Veteran', team: 'town',
    desc: 'A battle-hardened soldier. Go on high alert to kill intruders.',
    ability: 'Choose to go on alert — anyone who visits you that night is shot dead.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  {
    key: 'spy', icon: '🕵️', name: 'Fortune Teller', team: 'town',
    desc: 'A mystic who sees the Mafia\'s dark deeds from afar.',
    ability: 'Each morning, learn who the Mafia targeted the previous night.',
    win: 'Eliminate all Mafia and Cult members.',
  },
  // MAFIA
  {
    key: 'mafia', icon: '🔫', name: 'Mafia', team: 'mafia',
    desc: 'A hitman hiding in plain sight. Coordinate kills with the crew.',
    ability: 'Each night, eliminate one town member as a group.',
    win: 'Mafia must equal or outnumber the remaining town.',
  },
  {
    key: 'don', icon: '♛', name: 'Don', team: 'mafia',
    desc: 'The Mafia boss. Leads the kill and evades the Sheriff\'s eye.',
    ability: 'Lead the Mafia kill. Appears as Innocent to the Sheriff.',
    win: 'Mafia must equal or outnumber the remaining town.',
  },
  {
    key: 'arsonist', icon: '🔥', name: 'Arsonist', team: 'mafia',
    desc: 'A pyromaniac who plants accelerant before igniting everything.',
    ability: 'Douse players with accelerant. Self-target to ignite — killing all doused players simultaneously.',
    win: 'Mafia must equal or outnumber the remaining town.',
  },
  // NEUTRAL
  {
    key: 'maniac', icon: '🌀', name: 'Maniac', team: 'neutral',
    desc: 'A lone killer with no allegiance. Outlast everyone else.',
    ability: 'Each night, eliminate one player. Win by being the last one alive.',
    win: 'Be the last player standing.',
  },
  {
    key: 'jester', icon: '🃏', name: 'Jester', team: 'neutral',
    desc: 'A fool who wants to be caught. Make them vote you out.',
    ability: 'No night ability — convince the town you\'re suspicious and get voted out.',
    win: 'Be eliminated by the town vote (not by a night kill).',
  },
  // CULT
  {
    key: 'cult_leader', icon: '🕯️', name: 'Cult Leader', team: 'cult',
    desc: 'A zealot building a secret congregation in the dark.',
    ability: 'Each night, convert one non-cult player into a Cultist.',
    win: 'Cult must outnumber all other factions combined.',
  },
  {
    key: 'cultist', icon: '🔮', name: 'Cultist', team: 'cult',
    desc: 'A converted follower serving the Cult Leader\'s vision.',
    ability: 'No active ability — support the Cult Leader\'s expansion.',
    win: 'Cult must outnumber all other factions combined.',
  },
];

const TEAM_META = {
  town:    { label: 'TOWN',    color: 'text-neon-cyan',   border: 'border-neon-cyan/20',   bg: 'bg-neon-cyan/5',   count: 0 },
  mafia:   { label: 'MAFIA',   color: 'text-neon-pink',   border: 'border-neon-pink/20',   bg: 'bg-neon-pink/5',   count: 0 },
  neutral: { label: 'NEUTRAL', color: 'text-neon-purple', border: 'border-neon-purple/20', bg: 'bg-neon-purple/5', count: 0 },
  cult:    { label: 'CULT',    color: 'text-fuchsia-400', border: 'border-fuchsia-400/20', bg: 'bg-fuchsia-400/5', count: 0 },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RoleInfoModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-[#0a0a0f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
            style={{ boxShadow: '0 -20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)' }}
          >
            {/* Drag handle (mobile) */}
            <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-4 border-b border-white/8 shrink-0">
              <div>
                <h2 className="font-display font-bold text-lg text-white tracking-widest uppercase">Role Guide</h2>
                <p className="text-white/30 font-mono text-xs mt-0.5">{ROLES.length} roles · tap a card to expand</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Scrollable role list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-5">
              {(['town', 'mafia', 'neutral', 'cult'] as const).map(team => {
                const roles = ROLES.filter(r => r.team === team);
                const tm = TEAM_META[team];
                return (
                  <div key={team}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className={`font-display font-bold text-[11px] tracking-[0.2em] uppercase ${tm.color}`}>{tm.label}</span>
                      <div className="flex-1 h-px bg-white/6" />
                      <span className="text-white/20 font-mono text-[10px]">{roles.length} roles</span>
                    </div>
                    <div className="space-y-1.5">
                      {roles.map(role => (
                        <RoleCard key={role.key} role={role} tm={tm} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Win conditions summary */}
              <div className="mt-2 p-4 rounded-2xl border border-white/6 bg-white/2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/30 mb-3">Win Conditions</p>
                <div className="space-y-2">
                  {[
                    { color: 'text-neon-cyan',   icon: '⚖️', label: 'Town',    desc: 'Eliminate all Mafia and Cult.' },
                    { color: 'text-neon-pink',   icon: '🔫', label: 'Mafia',   desc: 'Equal or outnumber the town.' },
                    { color: 'text-fuchsia-400', icon: '🕯️', label: 'Cult',    desc: 'Outnumber all other factions.' },
                    { color: 'text-neon-purple', icon: '🌀', label: 'Maniac',  desc: 'Be the last one standing.' },
                    { color: 'text-purple-400',  icon: '🃏', label: 'Jester',  desc: 'Get voted out by the town.' },
                  ].map(w => (
                    <div key={w.label} className="flex items-start gap-2">
                      <span className="text-base shrink-0">{w.icon}</span>
                      <div>
                        <span className={`font-display font-bold text-xs ${w.color}`}>{w.label}: </span>
                        <span className="text-white/50 text-xs">{w.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RoleCard({
  role,
  tm,
}: {
  role: RoleInfo;
  tm: typeof TEAM_META[keyof typeof TEAM_META];
}) {
  const [open, setOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setOpen(o => !o)}
      className={`w-full text-left rounded-xl border ${tm.border} ${tm.bg} p-3 transition-all hover:brightness-110 active:scale-[0.99]`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl shrink-0">{role.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-display font-semibold text-sm ${tm.color}`}>{role.name}</p>
          <p className="text-white/40 text-xs leading-snug truncate">{role.desc}</p>
        </div>
        <span className={`text-white/25 text-[10px] shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-white/6 space-y-2.5 text-left">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-0.5">Night Ability</p>
                <p className="text-white/70 text-xs leading-relaxed">{role.ability}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-white/25 mb-0.5">Win Condition</p>
                <p className={`text-xs font-medium ${tm.color}`}>{role.win}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
