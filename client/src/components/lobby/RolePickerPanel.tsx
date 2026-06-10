import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { GameSettings, RoleKey, DynamicEventSettings } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { DEFAULT_DYNAMIC_EVENTS } from '@/types/index';

// ── Role metadata ──────────────────────────────────────────────────────
type ConfigurableRoleKey = keyof GameSettings['roles'];

interface RoleMeta {
  key: ConfigurableRoleKey;
  name: string;
  icon: string;
  desc: string;
  max: number;
}

const ROLE_GROUPS: Array<{
  label: string;
  team: 'mafia' | 'town' | 'neutral' | 'cult' | 'yakuza';
  color: string;
  borderColor: string;
  bgColor: string;
  roles: RoleMeta[];
}> = [
  {
    label: 'MAFIA', team: 'mafia',
    color: 'text-neon-pink', borderColor: 'border-neon-pink/30', bgColor: 'bg-neon-pink/8',
    roles: [
      { key: 'mafia',  name: 'Mafia',  icon: '🔫', desc: 'Kills one player each night. Wins when mafia matches town.', max: 6 },
      { key: 'don',    name: 'Don',    icon: '♛',  desc: 'Mafia leader — appears innocent to Sheriff investigations.', max: 1 },
    ],
  },
  {
    label: 'TOWN', team: 'town',
    color: 'text-neon-cyan', borderColor: 'border-neon-cyan/25', bgColor: 'bg-neon-cyan/5',
    roles: [
      { key: 'sheriff',   name: 'Sheriff',        icon: '🔍', desc: 'Investigates one player per night to detect Mafia.',        max: 2 },
      { key: 'doctor',    name: 'Doctor',          icon: '💉', desc: 'Protects one player from elimination each night.',          max: 2 },
      { key: 'bodyguard', name: 'Bodyguard',       icon: '🛡', desc: 'Takes a bullet for their target — dies in their place.',   max: 2 },
      { key: 'spy',       name: 'Fortune Teller',  icon: '🕵️', desc: "Sees who the Mafia targeted each night — even if saved.", max: 2 },
      { key: 'vigilante', name: 'Vigilante',       icon: '⚖️', desc: 'Kills one player per night independently. Risk of error.', max: 2 },
      { key: 'escort',    name: 'Escort',          icon: '💃', desc: 'Roleblocks one player, cancelling their night action.',     max: 2 },
      { key: 'veteran',   name: 'Veteran',         icon: '🎖️', desc: 'Alerts at night — anyone who visits them is killed.',      max: 2 },
      { key: 'tracker',   name: 'Tracker',         icon: '👁', desc: 'Follows a player to discover who they visited at night.',  max: 2 },
      { key: 'mayor',     name: 'Mayor',           icon: '👑', desc: 'Votes count twice during the tribunal.',                   max: 1 },
    ],
  },
  {
    label: 'NEUTRAL', team: 'neutral',
    color: 'text-neon-purple', borderColor: 'border-neon-purple/25', bgColor: 'bg-neon-purple/5',
    roles: [
      { key: 'maniac',   name: 'Maniac',   icon: '🌀', desc: 'Lone killer — wins by being the last player alive.',           max: 2 },
      { key: 'jester',   name: 'Jester',   icon: '🃏', desc: 'Wants to be voted out. Wins by convincing town to eliminate.', max: 2 },
      { key: 'arsonist', name: 'Arsonist', icon: '🔥', desc: 'Douses players with gas, then ignites — killing all at once.', max: 2 },
    ],
  },
  {
    label: 'CULT', team: 'cult',
    color: 'text-fuchsia-400', borderColor: 'border-fuchsia-400/25', bgColor: 'bg-fuchsia-400/5',
    roles: [
      { key: 'cult_leader', name: 'Cult Leader', icon: '🕯️', desc: 'Recruits players to cult each night. Wins when cult dominates.', max: 1 },
    ],
  },
  {
    label: 'YAKUZA', team: 'yakuza',
    color: 'text-red-400', borderColor: 'border-red-500/30', bgColor: 'bg-red-950/20',
    roles: [
      { key: 'yakuza', name: 'Yakuza', icon: '🐉', desc: 'Kills one player each night. Checks as suspicious. Knows the Shogun.', max: 1 },
      { key: 'shogun', name: 'Shogun', icon: '⚔️', desc: 'Hidden Yakuza ally. Checks as innocent. Cannot kill. Wins with Yakuza.', max: 1 },
    ],
  },
];

