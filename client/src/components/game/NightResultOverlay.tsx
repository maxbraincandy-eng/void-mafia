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
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onDismiss}
      >
        <motion.div
          initial={{ scale: 0.85, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.85, y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 25 }}
          className={
            noDeaths
              ? 'glass-card border border-neon-green/30 p-8 py-10 text-center max-w-md w-full shadow-[0_0_40px_rgba(0,255,136,0.12)]'
              : 'glass-card border border-neon-red/40 p-8 py-10 text-center max-w-md w-full shadow-[0_0_40px_rgba(255,45,85,0.2)]'
          }
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">{t.game.dawn.title}</p>

          {noDeaths ? (
            <>
              {/* Icon with pulsing glow ring */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute rounded-full"
                  style={{
                    width: '5rem',
                    height: '5rem',
                    background: result.saved
                      ? 'radial-gradient(circle, rgba(0,255,136,0.5), transparent 70%)'
                      : 'radial-gradient(circle, rgba(0,229,255,0.5), transparent 70%)',
                    filter: 'blur(8px)',
                  }}
                />
                <div className="text-5xl relative z-10">{result.saved ? '💊' : '🌅'}</div>
              </div>

              <h2 className="font-display text-2xl font-bold text-neon-green text-glow-green tracking-widest mb-2">
                {t.game.dawn.noDeaths}
              </h2>
              <p className="text-white/60 text-sm">
                {result.saved ? t.game.dawn.doctorSaved : t.game.dawn.quietNight}
              </p>
              <p className="text-white/40 text-xs font-mono mt-2">
                {result.saved ? 'The Doctor intervened' : 'The city survived the night'}
              </p>
            </>
          ) : (
            <>
              {/* Skull with pulsing red glow ring */}
              <div className="relative inline-flex items-center justify-center mb-6">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute rounded-full"
                  style={{
                    width: '5rem',
                    height: '5rem',
                    background: 'radial-gradient(circle, rgba(255,45,85,0.6), transparent 70%)',
                    filter: 'blur(8px)',
                  }}
                />
                <div className="text-5xl relative z-10">💀</div>
              </div>

              <h2 className="font-display text-2xl font-bold text-neon-red text-glow-red tracking-widest mb-4">
                {t.game.dawn.eliminated}
              </h2>
              <div className="space-y-2 mb-3">
                {result.killed.map(k => (
                  <div key={k.id} className="border-l-2 border-neon-red pl-3 py-1 text-left">
                    <p className="text-white font-semibold text-lg">{k.name}</p>
                  </div>
                ))}
              </div>
              <p className="text-white/40 text-xs font-mono">{t.game.dawn.foundDead}</p>
              <p className="text-white/30 text-xs font-mono mt-1">was found dead at dawn</p>
            </>
          )}

          <Button variant="secondary" className="mt-6" onClick={onDismiss} fullWidth>
            {t.game.dawn.continue}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
