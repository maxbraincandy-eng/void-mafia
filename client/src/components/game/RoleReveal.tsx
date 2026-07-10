import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Role } from '@/types/index';
import { SFX } from '@/hooks/useSoundFX';
import { useT } from '@/store/langStore';
import { getRoleSkinById } from '@/constants/cosmetics';

export interface TeamMate {
  name: string;
  roleName: string;
  roleKey: string;
}

interface Props {
  role: Role | null;
  teammates?: TeamMate[];
  skin?: string | null;
}

const ROLE_GEO: Record<string, string> = {
  mafia:       'მაფია',
  citizen:     'მოქალაქე',
  sheriff:     'შერიფი',
  doctor:      'ექიმი',
  don:         'დონი',
  maniac:      'მანიაკი',
  jester:      'ჯესტერი',
  bodyguard:   'მცველი',
  spy:         'ჯაშუში',
  escort:      'ესკორტი',
  vigilante:   'ვიგილანტი',
  cult_leader: 'კულტის ლიდერი',
  cultist:     'კულტისტი',
  veteran:     'ვეტერანი',
  tracker:     'თვალთვალი',
  arsonist:    'მხანძრელი',
  mayor:       'მერი',
};

const ROLE_TAGLINE: Record<string, string> = {
  mafia:       'შენი გუნდი. ♦ შენი წესები.',
  citizen:     'იპოვე მაფია.',
  sheriff:     'გამოიძიე. გაასამართლე.',
  doctor:      'გადაარჩინე. გადარჩი.',
  don:         'შენ ხარ ბოსი.',
  maniac:      'ყველა მტერია.',
  jester:      'გაგრიცხინე თავი.',
  bodyguard:   'დაიცავი ან დაიღუპე.',
  spy:         'ყველაფერი ხედავ.',
  escort:      'ღამე შენია.',
  vigilante:   'სამართალი შენი ხელშია.',
  cult_leader: 'შენ ხარ კულტი. ისინი მიჰყვებიან.',
  cultist:     'ლიდერს მიჰყევი.',
  veteran:     'ყოველი ღამე ბოლო შეიძლება იყოს.',
  tracker:     'ვინ სად მიდის — ყველაფერი ვიცი.',
  arsonist:    'ყველაფერი დაწვი.',
  mayor:       'ხმა ორმაგდება.',
};

const ROLE_ICONS: Record<string, string> = {
  mafia:       '◆',
  citizen:     '◈',
  sheriff:     '✦',
  doctor:      '+',
  don:         '♛',
  maniac:      '∞',
  jester:      '✧',
  bodyguard:   '⬡',
  spy:         '◉',
  escort:      '✿',
  vigilante:   '⚖',
  cult_leader: '⛤',
  cultist:     '◎',
  veteran:     '★',
  tracker:     '◯',
  arsonist:    '△',
  mayor:       '♔',
};

const ROLE_CARD_IMAGES: Partial<Record<string, string>> = {
  citizen:     '/roles/citizen.png',
  sheriff:     '/roles/sheriff.png',
  doctor:      '/roles/doctor.png',
  cult_leader: '/roles/cult_leader.png',
  mafia:       '/roles/mafia.svg',
  don:         '/roles/don.svg',
  maniac:      '/roles/maniac.svg',
  jester:      '/roles/jester.svg',
  bodyguard:   '/roles/bodyguard.svg',
  spy:         '/roles/spy.svg',
  escort:      '/roles/escort.svg',
  vigilante:   '/roles/vigilante.svg',
  veteran:     '/roles/veteran.svg',
  tracker:     '/roles/tracker.svg',
  arsonist:    '/roles/arsonist.svg',
  mayor:       '/roles/mayor.svg',
  cultist:     '/roles/cultist.svg',
};

