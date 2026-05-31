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
          className="glass-card border border-neon-cyan/20 p-8 text-center max-w-sm w-full shadow-neon-cyan"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-4">{t.game.dawn.title}</p>

          {noDeaths ? (
            <>
              <div className="text-5xl mb-4">{result.saved ? '💊' : '🌅'}</div>
              <h2 className="font-display text-2xl font-bold text-neon-green text-glow-green tracking-widest mb-2">
                {t.game.dawn.noDeaths}
              </h2>
              <p className="text-white/60 text-sm">
                {result.saved ? t.game.dawn.doctorSaved : t.game.dawn.quietNight}
              </p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">💀</div>
              <h2 className="font-display text-2xl font-bold text-neon-red text-glow-red tracking-widest mb-2">
                {t.game.dawn.eliminated}
              </h2>
              <div className="space-y-1 mb-3">
                {result.killed.map(k => (
                  <p key={k.id} className="text-white font-semibold text-lg">{k.name}</p>
                ))}
              </div>
              <p className="text-white/40 text-xs font-mono">{t.game.dawn.foundDead}</p>
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
