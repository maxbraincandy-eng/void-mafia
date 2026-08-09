import { motion } from 'framer-motion';
import { useT } from '@/store/langStore';
import { GamesTab } from '@/components/community/GamesTab';
import { VoidGamesIcon } from '@/components/ui/VoidGamesIcon';

export function GamesPage({ onOpenSpace, onOpenBackrooms, onOpenPremium }: { onOpenSpace?: () => void; onOpenBackrooms?: () => void; onOpenPremium?: () => void }) {
  const t = useT();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
      className="min-h-screen"
      style={{ background: 'var(--bg-main)' }}
    >
      {/* Header */}
      <div
        className="sticky z-10 px-4 pt-4 pb-3 safe-top-pos"
        style={{
          background: 'var(--vm-header-bg)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--vm-header-border)',
        }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <VoidGamesIcon size={22} color="var(--vm-games-color)" />
          <div>
            <h1
              className="font-display font-bold text-lg leading-none"
              style={{ color: 'var(--vm-games-color)', textShadow: 'var(--vm-games-shadow)' }}
            >
              {t.nav.games}
            </h1>
            {/* One line, always: at 12px + widest tracking this wrapped onto a
                third row on a phone and pushed the whole catalogue down. */}
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/25 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
              ინტელექტი · სტრატეგია · სოციალური
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        <GamesTab onOpenSpace={onOpenSpace} onOpenBackrooms={onOpenBackrooms} onOpenPremium={onOpenPremium} />
      </div>
    </motion.div>
  );
}
