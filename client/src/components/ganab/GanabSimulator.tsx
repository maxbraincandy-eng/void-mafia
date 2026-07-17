import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFX } from '@/lib/audioEngine';
import type { GanabState, GanabChoice } from './types';
import { RANK_LABELS } from './types';
import {
  newGame, getScene, visibleChoices, applyChoice, fillText,
  loadGame, saveGame, clearSave, getGraveyard,
} from './engine';

/**
 * განაბ სიმულატორი — text roguelike. Terminal aesthetic: dark, mono, amber.
 * Permadeath: one save slot; death moves the run to the graveyard.
 */

const AMBER = '#d9a24a';
const STAT_LABELS: { key: 'authority' | 'street' | 'charisma' | 'network'; label: string }[] = [
  { key: 'authority', label: 'ავტორიტეტი' },
  { key: 'street', label: 'ქუჩის გაგება' },
  { key: 'charisma', label: 'სიტყვის წონა' },
  { key: 'network', label: 'კავშირები' },
];

export function GanabSimulator({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<GanabState | null>(() => loadGame());
  const [screen, setScreen] = useState<'menu' | 'game'>(() => (loadGame() ? 'game' : 'menu'));
  const [nickname, setNickname] = useState('');
  const [showGrave, setShowGrave] = useState(false);

  useEffect(() => { if (state && !state.dead) saveGame(state); }, [state]);

  const start = () => {
    if (!nickname.trim()) return;
    SFX.gameStart();
    setState(newGame(nickname));
    setScreen('game');
  };

  const pick = (choice: GanabChoice) => {
    if (!state) return;
    SFX.click();
    const next = applyChoice(state, choice);
    if (next.dead) SFX.eliminate();
    setState(next);
  };

  const restart = () => {
    clearSave();
    setState(null);
    setNickname('');
    setScreen('menu');
  };

  const grave = getGraveyard();

  return createPortal(
    <div className="fixed inset-0 z-[500] flex flex-col select-none" style={{ background: '#0a0805', fontFamily: '"Share Tech Mono", monospace' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 flex-shrink-0" style={{ borderBottom: `1px solid ${AMBER}22` }}>
        <span className="text-[13px] font-bold tracking-[0.2em]" style={{ color: AMBER }}>🃏 განაბ სიმულატორი</span>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ color: `${AMBER}99`, border: `1px solid ${AMBER}33` }}>✕</button>
      </div>

      {/* ══ MENU ══ */}
      {screen === 'menu' && (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-5">
          <div className="w-full max-w-sm">
            <p className="text-center text-5xl mb-3">🃏</p>
            <h1 className="text-center text-xl font-bold mb-1" style={{ color: AMBER }}>განაბ სიმულატორი</h1>
            <p className="text-center text-[12px] mb-1" style={{ color: `${AMBER}77` }}>ბირჟიდან კურთხევამდე. ერთი არასწორი სიტყვა — და მორჩა.</p>
            <p className="text-center text-[11px] mb-6" style={{ color: '#ff2d5577' }}>18+ · მკაცრი ლექსიკა · permadeath</p>

            {!showGrave ? (
              <>
                <input
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') start(); }}
                  placeholder="შენი ქუჩური სახელი…"
                  maxLength={18}
                  className="w-full px-4 py-3 rounded-xl bg-transparent outline-none text-center text-[15px] mb-3"
                  style={{ color: AMBER, border: `1px solid ${AMBER}44` }}
                />
                <button
                  onClick={start}
                  disabled={!nickname.trim()}
                  className="w-full py-3 rounded-xl font-bold text-[14px] mb-2 transition-all active:scale-[0.98] disabled:opacity-30"
                  style={{ background: `${AMBER}1a`, border: `1px solid ${AMBER}66`, color: AMBER }}
                >
                  ქუჩაში გასვლა →
                </button>
                {grave.length > 0 && (
                  <button onClick={() => setShowGrave(true)} className="w-full py-2.5 rounded-xl text-[12px]" style={{ color: `${AMBER}66`, border: `1px solid ${AMBER}22` }}>
                    ⚰ სასაფლაო ({grave.length})
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-[12px] mb-3 text-center" style={{ color: `${AMBER}88` }}>⚰ აქ განისვენებენ ისინი, ვინც „გაფუჭდა"</p>
                <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
                  {grave.map((g, i) => (
                    <div key={i} className="px-3 py-2.5 rounded-xl" style={{ border: `1px solid ${AMBER}22`, background: `${AMBER}08` }}>
                      <p className="text-[13px] font-bold" style={{ color: AMBER }}>{g.nickname} <span className="font-normal text-[11px]" style={{ color: `${AMBER}66` }}>· {RANK_LABELS[g.rank]} · ფაზა {g.phase}</span></p>
                      <p className="text-[11px] mt-1 leading-relaxed" style={{ color: `${AMBER}77` }}>{g.reason}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowGrave(false)} className="w-full py-2.5 rounded-xl text-[12px]" style={{ color: `${AMBER}88`, border: `1px solid ${AMBER}33` }}>← უკან</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ GAME ══ */}
      {screen === 'game' && state && (
        <>
          {/* Stats strip */}
          <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto flex-shrink-0 scrollbar-none" style={{ borderBottom: `1px solid ${AMBER}18` }}>
            <span className="text-[11px] whitespace-nowrap font-bold" style={{ color: AMBER }}>{state.nickname}</span>
            <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded" style={{ color: `${AMBER}bb`, border: `1px solid ${AMBER}33` }}>{RANK_LABELS[state.rank]}</span>
            {STAT_LABELS.map(s => (
              <span key={s.key} className="text-[11px] whitespace-nowrap" style={{ color: `${AMBER}77` }}>
                {s.label}: <b style={{ color: AMBER }}>{state.stats[s.key]}</b>
              </span>
            ))}
            <span className="text-[11px] whitespace-nowrap" style={{ color: `${AMBER}77` }}>ოფშიაკი: <b style={{ color: AMBER }}>{state.stats.obshiak}₾</b></span>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="max-w-xl mx-auto">
              {state.dead ? (
                <div className="text-center pt-10">
                  <p className="text-5xl mb-4">⚰</p>
                  <p className="text-lg font-bold mb-3" style={{ color: '#ff2d55' }}>გაფუჭდი.</p>
                  <p className="text-[13px] leading-relaxed mb-8 whitespace-pre-wrap" style={{ color: `${AMBER}99` }}>{state.deathReason}</p>
                  <p className="text-[11px] mb-6" style={{ color: `${AMBER}55` }}>ქუჩას შენი სახელი აღარ ახსოვს. ახალი სახელით დაიწყე.</p>
                  <button onClick={restart} className="px-8 py-3 rounded-xl font-bold text-[14px]" style={{ background: `${AMBER}1a`, border: `1px solid ${AMBER}66`, color: AMBER }}>
                    ახალი ცხოვრება →
                  </button>
                </div>
              ) : state.sceneId === '@end_step' ? (
                <div className="text-center pt-10">
                  <p className="text-5xl mb-4">🌒</p>
                  <p className="text-lg font-bold mb-3" style={{ color: AMBER }}>ფაზა {state.phase} დასრულდა.</p>
                  <p className="text-[13px] leading-relaxed mb-2" style={{ color: `${AMBER}99` }}>
                    {state.phase >= 2
                      ? `${state.nickname} სხოდკებმა კაცად აღიარეს — მაგრამ ღამის დაჭერებმა ყველაფერი შეცვალა. წინ ზონაა: რკინის კარები, ასონიაკები და კითხვები, რომლებზეც პასუხი სიცოცხლის ფასია.`
                      : `${state.nickname} გადაურჩა უბანს და სახელი დაიმკვიდრა. ხუთშაბათს სხოდკაა — ოფშიაკი, სერიოზული ხალხი, სერიოზული ბაზარი.`}
                  </p>
                  <p className="text-[12px] mb-8" style={{ color: `${AMBER}55` }}>
                    {state.phase >= 2 ? 'ფაზა 3: ზონა და ასონიაკები — მალე.' : 'ფაზა 2: სხოდკები და ოფშიაკი — მალე.'} შენი პროგრესი შენახულია.
                  </p>
                  <button onClick={onClose} className="px-8 py-3 rounded-xl font-bold text-[13px]" style={{ border: `1px solid ${AMBER}44`, color: `${AMBER}bb` }}>
                    გამოსვლა
                  </button>
                </div>
              ) : (() => {
                const scene = getScene(state);
                if (!scene) return <p style={{ color: '#ff2d55' }}>სცენა ვერ მოიძებნა — სეივი დაზიანებულია.</p>;
                return (
                  <>
                    {scene.title && (
                      <p className="text-[11px] tracking-[0.25em] uppercase mb-4" style={{ color: `${AMBER}55` }}>▌{scene.title}</p>
                    )}
                    {scene.speaker && (
                      <p className="text-[13px] font-bold mb-2" style={{ color: AMBER }}>{scene.speaker}:</p>
                    )}
                    <p className="text-[15px] leading-[1.75] whitespace-pre-wrap mb-8" style={{ color: '#e8dcc8' }}>
                      {fillText(scene.text, state)}
                    </p>
                    <div className="space-y-2.5">
                      {visibleChoices(state, scene).map((c, i) => (
                        <button
                          key={i}
                          onClick={() => pick(c)}
                          className="w-full text-left px-4 py-3 rounded-xl text-[13.5px] leading-relaxed transition-all active:scale-[0.99]"
                          style={{ color: AMBER, border: `1px solid ${AMBER}3a`, background: `${AMBER}0a` }}
                        >
                          <span style={{ color: `${AMBER}66` }}>{i + 1}. </span>{fillText(c.text, state)}
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
