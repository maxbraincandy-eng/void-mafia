import { motion, AnimatePresence } from 'framer-motion';
import { ActiveEvent } from '@/types/index';

interface Props {
  event: ActiveEvent | null;
}

const EVENT_COLORS: Record<string, { border: string; bg: string; glow: string; text: string }> = {
  blackout_night:       { border: 'rgba(120,60,200,0.55)', bg: 'rgba(30,0,70,0.75)', glow: '0 0 28px rgba(120,60,200,0.45)', text: '#c084fc' },
  blood_moon:           { border: 'rgba(210,30,55,0.55)', bg: 'rgba(55,0,10,0.75)', glow: '0 0 28px rgba(210,30,55,0.45)', text: '#f87171' },
  sheriff_fog:          { border: 'rgba(90,120,155,0.45)', bg: 'rgba(15,25,45,0.75)', glow: '0 0 22px rgba(90,120,155,0.3)', text: '#94a3b8' },
  doctor_pressure:      { border: 'rgba(0,190,145,0.5)', bg: 'rgba(0,40,30,0.75)', glow: '0 0 24px rgba(0,190,145,0.35)', text: '#34d399' },
  silent_day:           { border: 'rgba(80,80,130,0.5)', bg: 'rgba(18,18,40,0.75)', glow: '0 0 22px rgba(80,80,130,0.3)', text: '#a5b4fc' },
  double_vote:          { border: 'rgba(245,158,0,0.55)', bg: 'rgba(45,25,0,0.75)', glow: '0 0 28px rgba(245,158,0,0.35)', text: '#fbbf24' },
  no_reveal_day:        { border: 'rgba(155,0,220,0.5)', bg: 'rgba(38,0,58,0.75)', glow: '0 0 26px rgba(155,0,220,0.35)', text: '#c084fc' },
  anonymous_voting:     { border: 'rgba(55,55,80,0.5)', bg: 'rgba(12,12,22,0.75)', glow: '0 0 18px rgba(55,55,80,0.28)', text: '#94a3b8' },
  extended_final_words: { border: 'rgba(215,75,0,0.55)', bg: 'rgba(48,12,0,0.75)', glow: '0 0 28px rgba(215,75,0,0.35)', text: '#fb923c' },
};

const DEFAULT_COLOR = { border: 'rgba(0,229,255,0.4)', bg: 'rgba(0,25,35,0.75)', glow: '0 0 24px rgba(0,229,255,0.3)', text: '#22d3ee' };

export function DynamicEventBanner({ event }: Props) {
  const colors = event ? (EVENT_COLORS[event.key] ?? DEFAULT_COLOR) : DEFAULT_COLOR;

  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.key + '-' + event.day}
          initial={{ opacity: 0, y: -14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl border mx-0"
          style={{
            background: colors.bg,
            borderColor: colors.border,
            boxShadow: colors.glow,
            backdropFilter: 'blur(14px)',
          }}
        >
          <span className="text-xl flex-shrink-0 leading-none">{event.icon}</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-mono tracking-[0.22em] uppercase font-bold leading-none mb-0.5"
              style={{ color: colors.text, textShadow: `0 0 10px ${colors.text}` }}
            >
              {event.label}
            </p>
            <p className="text-[11px] font-mono text-white/50 leading-tight truncate">
              {event.description}
            </p>
          </div>
          <span
            className="flex-shrink-0 text-[9px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded-full border"
            style={{ borderColor: colors.border, color: colors.text }}
          >
            Active
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