// ── Balance computation ────────────────────────────────────────────────
function computeBalance(roles: GameSettings['roles'], playerCount: number) {
  const mafia   = (roles.mafia ?? 0) + (roles.don ?? 0);
  const town    = (roles.sheriff ?? 0) + (roles.doctor ?? 0) + (roles.bodyguard ?? 0) +
                  (roles.spy ?? 0) + (roles.vigilante ?? 0) + (roles.escort ?? 0) +
                  (roles.veteran ?? 0) + (roles.tracker ?? 0) + (roles.mayor ?? 0);
  const neutral = (roles.maniac ?? 0) + (roles.jester ?? 0) + (roles.arsonist ?? 0);
  const cult    = roles.cult_leader ?? 0;
  const yakuza  = (roles.yakuza ?? 0) + (roles.shogun ?? 0);
  const specified = mafia + town + neutral + cult + yakuza;
  const citizens  = Math.max(0, playerCount - specified);
  const totalTown = town + citizens;

  const isAutoMode = mafia === 0 && yakuza === 0 && specified === 0;
  const overflow   = specified > playerCount;
  const shogunWithoutYakuza = (roles.shogun ?? 0) > 0 && (roles.yakuza ?? 0) === 0;
  const isValid    = !overflow && !shogunWithoutYakuza && (isAutoMode || (mafia > 0 && mafia < playerCount - mafia));

  return { mafia, totalTown, neutral, cult, yakuza, citizens, specified, isAutoMode, overflow, shogunWithoutYakuza, isValid };
}

// ── Sub-components ─────────────────────────────────────────────────────
function BalanceBar({ roles, playerCount }: { roles: GameSettings['roles']; playerCount: number }) {
  const b = computeBalance(roles, playerCount);
  const total = b.mafia + b.totalTown + b.neutral + b.cult + b.yakuza;

  const segments = [
    { val: b.mafia,    color: '#ff00cc', label: 'Mafia',   glow: 'rgba(255,0,204,0.5)' },
    { val: b.totalTown, color: '#00e5ff', label: 'Town',   glow: 'rgba(0,229,255,0.4)' },
    { val: b.neutral,  color: '#9b00ff', label: 'Neutral', glow: 'rgba(155,0,255,0.4)' },
    { val: b.cult,     color: '#c026d3', label: 'Cult',    glow: 'rgba(192,38,211,0.4)' },
    { val: b.yakuza,   color: '#ef4444', label: 'Yakuza',  glow: 'rgba(239,68,68,0.5)' },
  ].filter(s => s.val > 0);

  const statusColor = b.isAutoMode ? '#00e5ff' : b.isValid ? '#00ff88' : '#ff2d55';
  const statusIcon  = b.isAutoMode ? '⚡' : b.isValid ? '✓' : '✗';
  const statusMsg   = b.isAutoMode
    ? `Auto: ${playerCount} players will be auto-assigned`
    : b.overflow
      ? `Too many roles (${b.specified}) for ${playerCount} players`
      : b.shogunWithoutYakuza
        ? 'Invalid: Shogun requires at least 1 Yakuza'
        : b.mafia === 0 && b.yakuza === 0
          ? 'Add at least 1 Mafia or Yakuza role'
          : !b.isValid
            ? `Mafia (${b.mafia}) must be less than Town (${playerCount - b.mafia})`
            : `Valid: ${b.mafia ? `${b.mafia}M · ` : ''}${b.totalTown}T${b.neutral ? ` · ${b.neutral}N` : ''}${b.cult ? ` · ${b.cult}C` : ''}${b.yakuza ? ` · ${b.yakuza}Y` : ''}${b.citizens ? ` · ${b.citizens}★` : ''}`;

  return (
    <div className="mb-5">
      {/* Bar */}
      <div className="relative h-3 rounded-full overflow-hidden bg-white/5 mb-2 flex">
        {total === 0 || b.isAutoMode ? (
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            className="h-full w-1/3 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.6), transparent)' }}
          />
        ) : segments.map((s, i) => (
          <motion.div
            key={i}
            initial={{ width: 0 }}
            animate={{ width: `${(s.val / total) * 100}%` }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: s.color, boxShadow: `0 0 6px ${s.glow}` }}
          />
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: statusColor }} className="text-sm font-bold">{statusIcon}</span>
        <span className="text-[11px] font-mono text-white/50">{statusMsg}</span>
      </div>

      {/* Legend */}
      {!b.isAutoMode && total > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {segments.map(s => (
            <span key={s.label} className="text-[10px] font-mono" style={{ color: s.color }}>
              {s.label} {s.val}
            </span>
          ))}
          {b.citizens > 0 && (
            <span className="text-[10px] font-mono text-white/30">Citizens {b.citizens}</span>
          )}
        </div>
      )}
    </div>
  );
}

