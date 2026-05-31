import { motion, AnimatePresence } from 'framer-motion';
import { NightResult } from '@/types/index';
import { Button } from '@/components/ui/Button';
import { useT } from '@/store/langStore';

interface Props {
  result: NightResult | null;
  onDismiss: () => void;
}

export function NightResultOverlay({ result, onDismiss }: Props) {
  const t = useT();
  if (!result) return null;

  const noDeaths = result.killed.length === 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 sm:p-6"
        style={{ background: 'rgba(0,0,8,0.88)', backdropFilter: 'blur(6px)' }}
        onClick={onDismiss}
      >
        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 60, opacity: 0, scale: 0.94 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="w-full max-w-sm"
          onClick={e => e.stopPropagation()}
        >
          {noDeaths ? (
            /* ── Quiet night / doctor saved ─────────────────────── */
            <div
              className="rounded-3xl border border-neon-green/20 overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, rgba(0,30,20,0.95) 0%, rgba(0,12,8,0.98) 100%)',
                boxShadow: '0 0 60px rgba(0,255,136,0.08), 0 24px 60px rgba(0,0,0,0.8)',
              }}
            >
              {/* Top accent bar */}
              <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-neon-green/60 to-transparent" />

              <div className="p-8 text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 mb-6">
                  {t.game.dawn.title}
                </p>

                {/* Icon */}
                <div className="relative inline-flex items-center justify-center mb-5">
                  <motion.div
                    animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.7, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    className="absolute rounded-full"
                    style={{
                      width: '80px', height: '80px',
                      background: result.saved
                        ? 'radial-gradient(circle, rgba(0,255,136,0.45), transparent 70%)'
                        : 'radial-gradient(circle, rgba(0,229,255,0.35), transparent 70%)',
                      filter: 'blur(10px)',
                    }}
                  />
                  <div className="text-5xl relative z-10">{result.saved ? '💊' : '🌅'}</div>
                </div>

                <h2
                  className="font-display text-2xl font-bold tracking-widest uppercase mb-2"
                  style={{ color: '#00ff88', textShadow: '0 0 20px rgba(0,255,136,0.6)' }}
                >
                  {t.game.dawn.noDeaths}
                </h2>
                <p className="text-white/50 text-sm">
                  {result.saved ? t.game.dawn.doctorSaved : t.game.dawn.quietNight}
                </p>

                <button
                  onClick={onDismiss}
                  className="mt-7 w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-xs font-mono tracking-widest hover:border-neon-green/30 hover:text-neon-green/70 transition-all"
                >
                  {t.game.dawn.continue}
                </button>
              </div>
            </div>
          ) : (
            /* ── Death card ──────────────────────────────────────── */
            <div
              className="rounded-3xl border border-neon-red/25 overflow-hidden"
              style={{
                background: 'linear-gradient(160deg, rgba(30,0,8,0.97) 0%, rgba(8,0,3,0.99) 100%)',
                boxShadow: '0 0 80px rgba(255,45,85,0.12), 0 0 160px rgba(255,45,85,0.05), 0 24px 60px rgba(0,0,0,0.9)',
              }}
            >
              {/* Scanline texture */}
              <div
                className="absolute inset-0 rounded-3xl pointer-events-none opacity-[0.03]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
                }}
              />

              {/* Top accent bar */}
              <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-neon-red/80 to-transparent" />

              <div className="p-8 text-center relative">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/25 mb-6">
                  {t.game.dawn.title}
                </p>

                {/* Skull icon with glow */}
                <div className="relative inline-flex items-center justify-center mb-6">
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.9, 0.4] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute rounded-full"
                    style={{
                      width: '90px', height: '90px',
                      background: 'radial-gradient(circle, rgba(255,45,85,0.55), transparent 70%)',
                      filter: 'blur(12px)',
                    }}
                  />
                  <div
                    className="text-6xl relative z-10"
                    style={{ filter: 'drop-shadow(0 0 16px rgba(255,45,85,0.9))' }}
                  >
                    💀
                  </div>
                </div>

                <h2
                  className="font-display text-xl font-bold tracking-[0.2em] uppercase mb-5"
                  style={{ color: '#ff2d55', textShadow: '0 0 20px rgba(255,45,85,0.7)' }}
                >
                  {t.game.dawn.eliminated}
                </h2>

                {/* Victim list */}
                <div className="space-y-3 mb-6">
                  {result.killed.map((k, i) => (
                    <motion.div
                      key={k.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.12, duration: 0.4 }}
                      className="relative rounded-2xl overflow-hidden"
                      style={{
                        background: 'rgba(255,45,85,0.06)',
                        border: '1px solid rgba(255,45,85,0.20)',
                      }}
                    >
                      {/* Red left edge */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-neon-red/60" />
                      <div className="px-4 py-3 pl-5 text-left">
                        <p className="font-display text-white font-bold text-xl tracking-wide">{k.name}</p>
                        <p className="text-[10px] font-mono text-white/30 mt-0.5 tracking-widest">
                          {t.game.dawn.foundDead}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <button
                  onClick={onDismiss}
                  className="w-full py-2.5 rounded-xl border border-neon-red/20 text-neon-red/50 text-xs font-mono tracking-widest hover:border-neon-red/40 hover:text-neon-red/80 hover:bg-neon-red/5 transition-all"
                >
                  {t.game.dawn.continue}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
