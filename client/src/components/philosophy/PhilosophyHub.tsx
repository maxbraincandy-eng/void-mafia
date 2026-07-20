import { useState } from 'react';
import { createPortal } from 'react-dom';
import { PhilosophyPlayer } from './PhilosophyPlayer';
import { PhilosopherIcon } from './PhilosopherIcon';
import { PHILOSOPHIES, PHILO_TEASERS } from './registry';

/**
 * Full-screen hub for the Philosophy category — same shape as the Dilemmas hub:
 * a header and a scrollable list of thought-experiment cards. Playable ones open
 * the PhilosophyPlayer; upcoming ones show greyed as "მალე". New experiments
 * appear here automatically by adding them to the registry.
 */
export function PhilosophyHub({ onClose }: { onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openScenario = openId ? PHILOSOPHIES.find(d => d.id === openId) ?? null : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[490] flex flex-col select-none"
      style={{ background: 'radial-gradient(ellipse 100% 55% at 50% 0%, #12122e, #06060f 60%)' }}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-3 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <PhilosopherIcon size={44} className="flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display font-bold tracking-wide text-xl" style={{ color: '#c3b8ff' }}>ფილოსოფიური ცდები</h1>
            <p className="font-mono text-[12px] text-white/40 leading-tight">აზროვნების ექსპერიმენტები · აღმოაჩინე შენი პოზიცია</p>
          </div>
        </div>
        <button onClick={onClose} className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-xl" style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}>✕</button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-4">
        {PHILOSOPHIES.map(d => (
          <button
            key={d.id}
            onClick={() => setOpenId(d.id)}
            className="w-full text-left rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
            style={{ border: `1px solid ${d.accent}55`, boxShadow: `0 6px 30px ${d.accent}18` }}
          >
            <div style={{ height: 128, background: `linear-gradient(135deg, ${d.accent}33, rgba(10,10,26,0.6))`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <span style={{ fontSize: 56, filter: `drop-shadow(0 4px 18px ${d.accent}88)` }}>{d.emoji}</span>
              <span style={{ position: 'absolute', top: 12, right: 12, fontFamily: 'monospace', fontSize: 9, letterSpacing: 1, color: '#fff', background: 'rgba(124,58,237,0.9)', borderRadius: 8, padding: '3px 8px' }}>NEW</span>
            </div>
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(12,12,26,0.9)' }}>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-white text-[15px] leading-tight">{d.title}</p>
                <p className="font-mono text-[12px] text-white/40">{d.subtitle}</p>
              </div>
              <span className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider flex-shrink-0"
                style={{ background: `${d.accent}1e`, border: `1px solid ${d.accent}66`, color: d.accent }}>
                დაწყება
              </span>
            </div>
          </button>
        ))}

        {/* Upcoming (greyed) */}
        {PHILO_TEASERS.map(d => (
          <div key={d.id} className="w-full rounded-2xl overflow-hidden opacity-45" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ height: 110, background: 'linear-gradient(135deg, rgba(60,60,80,0.4), rgba(10,10,20,0.5))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 46, filter: 'grayscale(1)' }}>{d.emoji}</span>
            </div>
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(12,12,26,0.9)' }}>
              <div className="flex-1 min-w-0">
                <p className="font-display font-bold text-white/70 text-[15px] leading-tight">{d.title}</p>
                <p className="font-mono text-[12px] text-white/30">{d.subtitle}</p>
              </div>
              <span className="px-4 py-2 rounded-xl font-mono text-xs uppercase tracking-wider flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}>
                მალე
              </span>
            </div>
          </div>
        ))}

        <p className="font-mono text-[11px] text-white/25 leading-relaxed text-center px-2 pt-2">
          ცნობილი ფილოსოფიური ცდები — სწორი პასუხი არ არსებობს. მიჰყევი შენს ინტუიციას და აღმოაჩინე, რომელ სკოლას ეკუთვნი.
        </p>
      </div>

      {openScenario && <PhilosophyPlayer scenario={openScenario} onClose={() => setOpenId(null)} />}
    </div>,
    document.body,
  );
}