function RoleCard({
  role, count, onInc, onDec,
}: {
  role: RoleMeta;
  count: number;
  onInc: () => void;
  onDec: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  const active = count > 0;

  return (
    <div className="relative">
      <motion.div
        layout
        className={clsx(
          'rounded-xl border p-2.5 transition-all duration-200',
          active
            ? 'border-white/20 bg-white/6'
            : 'border-white/6 bg-white/2 opacity-60',
        )}
      >
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-2">
          <button
            type="button"
            className="text-base leading-none hover:scale-110 transition-transform select-none"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onTouchStart={() => setShowTip(v => !v)}
          >
            {role.icon}
          </button>
          <span className={clsx('text-[11px] font-semibold truncate flex-1', active ? 'text-white' : 'text-white/40')}>
            {role.name}
          </span>
        </div>

        {/* Counter */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onDec}
            disabled={count === 0}
            className="w-6 h-6 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 disabled:opacity-20 transition-all flex items-center justify-center text-sm font-bold"
          >
            −
          </button>
          <motion.span
            key={count}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={clsx('text-sm font-bold font-mono w-5 text-center', active ? 'text-white' : 'text-white/25')}
          >
            {count}
          </motion.span>
          <button
            type="button"
            onClick={onInc}
            disabled={count >= role.max}
            className="w-6 h-6 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 disabled:opacity-20 transition-all flex items-center justify-center text-sm font-bold"
          >
            +
          </button>
        </div>
      </motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {showTip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-44 rounded-xl border border-white/15 bg-void-50/95 backdrop-blur-sm p-2.5 pointer-events-none"
          >
            <p className="text-[10px] font-bold text-white mb-1">{role.icon} {role.name}</p>
            <p className="text-[10px] text-white/55 leading-relaxed">{role.desc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step = 5, unit = 's',
  onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] font-mono text-white/45">{label}</label>
        <span className="text-[11px] font-mono font-bold text-neon-cyan/80">{value}{unit}</span>
      </div>
      <div className="relative h-1.5 bg-white/8 rounded-full">
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-neon-cyan/60 transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────
interface Props {
  settings: GameSettings;
  playerCount: number;
  onUpdate: (s: Partial<GameSettings>) => Promise<void>;
  isLoading?: boolean;
}

const DE_EVENT_LABELS: Array<{ key: keyof DynamicEventSettings['allowed']; label: string; icon: string }> = [
  { key: 'blackoutNight',      label: 'Blackout Night',       icon: '🌑' },
  { key: 'bloodMoon',          label: 'Blood Moon',           icon: '🔴' },
  { key: 'sheriffFog',         label: 'Sheriff Fog',          icon: '🌫️' },
  { key: 'doctorPressure',     label: 'Doctor Pressure',      icon: '💊' },
  { key: 'silentDay',          label: 'Silent Day',           icon: '🔇' },
  { key: 'doubleVote',         label: 'Double Vote',          icon: '2×' },
  { key: 'noRevealDay',        label: 'No Reveal',            icon: '🎭' },
  { key: 'anonymousVoting',    label: 'Anonymous Vote',       icon: '👻' },
  { key: 'extendedFinalWords', label: 'Extended Final Words', icon: '⏳' },
];

export function RolePickerPanel({ settings, playerCount, onUpdate, isLoading }: Props) {
  const [local, setLocal] = useState<GameSettings>({ ...settings, roles: { ...settings.roles } });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const de: DynamicEventSettings = local.dynamicEvents ?? DEFAULT_DYNAMIC_EVENTS;

  const updateDE = (patch: Partial<DynamicEventSettings>) => {
    setSaved(false);
    setLocal(s => ({ ...s, dynamicEvents: { ...(s.dynamicEvents ?? DEFAULT_DYNAMIC_EVENTS), ...patch } }));
  };

  const setRole = (key: keyof GameSettings['roles'], delta: number) => {
    setSaved(false);
    setLocal(s => {
      const current = (s.roles[key] ?? 0) as number;
      const meta = ROLE_GROUPS.flatMap(g => g.roles).find(r => r.key === key);
      const clamped = Math.max(0, Math.min(meta?.max ?? 99, current + delta));
      return { ...s, roles: { ...s.roles, [key]: clamped } };
    });
  };

  const handleAutoSetup = () => {
    setSaved(false);
    setLocal(s => ({
      ...s,
      roles: {
        mafia: 0, don: 0, sheriff: 0, doctor: 0,
        bodyguard: 0, spy: 0, vigilante: 0, escort: 0,
        maniac: 0, jester: 0, cult_leader: 0,
        veteran: 0, tracker: 0, arsonist: 0, mayor: 0,
        yakuza: 0, shogun: 0,
      },
    }));
  };

  const balance = useMemo(() => computeBalance(local.roles, playerCount), [local.roles, playerCount]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(local);
    setSaving(false);
    setSaved(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── Balance overview ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-void-50/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-display font-bold text-white/50 uppercase tracking-widest">
            Balance
          </h4>
          <button
            type="button"
            onClick={handleAutoSetup}
            className="px-3 py-1 rounded-lg text-[10px] font-mono font-bold border border-neon-cyan/30 text-neon-cyan/70 hover:border-neon-cyan/60 hover:text-neon-cyan hover:bg-neon-cyan/5 transition-all uppercase tracking-wider"
          >
            ⚡ Auto Setup
          </button>
        </div>
        <BalanceBar roles={local.roles} playerCount={playerCount} />
      </div>

      {/* ── Role cards by team ─────────────────────────────────────────── */}
      {ROLE_GROUPS.map(group => (
        <div key={group.label} className={clsx('rounded-2xl border p-4', group.borderColor, group.bgColor)}>
          <p className={clsx('text-[10px] font-display font-bold tracking-[0.2em] uppercase mb-3', group.color)}>
            {group.label}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {group.roles.map(role => (
              <RoleCard
                key={role.key}
                role={role}
                count={(local.roles[role.key] ?? 0) as number}
                onInc={() => setRole(role.key, +1)}
                onDec={() => setRole(role.key, -1)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Timer settings ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-void-50/60 p-4 space-y-4">
        <h4 className="text-xs font-display font-bold text-white/50 uppercase tracking-widest">Timers</h4>
        <SliderRow label="🌙 Night"   value={local.nightDuration}  min={15}  max={180} onChange={v => setLocal(s => ({ ...s, nightDuration:  v }))} />
        <SliderRow label="☀️ Day"    value={local.dayDuration}    min={30}  max={600} onChange={v => setLocal(s => ({ ...s, dayDuration:    v }))} />
        <SliderRow label="🎤 Speech" value={local.speechDuration}  min={15}  max={180} onChange={v => setLocal(s => ({ ...s, speechDuration: v }))} />
        <SliderRow label="⚖️ Vote"   value={local.voteDuration}   min={15}  max={120} onChange={v => setLocal(s => ({ ...s, voteDuration:   v }))} />
      </div>

      {/* ── Other options ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/8 bg-void-50/60 p-4 space-y-3">
        <h4 className="text-xs font-display font-bold text-white/50 uppercase tracking-widest">Rules</h4>

        {[
          { id: 'selfHeal',  label: '💊 Doctor can self-heal',        value: local.allowDoctorSelfHeal,
            toggle: () => setLocal(s => ({ ...s, allowDoctorSelfHeal: !s.allowDoctorSelfHeal })) },
          { id: 'private',   label: '🔒 Private room (invite only)',   value: local.isPrivate,
            toggle: () => setLocal(s => ({ ...s, isPrivate: !s.isPrivate })) },
          { id: 'startNight', label: '🌙 Start game at night (skip day discussion)', value: local.startWithNight,
            toggle: () => setLocal(s => ({ ...s, startWithNight: !s.startWithNight })) },
          { id: 'rotating', label: '🔄 Rotating circle — each day shifts the opener by one seat', value: local.rotatingSpeech ?? false,
            toggle: () => setLocal(s => ({ ...s, rotatingSpeech: !s.rotatingSpeech })) },
        ].map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={opt.toggle}
            className="w-full flex items-center gap-3 text-left"
          >
            <div className={clsx(
              'w-9 h-5 rounded-full flex items-center transition-colors relative flex-shrink-0',
              opt.value ? 'bg-neon-cyan/60' : 'bg-white/10',
            )}>
              <div className={clsx(
                'absolute w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-sm',
                opt.value ? 'translate-x-4' : 'translate-x-1',
              )} />
            </div>
            <span className="text-xs font-mono text-white/60">{opt.label}</span>
          </button>
        ))}

        <div>
          <label className="text-[11px] font-mono text-white/40 block mb-1">Tie vote rule</label>
          <div className="flex gap-2">
            {(['no_elimination', 'random'] as const).map(rule => (
              <button
                key={rule}
                type="button"
                onClick={() => { setSaved(false); setLocal(s => ({ ...s, tieVoteRule: rule })); }}
                className={clsx(
                  'flex-1 py-1.5 rounded-lg text-[10px] font-mono border transition-all',
                  local.tieVoteRule === rule
                    ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                    : 'border-white/8 text-white/30 hover:text-white/60',
                )}
              >
                {rule === 'no_elimination' ? 'No elimination' : 'Random pick'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Dynamic Events ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.12] p-4 space-y-3" style={{ background: 'rgba(10,5,32,0.8)' }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-display font-bold text-neon-purple/70 uppercase tracking-widest">
              ⚡ Dynamic Events
            </h4>
            <p className="text-[10px] font-mono text-white/30 mt-0.5">
              Random chaos events each phase
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateDE({ enabled: !de.enabled })}
            disabled={isLoading}
            className={clsx(
              'relative w-10 h-5 rounded-full border transition-all flex-shrink-0',
              de.enabled ? 'border-neon-cyan/50 bg-neon-cyan/15' : 'border-white/[0.12] bg-white/[0.03]',
            )}
          >
            <span className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full transition-all',
              de.enabled ? 'left-5 bg-neon-cyan' : 'left-0.5 bg-white/20',
            )} />
          </button>
        </div>

        {de.enabled && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-mono text-white/35 uppercase tracking-widest mb-2">Frequency</p>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => updateDE({ frequency: f })}
                    disabled={isLoading}
                    className={clsx(
                      'flex-1 py-1.5 rounded-lg border text-[10px] font-mono tracking-widest uppercase transition-all',
                      de.frequency === f
                        ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan/80'
                        : 'border-white/[0.07] text-white/25 hover:border-white/15 hover:text-white/45',
                    )}
                  >
                    {f}
                    <span className="block text-[8px] opacity-60 mt-0.5 normal-case tracking-normal">
                      {f === 'low' ? '10%' : f === 'medium' ? '20%' : '35%'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-mono text-white/35 uppercase tracking-widest mb-2">Allowed Events</p>
              <div className="grid grid-cols-1 gap-1">
                {DE_EVENT_LABELS.map(({ key, label, icon }) => {
                  const on = de.allowed[key] !== false;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateDE({ allowed: { ...de.allowed, [key]: !on } })}
                      disabled={isLoading}
                      className={clsx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all',
                        on ? 'border-white/[0.08] bg-white/[0.025]' : 'border-white/[0.04] opacity-45',
                      )}
                    >
                      <span className="text-sm leading-none flex-shrink-0">{icon}</span>
                      <span className="text-[11px] font-mono text-white/55 flex-1">{label}</span>
                      <span className={clsx('text-[9px] font-mono uppercase tracking-widest flex-shrink-0', on ? 'text-neon-green/50' : 'text-white/15')}>
                        {on ? 'on' : 'off'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <Button
        fullWidth
        variant={saved ? 'neon-green' : 'neon-purple'}
        loading={saving || isLoading}
        onClick={handleSave}
      >
        {saved ? '✓ Saved' : 'Save Settings'}
      </Button>
    </motion.div>
  );
}
