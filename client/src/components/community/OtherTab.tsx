import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/store/langStore';
import { RecommendsTab } from '@/components/community/RecommendsTab';
import { ThoughtsTab } from '@/components/community/ThoughtsTab';
import { EventsTab } from '@/components/community/EventsTab';

type OtherSection = 'recommends' | 'thoughts' | 'events';

export function OtherTab(): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState<OtherSection | null>(null);

  const SECTIONS: { id: OtherSection; label: string; icon: string }[] = [
    { id: 'recommends', label: t.community.tabs.recommends, icon: '🎬' },
    { id: 'thoughts', label: t.community.tabs.thoughts, icon: '🧠' },
    { id: 'events', label: t.community.tabs.events, icon: '🗓' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {SECTIONS.map(sec => {
          const active = open === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setOpen(active ? null : sec.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-all flex-shrink-0 active:scale-95"
              style={{
                background: active ? 'linear-gradient(135deg, rgba(155,0,255,0.28), rgba(0,245,255,0.16))' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${active ? 'rgba(155,0,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: active ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              <span>{sec.icon}</span>{sec.label}
              <span className="text-[8px] ml-0.5">{active ? '▲' : '▼'}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key={open}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {open === 'recommends' && <RecommendsTab />}
            {open === 'thoughts' && <ThoughtsTab />}
            {open === 'events' && <EventsTab />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
