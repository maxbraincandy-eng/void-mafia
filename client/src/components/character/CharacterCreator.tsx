import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CreatorPreview } from './preview';
import {
  type CharacterSpec, type Gender, defaultSpec, loadSpec, saveSpec,
  SKIN_TONES, HAIR_COLORS, EYE_COLORS, CLOTH_COLORS, LIP_COLORS, SHADOW_COLORS, SOCK_COLORS,
  HAIR_STYLES, BEARD_STYLES, TOP_STYLES, BOTTOM_STYLES, SHOE_STYLES, SOCK_STYLES, GLOVE_STYLES,
  BUILDS, GLASSES, HATS, EYE_SHAPES, PUPILS,
} from './spec';

// ── Character Creator — premium dark / glassmorphism UI ────────────────
// Lazy-loaded. Live 3D studio preview (drag-orbit + zoom) with a data-driven
// category system. Saves a CharacterSpec used across the app.

type Cat = 'body' | 'skin' | 'hair' | 'face' | 'style' | 'clothing' | 'accessories';
const CATS: { id: Cat; icon: string; label: string }[] = [
  { id: 'body', icon: '🧍', label: 'სხეული' },
  { id: 'skin', icon: '🎨', label: 'კანი' },
  { id: 'hair', icon: '💇', label: 'თმა' },
  { id: 'face', icon: '👁', label: 'სახე' },
  { id: 'style', icon: '💄', label: 'სტილი' },
  { id: 'clothing', icon: '👕', label: 'ტანსაცმელი' },
  { id: 'accessories', icon: '🕶', label: 'აქსესუარები' },
];

