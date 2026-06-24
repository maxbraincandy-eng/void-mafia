import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { AnimatePresence, motion } from 'framer-motion';

const ASKED_KEY = 'vm-notif-asked';

export function NotificationPrompt() {
  const isAuthed = useAuthStore(s => s.isAuthed);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAuthed) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (localStorage.getItem(ASKED_KEY)) return;

    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [isAuthed]);

  const dismiss = () => {
    localStorage.setItem(ASKED_KEY, '1');
    setVisible(false);
  };

  const allow = async () => {
    localStorage.setItem(ASKED_KEY, '1');
    setVisible(false);
    await Notification.requestPermission();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed left-4 right-4 z-[300] rounded-2xl p-4 flex gap-3 items-start"
          style={{
            bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
            background: 'rgba(3, 0, 19, 0.97)',
            border: '1px solid rgba(0, 245, 255, 0.2)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}
          >
            🔔
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-[13px] text-white leading-tight mb-1">
              Enable Notifications
            </p>
            <p className="font-mono text-[11px] text-white/50 leading-snug">
              Get notified when it's your turn, someone DMs you, or your game is starting.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={allow}
                className="px-4 py-1.5 rounded-lg font-display font-bold text-[11px] tracking-widest uppercase border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan active:scale-95 transition-all"
              >
                Allow
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-1.5 rounded-lg font-mono text-[11px] text-white/30 active:scale-95 transition-all"
              >
                Not now
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
