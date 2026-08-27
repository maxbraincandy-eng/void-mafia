/**
 * Live, from anywhere in the app.
 *
 * WHY THIS IS GLOBAL AND NOT IN THE FEED
 * ──────────────────────────────────────
 * The LIVE ring renders on every avatar in the app — a lobby, a friend list, a
 * search result, a profile — and tapping one calls `requestWatch`. But the
 * viewer that answers that request was mounted inside the feed, so anywhere
 * else the tap set a flag nobody was reading and the ring did nothing. A badge
 * that promises a stream and opens nothing is worse than no badge.
 *
 * So it sits beside the other global overlays in `App.tsx`, with the DM panel
 * and the game invites, for the same reason they are there.
 *
 * THE INVITATION
 * ──────────────
 * A broadcast nobody is watching is the failure mode of the whole feature. The
 * strip catches whoever happens to be looking at the feed; this reaches the
 * people who follow the host wherever they are, and one tap puts them in.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveStore } from '@/store/liveStore';
import { LiveViewer } from './LiveViewer';
import { LiveDot } from './LiveStrip';

const RED = '#ff2d55';
/** Long enough to read a name and decide, short enough not to sit on the UI. */
const TOAST_MS = 7_000;

export function LiveOverlay() {
  const watching = useLiveStore(s => s.watchRequest);
  const clearWatch = useLiveStore(s => s.clearWatchRequest);
  const invite = useLiveStore(s => s.invite);
  const clearInvite = useLiveStore(s => s.clearInvite);

  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(clearInvite, TOAST_MS);
    return () => clearTimeout(t);
  }, [invite, clearInvite]);

  return (
    <>
      <AnimatePresence>
        {invite && !watching && (
          <motion.button
            key={invite.sessionId}
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            onClick={() => { useLiveStore.getState().requestWatch(invite.sessionId); clearInvite(); }}
            className="fixed left-1/2 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl"
            style={{
              // Below the viewer's own z-index: an invitation must never cover
              // the stream it invited you to.
              zIndex: 690,
              top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
              transform: 'translateX(-50%)',
              width: 'min(92vw, 360px)',
              background: 'rgba(18,7,14,0.97)',
              border: `1px solid ${RED}66`,
              boxShadow: `0 10px 34px rgba(0,0,0,0.5), 0 0 0 1px ${RED}22`,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `${RED}22`, border: `1px solid ${RED}88`,
              animation: 'liveRingPulse 1.8s ease-in-out infinite',
            }}><LiveDot size={15} /></span>

            <span className="flex-1 min-w-0">
              <span className="block font-display font-bold text-white text-[13px] truncate">
                {invite.hostName} ეთერშია
              </span>
              <span className="block font-mono text-[10.5px] text-white/45 truncate">
                {invite.title || 'შეუერთდი ახლავე'}
              </span>
            </span>

            <span className="px-2.5 py-1 rounded-lg font-mono font-bold text-[10.5px] text-white flex-shrink-0"
              style={{ background: RED }}>ყურება</span>

            <span
              role="button"
              aria-label="დახურვა"
              onClick={e => { e.stopPropagation(); clearInvite(); }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 text-[12px] flex-shrink-0"
            >✕</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {watching && <LiveViewer key={watching} sessionId={watching} onClose={clearWatch} />}
      </AnimatePresence>
    </>
  );
}