const glass = { background: 'rgba(18,16,30,0.62)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as const;

function rand<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function randomize(gender: Gender): CharacterSpec {
  const d = defaultSpec(gender);
  const female = gender === 'female';
  return {
    ...d,
    skin: rand(SKIN_TONES), build: rand(BUILDS).id, height: 0.94 + Math.random() * 0.14,
    shoulders: 0.9 + Math.random() * 0.2, legLen: 0.95 + Math.random() * 0.12,
    hair: rand(HAIR_STYLES.slice(1)).id, hairColor: rand(HAIR_COLORS),
    hairColor2: Math.random() < 0.45 ? rand(HAIR_COLORS) : '', bangs: Math.random() < (female ? 0.6 : 0.2),
    eyeColor: rand(EYE_COLORS), eyeShape: rand(EYE_SHAPES).id, pupil: Math.random() < 0.75 ? 'round' : rand(PUPILS).id,
    eyeliner: female && Math.random() < 0.7, freckles: Math.random() < 0.3, beautyMark: Math.random() < 0.25,
    browColor: rand(HAIR_COLORS.slice(0, 6)),
    beard: gender === 'male' ? rand(BEARD_STYLES).id : 'none', beardColor: rand(HAIR_COLORS.slice(0, 6)),
    lipstick: female ? rand(LIP_COLORS) : '', eyeshadow: female ? rand(SHADOW_COLORS) : '', blush: female && Math.random() < 0.6,
    top: rand(female ? TOP_STYLES : TOP_STYLES.filter(t => t.id !== 'dress' && t.id !== 'crop')).id,
    topColor: rand(CLOTH_COLORS), bottom: rand(BOTTOM_STYLES).id, bottomColor: rand(CLOTH_COLORS),
    shoes: rand(SHOE_STYLES).id, shoeColor: rand(CLOTH_COLORS),
    socks: female ? rand(SOCK_STYLES).id : 'none', sockColor: rand(SOCK_COLORS), gloves: Math.random() < 0.15 ? rand(GLOVE_STYLES).id : 'none',
    glasses: rand(GLASSES).id, hat: Math.random() < 0.3 ? rand(HATS).id : 'none', hatColor: rand(CLOTH_COLORS),
    earrings: Math.random() < 0.5, hairclip: female && Math.random() < 0.4, necklace: Math.random() < 0.35, belt: Math.random() < 0.3,
  };
}

export default function CharacterCreator({ onClose, onSaved }: { onClose: () => void; onSaved?: (s: CharacterSpec) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<CreatorPreview | null>(null);
  const [spec, setSpec] = useState<CharacterSpec>(() => loadSpec() ?? defaultSpec('male'));
  const [cat, setCat] = useState<Cat>('body');
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const p = new CreatorPreview(canvasRef.current);
    previewRef.current = p; p.setSpec(spec); p.start();
    const onResize = () => p.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); p.dispose(); previewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rebuild the model when the spec changes
  useEffect(() => { previewRef.current?.setSpec(spec); }, [spec]);
  useEffect(() => { previewRef.current?.focusFace(cat === 'face' || cat === 'skin'); }, [cat]);

  const patch = useCallback((p: Partial<CharacterSpec>) => setSpec(s => ({ ...s, ...p })), []);

  // ── preview drag / zoom ──
  const onDown = (x: number, y: number) => { drag.current = { x, y }; };
  const onMove = (x: number, y: number) => { if (!drag.current) return; previewRef.current?.orbit(x - drag.current.x, y - drag.current.y); drag.current = { x, y }; };
  const onUp = () => { drag.current = null; pinch.current = null; };
  const onTouchStart = (e: React.TouchEvent) => { if (e.touches.length === 2) { pinch.current = dist2(e); } else onDown(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinch.current != null) { const d = dist2(e); previewRef.current?.zoom((pinch.current - d) * 0.01); pinch.current = d; }
    else if (e.touches.length === 1) onMove(e.touches[0].clientX, e.touches[0].clientY);
  };

  const save = () => { saveSpec(spec); onSaved?.(spec); onClose(); };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'radial-gradient(ellipse at top, #16122a 0%, #08060f 100%)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <span style={{ fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 15, letterSpacing: 1, color: '#e9d5ff' }}>ავატარის შექმნა</span>
        <div style={{ flex: 1 }} />
        {/* gender toggle */}
        <div style={{ display: 'flex', borderRadius: 20, overflow: 'hidden', ...glass }}>
          {(['male', 'female'] as Gender[]).map(g => (
            <button key={g} onClick={() => setSpec(s => ({ ...defaultSpec(g), skin: s.skin, height: s.height, topColor: s.topColor, bottomColor: s.bottomColor, glow: s.glow }))}
              style={{ padding: '7px 16px', fontSize: 13, background: spec.gender === g ? 'rgba(124,58,237,0.5)' : 'transparent', color: '#e9d5ff', border: 'none' }}>
              {g === 'male' ? '♂' : '♀'}
            </button>
          ))}
        </div>
        <button onClick={() => setSpec(randomize(spec.gender))} title="შემთხვევითი" style={{ width: 40, height: 40, borderRadius: '50%', color: '#e9d5ff', fontSize: 17, ...glass }}>🎲</button>
        <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: '50%', color: '#e9d5ff', fontSize: 17, ...glass }}>✕</button>
      </div>

      {/* Preview */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}
        onMouseDown={(e) => onDown(e.clientX, e.clientY)} onMouseMove={(e) => onMove(e.clientX, e.clientY)} onMouseUp={onUp} onMouseLeave={onUp}
        onWheel={(e) => previewRef.current?.zoom(e.deltaY * 0.002)}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onUp}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none', fontFamily: 'monospace', fontSize: 10, color: 'rgba(233,213,255,0.35)' }}>👆 დაატრიალე · ორი თითი — ზუმი</div>
      </div>

      {/* Category rail */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '8px 12px' }}>
        {CATS.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 62, padding: '8px 6px', borderRadius: 14, color: '#e9d5ff', ...(cat === c.id ? { background: 'rgba(124,58,237,0.35)', border: '1px solid rgba(192,132,252,0.6)' } : glass) }}>
            <span style={{ fontSize: 18 }}>{c.icon}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 0.5 }}>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Options panel */}
      <div style={{ maxHeight: '34vh', overflowY: 'auto', padding: '4px 16px 8px', margin: '0 10px', borderRadius: 18, ...glass }}>
        <Options cat={cat} spec={spec} patch={patch} />
      </div>

      {/* Save */}
      <div style={{ padding: '10px 16px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
        <button onClick={save} style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', fontFamily: '"Space Grotesk",monospace', fontWeight: 800, fontSize: 15, color: '#fff', background: 'linear-gradient(135deg, #7c3aed, #c026d3)', boxShadow: '0 6px 24px rgba(124,58,237,0.5)' }}>
          ✓ შენახვა
        </button>
      </div>
    </div>,
    document.body,
  );
}

