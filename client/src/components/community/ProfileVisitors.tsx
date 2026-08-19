import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { emitWithAck } from '@/lib/socket';
import type { Res } from '@/types/index';
import { Avatar, timeAgo } from '@/components/community/shared';
import { PlayerName } from '@/components/ui/PlayerName';
import { VipSheet } from '@/components/ui/VipSheet';

/**
 * Who has looked at your profile.
 *
 * The COUNT is shown to everyone and the NAMES only to verified accounts. That
 * split is the whole design: a locked panel that also hides the number gives a
 * free user nothing to be curious about, and curiosity is the only thing that
 * makes this perk worth buying. The server decides which half you get — the
 * client only renders what it is handed, so hiding the list here is not the
 * thing keeping it private.
 */
interface Visitor {
  id: string; username: string; avatar: string | null; avatarUrl: string | null;
  lastAt: number; views: number; tier: 'free' | 'vip' | 'owner';
}

export function ProfileVisitors() {
  const [data, setData] = useState<{
    locked: boolean; counts: { total: number; week: number }; visitors: Visitor[];
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    emitWithAck<undefined, Res<{ locked: boolean; counts: { total: number; week: number }; visitors: Visitor[] }>>('vip:visitors')
      .then(r => { if (!cancelled && r.ok) setData(r.data); })
      .catch(() => { /* the panel simply does not appear */ });
    return () => { cancelled = true; };
  }, []);

  // Nobody has visited yet: an empty box that says "0" is worse than no box.
  if (!data || data.counts.total === 0) return null;

  const { locked, counts, visitors } = data;

  return (
    <>
      <button
        onClick={() => (locked ? setPitch(true) : setOpen(o => !o))}
        className="w-full mb-3 px-3 py-2.5 rounded-2xl flex items-center gap-2.5 active:scale-[0.99] transition-transform"
        style={{
          background: locked ? 'rgba(167,139,250,0.07)' : 'rgba(255,255,255,0.025)',
          border: `1px solid ${locked ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        <span style={{ fontSize: 17 }}>{locked ? '🔒' : '👁'}</span>
        <div className="min-w-0 flex-1 text-left">
          <p className="font-display font-bold text-white" style={{ fontSize: 13, lineHeight: 1.2 }}>
            {/* Georgian takes no plural after a numeral — one form is correct for both. */}
            {counts.total} ადამიანმა დაათვალიერა პროფილი
          </p>
          <p className="font-mono text-white/35" style={{ fontSize: 11 }}>
            {counts.week} ბოლო კვირაში{locked ? ' · ვინ — ვერიფიცირებულებისთვის' : ''}
          </p>
        </div>
        <span className="font-mono text-white/25" style={{ fontSize: 11 }}>{locked ? '💠' : open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && !locked && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="flex flex-col gap-1">
              {visitors.map(v => (
                <div key={v.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <Avatar avatar={v.avatar ?? '?'} avatarUrl={v.avatarUrl} size={30} />
                  <div className="min-w-0 flex-1">
                    <PlayerName profileId={v.id} name={v.username} className="font-display font-bold text-white truncate" style={{ fontSize: 12.5 }} />
                    <p className="font-mono text-white/28" style={{ fontSize: 10.5 }}>
                      {timeAgo(v.lastAt)}{v.views > 1 ? ` · ${v.views}×` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VipSheet open={pitch} onClose={() => setPitch(false)} />
    </>
  );
}
