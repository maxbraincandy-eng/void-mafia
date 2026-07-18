import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import { haptic } from '@/lib/haptics';
import type { DilemmaScenario, DilemmaChoice, DilemmaTally, DilemmaEnding } from './types';

/**
 * Generic player for any moral-dilemma scenario. Tracks the deon/util tally
 * and flags, then shows the scenario's computed ending ("ethical fingerprint").
 */
export function DilemmaPlayer({ scenario, onClose }: { scenario: DilemmaScenario; onClose: () => void }) {
  const accent = scenario.accent;
  const sceneMap = useMemo(() => new Map(scenario.scenes.map(s => [s.id, s])), [scenario]);

  const [sceneId, setSceneId] = useState(scenario.start);
  const [tally, setTally] = useState<DilemmaTally>({ deon: 0, util: 0 });
  const [flags, setFlags] = useState<Record<string, string | boolean>>({});
  const [ending, setEnding] = useState<DilemmaEnding | null>(null);

  const scene = sceneMap.get(sceneId) ?? null;

  const pick = (c: DilemmaChoice) => {
    SFX.click();
    haptic('selection');
    const nextTally = { ...tally };
    if (c.ethic === 'deon') nextTally.deon += 1;
    else if (c.ethic === 'util') nextTally.util += 1;
    const nextFlags = { ...flags, ...(c.setFlags ?? {}) };
    setTally(nextTally);
    setFlags(nextFlags);
    if (c.next === '@end') {
      setEnding(scenario.resolve(nextTally, nextFlags));
      SFX.phaseTransition();
      haptic('success');
    } else {
      setSceneId(c.next);
    }
  };

  const restart = () => {
    setSceneId(scenario.start);
    setTally({ deon: 0, util: 0 });
    setFlags({});
    setEnding(null);
  };

  const total = Math.max(1, tally.deon + tally.util);
  const utilPct = Math.round((tally.util / total) * 100);

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex flex-col select-none"
      style={{ background: 'radial-gradient(ellipse 90% 60% at 50% 0%, #12132e, #05060f 65%)', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${accent}22` }}>
        <span className="text-[13px] font-bold tracking-[0.15em] flex items-center gap-1.5" style={{ color: accent }}>
          {scenario.emoji} {scenario.title}
        </span>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: `${accent}99`, border: `1px solid ${accent}33` }}>✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-xl mx-auto">
          {ending ? (
            <div className="text-center pt-8">
              <p className="text-6xl mb-4">{ending.emoji}</p>
              <p className="text-[11px] tracking-[0.3em] uppercase mb-1" style={{ color: `${accent}88` }}>შენი ეთიკური ხელწერა</p>
              <p className="text-2xl font-bold mb-5" style={{ color: ending.color, textShadow: `0 0 18px ${ending.color}55` }}>{ending.label}</p>

              {/* deon vs util meter */}
              <div className="max-w-[320px] mx-auto mb-6">
                <div className="flex justify-between text-[11px] mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span>დეონტოლოგია · {tally.deon}</span>
                  <span>{tally.util} · უტილიტარიზმი</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div style={{ width: `${100 - utilPct}%`, background: '#e8dcc8' }} />
                  <div style={{ width: `${utilPct}%`, background: accent }} />
                </div>
              </div>

              <p className="text-[14px] leading-[1.8] whitespace-pre-wrap mb-8" style={{ color: 'rgba(232,228,240,0.9)' }}>{ending.body}</p>
              <div className="flex flex-col gap-2.5 items-stretch max-w-[280px] mx-auto">
                <button onClick={restart} className="px-6 py-3 rounded-xl font-bold text-[14px]" style={{ background: `${accent}1e`, border: `1px solid ${accent}66`, color: accent }}>
                  თავიდან — სხვა არჩევანით →
                </button>
                <button onClick={onClose} className="px-6 py-3 rounded-xl font-mono text-[13px]" style={{ border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                  გამოსვლა
                </button>
              </div>
            </div>
          ) : scene ? (
            <>
              {scene.title && (
                <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: `${accent}77` }}>▌{scene.title}</p>
              )}
              {scene.speaker && (
                <p className="text-[13px] font-bold mb-2" style={{ color: accent }}>{scene.speaker}:</p>
              )}
              <p className="text-[15.5px] leading-[1.85] whitespace-pre-wrap mb-8" style={{ color: '#e8e4f0' }}>{scene.text}</p>
              <div className="space-y-2.5">
                {scene.choices.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => pick(c)}
                    className="w-full text-left px-4 py-3.5 rounded-xl text-[14px] leading-relaxed transition-all active:scale-[0.99]"
                    style={{ color: '#dfe0ff', border: `1px solid ${accent}30`, background: `${accent}0c` }}
                  >
                    {c.text}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: '#ff6b6b' }}>სცენა ვერ მოიძებნა.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
