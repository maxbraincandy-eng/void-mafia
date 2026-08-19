import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIncognitoStore } from '@/store/incognitoStore';
import { useMyLimits } from '@/store/vipStore';
import { VipSheet } from '@/components/ui/VipSheet';
import { VoiceDisguisePicker } from '@/components/game/VoiceDisguisePicker';

/**
 * The voice changer, for any game with voice chat.
 *
 * The mafia lobby has the fuller panel — there it can hide your name as well,
 * because there is a seat on a server to hide. Everywhere else the name is not
 * a secret and only the voice is, so this is just the picker behind one button.
 *
 * The choice is the same one: pick a voice here and the mafia lobby already has
 * it selected, because both read the single store that owns it.
 *
 * Shown to free accounts too, locked, opening the pitch instead — a perk nobody
 * knows exists sells nothing.
 */
export function VoiceDisguiseButton({ compact = false }: { compact?: boolean }) {
  const limits = useMyLimits();
  const allowed = limits.liveDisguise;
  const voice = useIncognitoStore(s => s.voice);
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState(false);

  return (
    <>
      <button
        onClick={() => (allowed ? setOpen(o => !o) : setPitch(true))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono transition-all active:scale-95 flex-shrink-0"
        style={{
          fontSize: 11,
          border: `1px solid ${voice ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.12)'}`,
          background: voice ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
          color: voice ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
        }}
      >
        <span style={{ fontSize: 13 }}>{allowed ? (voice ? '🎭' : '🎙') : '🔒'}</span>
        {compact ? '' : 'ხმის შეცვლა'}
      </button>

      <AnimatePresence>
        {open && allowed && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="overflow-hidden w-full"
          >
            <div
              className="mt-2 rounded-2xl p-3"
              style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.22)' }}
            >
              <VoiceDisguisePicker />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VipSheet open={pitch} onClose={() => setPitch(false)} />
    </>
  );
}