function dist2(e: React.TouchEvent) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

// ── Reusable pickers ──────────────────────────────────────────────────
function Swatches({ colors, value, onPick, allowNone }: { colors: readonly string[]; value: string; onPick: (c: string) => void; allowNone?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {colors.map((c, i) => (
        <button key={i} onClick={() => onPick(c)}
          style={{ width: 34, height: 34, borderRadius: '50%', background: c || 'transparent', border: value === c ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.18)', position: 'relative' }}>
          {allowNone && c === '' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>∅</span>}
        </button>
      ))}
    </div>
  );
}
function Chips<T extends string>({ items, value, onPick }: { items: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map(it => (
        <button key={it.id} onClick={() => onPick(it.id)}
          style={{ padding: '8px 14px', borderRadius: 12, fontFamily: 'monospace', fontSize: 12, color: '#e9d5ff', border: value === it.id ? '1px solid rgba(192,132,252,0.7)' : '1px solid rgba(255,255,255,0.12)', background: value === it.id ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.04)' }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 2px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.5)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Slider({ title, value, min, max, onChange }: { title: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ padding: '10px 2px' }}>
      <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(233,213,255,0.5)', marginBottom: 8 }}>{title}</div>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#c084fc' }} />
    </div>
  );
}

function Toggle({ title, value, onChange }: { title: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 12px', marginTop: 6, borderRadius: 12, fontFamily: 'monospace', fontSize: 12, color: '#e9d5ff', border: value ? '1px solid rgba(192,132,252,0.6)' : '1px solid rgba(255,255,255,0.12)', background: value ? 'rgba(124,58,237,0.28)' : 'rgba(255,255,255,0.04)' }}>
      <span>{title}</span><span style={{ color: value ? '#8effc0' : 'rgba(233,213,255,0.4)' }}>{value ? 'ჩართ.' : 'გამორთ.'}</span>
    </button>
  );
}

function Options({ cat, spec, patch }: { cat: Cat; spec: CharacterSpec; patch: (p: Partial<CharacterSpec>) => void }) {
  if (cat === 'body') return (<>
    <Section title="აღნაგობა"><Chips items={BUILDS} value={spec.build} onPick={v => patch({ build: v })} /></Section>
    <Slider title="სიმაღლე" value={spec.height} min={0.9} max={1.12} onChange={v => patch({ height: v })} />
    <Slider title="მხრების სიგანე" value={spec.shoulders} min={0.85} max={1.15} onChange={v => patch({ shoulders: v })} />
    <Slider title="ფეხების სიგრძე" value={spec.legLen} min={0.92} max={1.1} onChange={v => patch({ legLen: v })} />
  </>);
  if (cat === 'skin') return (<Section title="კანის ტონი"><Swatches colors={SKIN_TONES} value={spec.skin} onPick={c => patch({ skin: c })} /></Section>);
  if (cat === 'hair') return (<>
    <Section title="ვარცხნილობა"><Chips items={HAIR_STYLES} value={spec.hair} onPick={v => patch({ hair: v })} /></Section>
    <Toggle title="თმა შუბლზე (bangs)" value={spec.bangs} onChange={v => patch({ bangs: v })} />
    <Section title="თმის ფერი"><Swatches colors={HAIR_COLORS} value={spec.hairColor} onPick={c => patch({ hairColor: c })} /></Section>
    <Section title="გრადიენტი / ბოლოების ფერი"><Swatches colors={['', ...HAIR_COLORS]} value={spec.hairColor2} onPick={c => patch({ hairColor2: c })} allowNone /></Section>
  </>);
  if (cat === 'face') return (<>
    <Section title="თვალის ფორმა"><Chips items={EYE_SHAPES} value={spec.eyeShape} onPick={v => patch({ eyeShape: v })} /></Section>
    <Section title="გუგის სტილი"><Chips items={PUPILS} value={spec.pupil} onPick={v => patch({ pupil: v })} /></Section>
    <Section title="თვალის ფერი"><Swatches colors={EYE_COLORS} value={spec.eyeColor} onPick={c => patch({ eyeColor: c })} /></Section>
    <Section title="წარბები"><Swatches colors={HAIR_COLORS.slice(0, 8)} value={spec.browColor} onPick={c => patch({ browColor: c })} /></Section>
    <Toggle title="თვალის ლაინერი" value={spec.eyeliner} onChange={v => patch({ eyeliner: v })} />
    <Toggle title="ჭორფლები" value={spec.freckles} onChange={v => patch({ freckles: v })} />
    <Toggle title="ხალი" value={spec.beautyMark} onChange={v => patch({ beautyMark: v })} />
  </>);
  if (cat === 'style') return spec.gender === 'male' ? (<>
    <Section title="წვერი"><Chips items={BEARD_STYLES} value={spec.beard} onPick={v => patch({ beard: v })} /></Section>
    <Section title="წვერის ფერი"><Swatches colors={HAIR_COLORS.slice(0, 8)} value={spec.beardColor} onPick={c => patch({ beardColor: c })} /></Section>
  </>) : (<>
    <Section title="ტუჩსაცხი"><Swatches colors={LIP_COLORS} value={spec.lipstick} onPick={c => patch({ lipstick: c })} allowNone /></Section>
    <Section title="თვალის ჩრდილი"><Swatches colors={SHADOW_COLORS} value={spec.eyeshadow} onPick={c => patch({ eyeshadow: c })} allowNone /></Section>
    <Toggle title="ღაწვების შეფაკვა" value={spec.blush} onChange={v => patch({ blush: v })} />
  </>);
  if (cat === 'clothing') return (<>
    <Section title="ზედა"><Chips items={TOP_STYLES} value={spec.top} onPick={v => patch({ top: v })} /></Section>
    <Section title="ზედას ფერი"><Swatches colors={CLOTH_COLORS} value={spec.topColor} onPick={c => patch({ topColor: c })} /></Section>
    {spec.top !== 'dress' && (<>
      <Section title="ქვედა"><Chips items={BOTTOM_STYLES} value={spec.bottom} onPick={v => patch({ bottom: v })} /></Section>
      <Section title="ქვედას ფერი"><Swatches colors={CLOTH_COLORS} value={spec.bottomColor} onPick={c => patch({ bottomColor: c })} /></Section>
    </>)}
    <Section title="ფეხსაცმელი"><Chips items={SHOE_STYLES} value={spec.shoes} onPick={v => patch({ shoes: v })} /></Section>
    <Section title="ფეხსაცმლის ფერი"><Swatches colors={CLOTH_COLORS} value={spec.shoeColor} onPick={c => patch({ shoeColor: c })} /></Section>
    <Section title="წინდები"><Chips items={SOCK_STYLES} value={spec.socks} onPick={v => patch({ socks: v })} /></Section>
    {spec.socks !== 'none' && <Section title="წინდების ფერი"><Swatches colors={SOCK_COLORS} value={spec.sockColor} onPick={c => patch({ sockColor: c })} /></Section>}
    <Section title="ხელთათმანები"><Chips items={GLOVE_STYLES} value={spec.gloves} onPick={v => patch({ gloves: v })} /></Section>
  </>);
  return (<>
    <Section title="სათვალე"><Chips items={GLASSES} value={spec.glasses} onPick={v => patch({ glasses: v })} /></Section>
    <Section title="ქუდი"><Chips items={HATS} value={spec.hat} onPick={v => patch({ hat: v })} /></Section>
    {spec.hat !== 'none' && <Section title="ქუდის ფერი"><Swatches colors={CLOTH_COLORS} value={spec.hatColor} onPick={c => patch({ hatColor: c })} /></Section>}
    <Toggle title="საყურეები" value={spec.earrings} onChange={v => patch({ earrings: v })} />
    <Toggle title="თმის სამაგრი" value={spec.hairclip} onChange={v => patch({ hairclip: v })} />
    <Toggle title="ყელსაბამი / ჯაჭვი" value={spec.necklace} onChange={v => patch({ necklace: v })} />
    <Toggle title="ქამარი" value={spec.belt} onChange={v => patch({ belt: v })} />
  </>);
}
