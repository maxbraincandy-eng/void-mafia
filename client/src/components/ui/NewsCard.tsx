import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NewsItem {
  id: string;
  date: string;
  text: string;
  tag?: 'event' | 'update' | 'promo';
}

const NEWS: NewsItem[] = [
  {
    id: '1',
    date: '2026-06-14',
    tag: 'event',
    text: 'მოთამაშე, რომელიც თავის რეფერალ კოდით შემოიყვანს 50 მოთამაშეს, სასახუქრე ქოინებთან ერთად გადაეცემა ადმინის პრივილეგია.',
  },
];

const TAG_STYLES = {
  event:  { label: 'ღონისძიება', color: '#ff00cc', bg: 'rgba(255,0,204,0.1)',  border: 'rgba(255,0,204,0.25)' },
  update: { label: 'განახლება',  color: '#00e5ff', bg: 'rgba(0,229,255,0.1)',  border: 'rgba(0,229,255,0.25)' },
  promo:  { label: 'პრომო',      color: '#ffd700', bg: 'rgba(255,215,0,0.1)',  border: 'rgba(255,215,0,0.25)' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('ka-GE', { day: 'numeric', month: 'short' });
}

export function NewsCard() {
  const [expanded, setExpanded] = useState<string | null>(NEWS[0]?.id ?? null);

  if (!NEWS.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl mb-4 overflow-hidden"
      style={{
        background: 'rgba(138,43,226,0.04)',
        border: '1px solid rgba(138,43,226,0.18)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid rgba(138,43,226,0.1)' }}
      >
        <span style={{ fontSize: 12 }}>📰</span>
        <p className="text-[8px] font-display font-bold tracking-[0.25em] uppercase text-white/25 flex-1">
          სიახლეები
        </p>
        <span
          className="text-[8px] font-mono px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(138,43,226,0.15)', border: '1px solid rgba(138,43,226,0.3)', color: '#c084fc' }}
        >
          {NEWS.length}
        </span>
      </div>

      {/* Items */}
      <div className="divide-y" style={{ borderColor: 'rgba(138,43,226,0.08)' }}>
        {NEWS.map(item => {
          const isOpen = expanded === item.id;
          const tag = item.tag ? TAG_STYLES[item.tag] : null;
          return (
            <button
              key={item.id}
              onClick={() => setExpanded(isOpen ? null : item.id)}
              className="w-full text-left px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {tag && (
                      <span
                        className="text-[7px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ color: tag.color, background: tag.bg, border: `1px solid ${tag.border}` }}
                      >
                        {tag.label}
                      </span>
                    )}
                    <span className="text-[8px] font-mono text-white/20">{formatDate(item.date)}</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.p
                        key="open"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-[11px] font-mono text-white/65 leading-relaxed"
                      >
                        {item.text}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="closed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[11px] font-mono text-white/40 truncate"
                      >
                        {item.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <span
                  className="text-white/20 flex-shrink-0 mt-0.5 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 10 }}
                >
                  ›
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