// Left border color, right border color per role
const ROLE_BORDER: Record<string, [string, string]> = {
  mafia:       ['#ff00cc', '#00ccff'],
  citizen:     ['#ff00cc', '#00ccff'],
  sheriff:     ['#ff00cc', '#00ccff'],
  doctor:      ['#00ff88', '#00ccff'],
  don:         ['#ff0055', '#cc00ff'],
  maniac:      ['#ff4400', '#ff00cc'],
  jester:      ['#ffcc00', '#ff00cc'],
  bodyguard:   ['#0088ff', '#00ccff'],
  spy:         ['#8800ff', '#00ccff'],
  escort:      ['#ff00cc', '#ff88cc'],
  vigilante:   ['#ffcc00', '#00ccff'],
  cult_leader: ['#ff00cc', '#00ccff'],
  cultist:     ['#8800ff', '#ff00cc'],
  veteran:     ['#ff8800', '#ffcc00'],
  tracker:     ['#00ccff', '#8800ff'],
  arsonist:    ['#ff4400', '#ffcc00'],
  mayor:       ['#ffcc00', '#00ccff'],
};

export function RoleReveal({ role, teammates, skin }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [flipDone, setFlipDone] = useState(false);
  const t = useT();

  useEffect(() => {
    const timer = setTimeout(() => {
      setFlipped(true);
      SFX.cardFlip();
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (!role) return null;

  const skinDef = getRoleSkinById(skin ?? null);
  const geoName  = (t.game.roles as Record<string, string>)[role.key] ?? ROLE_GEO[role.key] ?? role.name;
  const tagline  = (t.roleReveal.taglines as Record<string, string>)[role.key] ?? ROLE_TAGLINE[role.key] ?? role.description;
  const icon     = ROLE_ICONS[role.key]   ?? '◆';
  const [defaultC1, defaultC2] = ROLE_BORDER[role.key] ?? ['#ff00cc', '#00ccff'];
  const c1 = skinDef?.c1 ?? defaultC1;
  const c2 = skinDef?.c2 ?? defaultC2;
  const cardBg = skinDef?.bg ?? '#03000d';
  const cardImage = !skinDef ? ROLE_CARD_IMAGES[role.key] ?? null : null;

  const borderGradient = `linear-gradient(180deg, ${c1}, ${c2})`;

  const showCrew = flipped && teammates && teammates.length > 0;

  return (
    <div className="flex flex-col items-center justify-center h-full py-4 gap-4">

      {/* 3D flip wrapper */}
      <div style={{ perspective: '1400px' }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.75, ease: [0.4, 0, 0.2, 1] }}
          onAnimationComplete={() => { if (flipped) setFlipDone(true); }}
          style={{
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            position: 'relative',
            width: '272px',
            height: '380px',
          }}
        >

          {/* ── Back face ── */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              display: flipDone ? 'none' : undefined,
            }}
            className="absolute inset-0 rounded-2xl overflow-hidden"
          >
            {/* gradient border wrapper */}
            <div
              className="absolute inset-0 rounded-2xl p-[2px]"
              style={{ background: 'linear-gradient(180deg, #9900ff, #4400cc)' }}
            >
              <div className="w-full h-full rounded-2xl bg-[#03000d] flex flex-col items-center justify-center gap-3">
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{ background: 'radial-gradient(circle at 50% 40%, rgba(155,0,255,0.25), transparent 65%)' }}
                />
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                  className="text-7xl relative z-10"
                  style={{ textShadow: '0 0 40px rgba(155,0,255,0.9)' }}
                >
                  ?
                </motion.div>
                <p className="text-[12px] font-display tracking-[0.35em] uppercase relative z-10"
                  style={{ color: 'rgba(155,0,255,0.55)' }}>
                  · VOID MAFIA ·
                </p>
              </div>
            </div>
          </div>

          {/* ── Front face ── */}
          <div
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              position: 'absolute',
              inset: 0,
            }}
          >
            {cardImage ? (
              /* ── Custom card art (citizen, sheriff, doctor, cult_leader) ── */
              <div
                className="absolute inset-0 rounded-2xl p-[2px]"
                style={{
                  background: borderGradient,
                  boxShadow: `0 0 40px ${c1}55, 0 0 80px ${c2}22`,
                }}
              >
                <div className="relative w-full h-full rounded-2xl overflow-hidden">
                  <img
                    src={cardImage}
                    alt={role.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                  />
                  {/* subtle vignette for polish */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.18) 100%)' }}
                  />
                </div>
              </div>
            ) : (
              /* ── Text-based card (roles without custom art) ── */
              <div
                className="absolute inset-0 rounded-2xl p-[2px]"
                style={{ background: borderGradient, boxShadow: `0 0 32px ${c1}44` }}
              >
                <div
                  className="relative w-full h-full rounded-2xl overflow-hidden flex flex-col"
                  style={{ background: cardBg }}
                >
                  {/* bg glow */}
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at 50% 50%, ${c1}18 0%, transparent 68%)` }} />

                  {/* Header */}
                  <div className="relative z-10 pt-3 pb-1 flex items-center justify-center gap-2">
                    <div className="w-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c2})` }} />
                    <span className="text-[12px] font-display tracking-[0.3em] uppercase" style={{ color: c2, opacity: 0.8 }}>
                      {skinDef ? skinDef.name.toUpperCase() : 'VOID MAFIA'}
                    </span>
                    <div className="w-4 h-px" style={{ background: `linear-gradient(90deg, ${c2}, transparent)` }} />
                  </div>

                  {/* Icon circle */}
                  <div className="relative z-10 flex justify-center mt-6">
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center"
                      style={{
                        background: `radial-gradient(circle, ${c1}22, transparent 70%)`,
                        border: `1.5px solid ${c2}`,
                        boxShadow: `0 0 28px ${c2}50, inset 0 0 20px ${c1}18`,
                        fontSize: '2.4rem',
                        color: c2,
                        textShadow: `0 0 16px ${c2}`,
                      }}
                    >
                      {icon}
                    </div>
                  </div>

                  {/* Separator */}
                  <div className="relative z-10 flex items-center justify-center gap-3 mt-4 px-6">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c1}60)` }} />
                    <span style={{ color: c1, fontSize: '8px' }}>★</span>
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${c2}60, transparent)` }} />
                  </div>

                  {/* Role name */}
                  <div className="relative z-10 text-center px-4 mt-3">
                    <h2
                      className="font-display font-black tracking-widest uppercase leading-none"
                      style={{
                        fontSize: role.name.length > 10 ? '1.6rem' : '2.2rem',
                        background: `linear-gradient(90deg, ${c1}, #aa44ff, ${c2})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        filter: `drop-shadow(0 0 10px ${c1}80)`,
                      }}
                    >
                      {role.name}
                    </h2>
                    <p className="text-sm font-medium tracking-wide mt-1"
                      style={{
                        background: `linear-gradient(90deg, ${c1}cc, ${c2}cc)`,
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                      }}>
                      {geoName}
                    </p>
                  </div>

                  {/* Ability box */}
                  <div
                    className="relative z-10 mx-3 mt-auto mb-3 rounded-xl p-3 flex items-center gap-3"
                    style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${c2}30` }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-lg font-bold"
                      style={{ background: `${c1}18`, border: `1px solid ${c1}40`, color: c2 }}
                    >
                      {icon}
                    </div>
                    <p className="text-[11px] leading-snug font-medium" style={{ color: c2, opacity: 0.9 }}>
                      {role.ability}
                    </p>
                  </div>

                  {/* Corner dots */}
                  <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1.5 z-10 pb-1">
                    {[c1, '#ffffff40', '#ffffff40', c2].map((col, i) => (
                      <div key={i} className="w-1 h-1 rounded-full" style={{ background: col }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Mafia crew reveal */}
      {showCrew && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-[272px] rounded-2xl p-4"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,0,204,0.25)',
            boxShadow: '0 0 30px rgba(255,0,204,0.08)',
          }}
        >
          <p className="text-[12px] font-display tracking-[0.25em] uppercase text-neon-pink/50 mb-3">
            {t.game.gameOver.yourCrew}
          </p>
          <div className="space-y-2">
            {teammates!.map(tm => (
              <div key={tm.name} className="flex items-center gap-2">
                <span className="text-base font-bold" style={{ color: '#ff4488' }}>{ROLE_ICONS[tm.roleKey] ?? '◆'}</span>
                <span className="text-sm text-white font-semibold flex-1 truncate">{tm.name}</span>
                <span className="text-[12px] text-neon-pink/50 font-mono">{tm.roleName}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="text-xs text-white/25 font-mono animate-pulse"
      >
        Game begins shortly…
      </motion.p>
    </div>
  );
}
