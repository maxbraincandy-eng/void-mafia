import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocialStore } from '@/store/socialStore';
import { useAuthStore } from '@/store/authStore';

const ACTION_CONFIG: Record<string, { color: string; borderColor: string; icon: string; label: string }> = {
  mod_ban:     { color: '#ff1e3c', borderColor: 'rgba(255,30,60,0.5)',   icon: '🚫', label: 'BAN'    },
  mod_kick:    { color: '#f97316', borderColor: 'rgba(249,115,22,0.5)',  icon: '👊', label: 'KICK'   },
  mod_mute:    { color: '#ff00aa', borderColor: 'rgba(255,0,170,0.45)',  icon: '🔇', label: 'MUTE'   },
  mod_warn:    { color: '#facc15', borderColor: 'rgba(250,204,21,0.45)', icon: '⚠️', label: 'WARN'   },
  mod_freeze:  { color: '#f97316', borderColor: 'rgba(249,115,22,0.5)',  icon: '🔒', label: 'FREEZE' },
  mod_rename:  { color: '#00e5ff', borderColor: 'rgba(0,229,255,0.4)',   icon: '✏️', label: 'RENAME' },
  mod_grant:   { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)',  icon: '⭐', label: 'GRANT'  },
  new_report:  { color: '#00e5ff', borderColor: 'rgba(0,229,255,0.4)',   icon: '📋', label: 'REPORT' },
  auto_flag:   { color: '#ff1e3c', borderColor: 'rgba(255,30,60,0.5)',   icon: '🚨', label: 'AUTO-FLAG' },
};

function getConfig(type: string) {
  return ACTION_CONFIG[type] ?? {
    color: '#00ff88',
    borderColor: 'rgba(0,255,136,0.4)',
    icon: '⚡',
    label: type.replace('mod_', '').toUpperCase().slice(0, 8),
  };
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ModAlertPanel() {
  const isMod = useAuthStore(s => s.profile?.isModerator ?? false);
  const modAlerts = useSocialStore(s => s.modAlerts);
  const dismissModAlert = useSocialStore(s => s.dismissModAlert);

  // Vibrate on new alert (mobile)
  useEffect(() => {
    if (modAlerts.length > 0 && isMod) {
      try { navigator.vibrate?.([60, 40, 60]); } catch { /* ignore */ }
    }
  }, [modAlerts.length, isMod]);

  if (!isMod) return null;

  const visible = modAlerts.slice(-4);

  return (
    <div className="fixed top-3 left-3 right-3 z-[250] space-y-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {visible.map(alert => {
          const cfg = getConfig(alert.type);
          return (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto rounded-xl flex items-start gap-2.5 px-3 py-2.5 shadow-lg"
              style={{
                background: 'rgba(6,3,20,0.97)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${cfg.borderColor}`,
                borderLeft: `3px solid ${cfg.color}`,
                boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.borderColor}`,
              }}
            >
              <span className="text-base flex-shrink-0 leading-none mt-0.5">{cfg.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="font-mono text-[12px] font-bold uppercase tracking-widest"
                    style={{ color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-white/25 font-mono text-[12px]">{fmtTime(alert.createdAt)}</span>
                </div>
                <p className="text-white/80 font-mono text-xs leading-snug">{alert.message}</p>
              </div>
              <button
                onClick={() => dismissModAlert(alert.id)}
                className="flex-shrink-0 text-white/20 hover:text-white/60 transition-colors text-base leading-none mt-0.5 w-5 h-5 flex items-center justify-center"
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
