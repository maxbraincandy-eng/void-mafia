import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIncognitoStore } from '@/store/incognitoStore';
import { useMyLimits } from '@/store/vipStore';
import { VipSheet } from '@/components/ui/VipSheet';
import { VoiceDisguisePicker } from '@/components/game/VoiceDisguisePicker';

/**
 * The lobby's incognito control — verified only.
 *
 * Two halves, deliberately separate: hiding your NAME is a request to the
 * server, hiding your VOICE happens in this browser before anything is
 * published. Someone may well want one without the other — an alias with your
 * own voice fools nobody who has played with you, and your own name with a
 * different voice is just a costume — so neither implies the other, and the
 * panel says which one is actually on.
 *
 * The preview is not decoration. A voice you have not heard is a voice you will
 * not trust enough to use, and hearing yourself is the only way to know the
 * disguise is working.
 */

export function IncognitoPanel() {
  // Read from the same table the server enforces, rather than from "am I a
  // VIP" — one edit in vipService then moves the gate and the pitch together.
  const limits = useMyLimits();
  const vip = limits.incognito || limits.liveDisguise;
  const { hideName, alias, voice, busy, error, setNameHidden, clearError } = useIncognitoStore();
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState(false);

  const on = hideName || !!voice;

  return (
    <>
      <button
        onClick={() => (vip ? setOpen(o => !o) : setPitch(true))}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono transition-all active:scale-95"
        style={{
          fontSize: 11,
          border: `1px solid ${on ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.12)'}`,
          background: on ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
          color: on ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
        }}
      >
        <span style={{ fontSize: 13 }}>{vip ? (on ? '🕶' : '🎭') : '🔒'}</span>
        ინკოგნიტო
        {on && <span style={{ opacity: 0.7 }}>· {hideName && voice ? 'ორივე' : hideName ? 'სახელი' : 'ხმა'}</span>}
      </button>

      <AnimatePresence>
        {open && vip && (
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
              {/* ── name ── */}
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-white" style={{ fontSize: 12.5 }}>სახელის დამალვა</p>
                  <p className="font-mono text-white/35" style={{ fontSize: 10.5, lineHeight: 1.4 }}>
                    {hideName && alias
                      ? <>ოთახი გხედავს როგორც <span style={{ color: '#c4b5fd' }}>{alias}</span></>
                      : 'ბეჯი, ფერი და პროფილიც იმალება'}
                  </p>
                </div>
                <button
                  onClick={() => void setNameHidden(!hideName)}
                  disabled={busy}
                  className="flex-shrink-0 rounded-full transition-all active:scale-95 disabled:opacity-50"
                  style={{
                    width: 46, height: 26,
                    background: hideName ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${hideName ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.16)'}`,
                  }}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    className="block rounded-full"
                    style={{
                      width: 20, height: 20, margin: '2px',
                      marginLeft: hideName ? 23 : 2,
                      background: hideName ? '#fff' : 'rgba(255,255,255,0.5)',
                    }}
                  />
                </button>
              </div>

              <div className="my-2.5" style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

              {/* ── voice ── */}
              <VoiceDisguisePicker />

              {error && (
                <p
                  className="font-mono mt-2 text-center"
                  style={{ fontSize: 10.5, color: '#ff5f6d' }}
                  onClick={clearError}
                >{error}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <VipSheet open={pitch} onClose={() => setPitch(false)} />
    </>
  );
}
