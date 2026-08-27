/**
 * Sending a gift, and everybody watching it arrive.
 *
 * WHY A GIFT IS DRAWN BIG AND A HEART IS NOT
 * ──────────────────────────────────────────
 * A heart is free, so it is a texture — dozens float past and nobody reads any
 * one of them. A gift cost somebody coins, and the whole reason to send one is
 * that the host notices. Drawing it at the same weight as a heart would be
 * charging for a thing and then hiding it, which is the fastest way to make
 * people stop paying.
 *
 * So it crosses the middle of the screen at size, with the sender's name on it,
 * and the room sees the same animation at the same moment.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LIVE_GIFTS, liveGift, type LiveGift } from './liveGifts';
import type { LiveGiftEvent, LiveGifter } from '@/types/live';

const RED = '#ff2d55';
const GOLD = '#ffcc33';

/**
 * The picker.
 *
 * A grid rather than a list: eight things with prices are a thing you scan, and
 * every extra second between "I want to send that" and sending it is a gift
 * that does not get sent.
 *
 * The balance is on screen because the failure it prevents — tapping a crown
 * with six coins — is one the server has to refuse, and being refused feels
 * like the app is broken even when it is being correct.
 */
export function LiveGiftPicker({ balance, onPick, onClose, busy, error }: {
  balance: number | null;
  onPick: (gift: LiveGift) => void;
  onClose: () => void;
  busy: string | null;
  error: string | null;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[712] flex items-end" style={{ background: 'rgba(4,2,10,0.72)' }}
      onClick={onClose}>
      <motion.div initial={{ y: 70 }} animate={{ y: 0 }} exit={{ y: 70 }} onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-4 pt-4 pb-8"
        style={{ background: 'rgba(16,9,20,0.99)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.2)' }} />

        <div className="flex items-baseline justify-between mb-1 px-1">
          <p className="font-display font-bold text-white text-[15px]">საჩუქრის გაგზავნა</p>
          <p className="font-mono text-[11.5px]" style={{ color: GOLD }}>
            🪙 {balance === null ? '…' : balance}
          </p>
        </div>
        <p className="font-mono text-[10.5px] text-white/35 mb-3 px-1">
          ქოინები ეთერის დასრულებისას ჩაერიცხება ჰოსტს
        </p>

        <div className="grid grid-cols-4 gap-2">
          {LIVE_GIFTS.map(g => {
            const afford = balance === null || balance >= g.price;
            return (
              <button key={g.id} onClick={() => afford && !busy && onPick(g)}
                disabled={!!busy || !afford}
                className="rounded-2xl py-3 flex flex-col items-center gap-1 transition-transform active:scale-95"
                style={{
                  background: `${g.color}14`,
                  border: `1px solid ${afford ? `${g.color}55` : 'rgba(255,255,255,0.07)'}`,
                  opacity: afford ? 1 : 0.38,
                  cursor: afford ? 'pointer' : 'not-allowed',
                }}>
                <span style={{ fontSize: 26, lineHeight: 1, opacity: busy === g.id ? 0.4 : 1 }}>{g.icon}</span>
                <span className="font-mono text-[9px] text-white/55 text-center leading-tight px-0.5">{g.name}</span>
                <span className="font-mono font-bold text-[10.5px]" style={{ color: afford ? GOLD : 'rgba(255,255,255,0.4)' }}>
                  {g.price} 🪙
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="font-mono text-[11px] mt-3 text-center" style={{ color: '#ff8a92' }}>{error}</p>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Gifts crossing the screen.
 *
 * Stacked upward from the middle so several arriving at once do not land on top
 * of one another — a host who is being showered should see a column of them,
 * not one smeared shape.
 */
export function LiveGiftBurst({ gifts }: { gifts: (LiveGiftEvent & { key: number })[] }) {
  return (
    <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: '30dvh', zIndex: 30 }}>
      <AnimatePresence>
        {gifts.map((g, i) => {
          const meta = liveGift(g.giftId);
          return (
            <motion.div key={g.key}
              initial={{ opacity: 0, scale: 0.4, x: -60 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 1], x: [-60, 0, 0, 24] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 4, times: [0, 0.14, 0.78, 1], ease: 'easeOut' }}
              className="flex items-center gap-2.5 mx-4 mb-2 px-3 py-2 rounded-2xl w-fit"
              style={{
                background: `linear-gradient(90deg, ${meta.color}33, rgba(0,0,0,0.55))`,
                border: `1px solid ${meta.color}88`,
                boxShadow: `0 6px 26px ${meta.color}33`,
                marginBottom: i * 2,
              }}
            >
              <span style={{ fontSize: 30, lineHeight: 1 }}>{meta.icon}</span>
              <span>
                <span className="block font-display font-bold text-white text-[12.5px] leading-tight">
                  {g.senderName}
                </span>
                <span className="block font-mono text-[10.5px]" style={{ color: meta.color }}>
                  {meta.name} · {g.coins} 🪙
                </span>
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Who sent the most.
 *
 * Shown to the host while they are on air and to everybody on the summary. By
 * coins rather than by taps, because that is what the host is being asked to
 * notice: four white roses and one crown are the same number of presses and not
 * the same gesture.
 */
export function GifterList({ gifters, empty }: { gifters: LiveGifter[]; empty?: string }) {
  if (gifters.length === 0) {
    return <p className="font-mono text-[11.5px] text-white/35 py-6 text-center">{empty ?? 'ჯერ არავის გამოუგზავნია'}</p>;
  }
  return (
    <>
      {gifters.map((g, i) => (
        <div key={g.userId} className="flex items-center gap-3 py-2">
          <span className="font-mono font-bold text-[11px] w-4 flex-shrink-0"
            style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
          <span style={{
            width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            background: 'linear-gradient(135deg, #9b00ff, #00f5ff)',
            border: i === 0 ? `1.5px solid ${GOLD}` : '1px solid rgba(255,255,255,0.14)',
          }}>
            {g.avatarUrl
              ? <img src={g.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : g.avatar}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-mono text-[12.5px] text-white/85 truncate">{g.name}</span>
            <span className="block font-mono text-[9.5px] text-white/30">{g.gifts} საჩუქარი</span>
          </span>
          <span className="font-mono font-bold text-[12px] flex-shrink-0" style={{ color: GOLD }}>
            {g.coins} 🪙
          </span>
        </div>
      ))}
    </>
  );
}

/** The gift button, with the coin cost of the cheapest thing behind it. */
export function GiftButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label="საჩუქარი"
      className="w-11 h-11 rounded-full flex items-center justify-center text-[19px] flex-shrink-0 transition-transform active:scale-90 disabled:opacity-40"
      style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${GOLD}77` }}>🎁</button>
  );
}

/** Hook-free helper for a screen that needs its own picker state. */
export function useGiftPicker(send: (giftId: string) => Promise<string | null>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (gift: LiveGift) => {
    setBusy(gift.id);
    setError(null);
    const problem = await send(gift.id);
    setBusy(null);
    // Sent: close, so the next tap is on the video rather than the sheet. Not
    // sent: stay open with the reason, because the reason is usually "top up"
    // and closing would hide it behind the thing they were watching.
    if (problem) setError(problem);
    else setOpen(false);
  };

  return {
    open,
    busy,
    error,
    pick,
    show: () => { setError(null); setOpen(true); },
    hide: () => setOpen(false),
  };
}
