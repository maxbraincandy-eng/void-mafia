import { useRef, forwardRef } from 'react';
import clsx from 'clsx';
import type { PlayerProfilePublic, ClanMembership, AchievementEarned } from '@/types/index';
import { MAX_LEVEL, xpForLevel, xpForNextLevel } from '@/lib/level';

export type CardTemplate =
  | 'classic_void'
  | 'mafia_gold'
  | 'sheriff_blue'
  | 'yakuza_neon'
  | 'cult_ritual'
  | 'minimal_dark';

export const CARD_TEMPLATES: { key: CardTemplate; label: string; emoji: string }[] = [
  { key: 'classic_void',  label: 'Classic Void',  emoji: '🌌' },
  { key: 'mafia_gold',    label: 'Mafia Gold',    emoji: '🥇' },
  { key: 'sheriff_blue',  label: 'Sheriff Blue',  emoji: '🔵' },
  { key: 'yakuza_neon',   label: 'Yakuza Neon',   emoji: '⚔️' },
  { key: 'cult_ritual',   label: 'Cult Ritual',   emoji: '🔮' },
  { key: 'minimal_dark',  label: 'Minimal Dark',  emoji: '◼️' },
];

interface TemplateStyle {
  bg: string;
  accent: string;
  text: string;
  subtext: string;
  border: string;
  glow: string;
  badge: string;
  statBg: string;
  labelColor: string;
}

const STYLES: Record<CardTemplate, TemplateStyle> = {
  classic_void: {
    bg:         'linear-gradient(135deg, #060314 0%, #0d0528 50%, #060314 100%)',
    accent:     '#00e5ff',
    text:       '#ffffff',
    subtext:    'rgba(0,229,255,0.7)',
    border:     'rgba(0,229,255,0.25)',
    glow:       'rgba(0,229,255,0.15)',
    badge:      'rgba(0,229,255,0.12)',
    statBg:     'rgba(0,229,255,0.05)',
    labelColor: 'rgba(0,229,255,0.5)',
  },
  mafia_gold: {
    bg:         'linear-gradient(135deg, #0a0500 0%, #1a0a00 50%, #0a0500 100%)',
    accent:     '#facc15',
    text:       '#fff7e0',
    subtext:    'rgba(250,204,21,0.8)',
    border:     'rgba(250,204,21,0.3)',
    glow:       'rgba(250,204,21,0.12)',
    badge:      'rgba(250,204,21,0.1)',
    statBg:     'rgba(250,204,21,0.05)',
    labelColor: 'rgba(250,204,21,0.5)',
  },
  sheriff_blue: {
    bg:         'linear-gradient(135deg, #000a1a 0%, #001233 50%, #000a1a 100%)',
    accent:     '#3b82f6',
    text:       '#e0f0ff',
    subtext:    'rgba(59,130,246,0.8)',
    border:     'rgba(59,130,246,0.3)',
    glow:       'rgba(59,130,246,0.12)',
    badge:      'rgba(59,130,246,0.12)',
    statBg:     'rgba(59,130,246,0.05)',
    labelColor: 'rgba(59,130,246,0.5)',
  },
  yakuza_neon: {
    bg:         'linear-gradient(135deg, #0a0000 0%, #1a0308 50%, #0a0000 100%)',
    accent:     '#ff2d55',
    text:       '#fff0f0',
    subtext:    'rgba(255,45,85,0.8)',
    border:     'rgba(255,45,85,0.3)',
    glow:       'rgba(255,45,85,0.12)',
    badge:      'rgba(255,45,85,0.1)',
    statBg:     'rgba(255,45,85,0.05)',
    labelColor: 'rgba(255,45,85,0.5)',
  },
  cult_ritual: {
    bg:         'linear-gradient(135deg, #08000f 0%, #14002a 50%, #08000f 100%)',
    accent:     '#c026d3',
    text:       '#f5e6ff',
    subtext:    'rgba(192,38,211,0.8)',
    border:     'rgba(192,38,211,0.3)',
    glow:       'rgba(192,38,211,0.12)',
    badge:      'rgba(192,38,211,0.1)',
    statBg:     'rgba(192,38,211,0.05)',
    labelColor: 'rgba(192,38,211,0.5)',
  },
  minimal_dark: {
    bg:         'linear-gradient(135deg, #0c0c0c 0%, #141414 100%)',
    accent:     '#ffffff',
    text:       '#ffffff',
    subtext:    'rgba(255,255,255,0.6)',
    border:     'rgba(255,255,255,0.12)',
    glow:       'rgba(255,255,255,0.04)',
    badge:      'rgba(255,255,255,0.06)',
    statBg:     'rgba(255,255,255,0.03)',
    labelColor: 'rgba(255,255,255,0.35)',
  },
};

export interface ProfileCardData {
  profile: PlayerProfilePublic;
  clan: ClanMembership | null;
  achievements: AchievementEarned[];
}

interface Props {
  data: ProfileCardData;
  template: CardTemplate;
  compact?: boolean;
}

function xpPercent(profile: PlayerProfilePublic) {
  const lv = profile.level ?? 1;
  if (lv >= MAX_LEVEL) return 100;
  const xp = profile.xp ?? 0;
  const lo = xpForLevel(lv), hi = xpForNextLevel(lv);
  return hi > lo ? Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100)) : 100;
}

function avatarInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export const ProfileCard = forwardRef<HTMLDivElement, Props>(({ data, template, compact = false }, ref) => {
  const { profile, clan, achievements } = data;
  const s = STYLES[template];

  const winRate = profile.stats.gamesPlayed > 0
    ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
    : 0;

  const xpPct = xpPercent(profile);
  const topAch = achievements[0] ?? null;
  const level = profile.level ?? 1;

  return (
    <div
      ref={ref}
      className={clsx('relative overflow-hidden select-none', compact ? 'rounded-xl' : 'rounded-2xl')}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        boxShadow: `0 0 40px ${s.glow}, 0 4px 40px rgba(0,0,0,0.7)`,
        width: compact ? '100%' : '360px',
        minWidth: compact ? undefined : '320px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Top accent line */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, transparent, ${s.accent}, transparent)`, opacity: 0.9 }} />

      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: 'absolute', top: '-60px', right: '-60px',
          width: '200px', height: '200px', borderRadius: '50%',
          background: `radial-gradient(circle, ${s.accent}12 0%, transparent 70%)`,
        }} />
        <div style={{
          position: 'absolute', bottom: '-40px', left: '-40px',
          width: '160px', height: '160px', borderRadius: '50%',
          background: `radial-gradient(circle, ${s.accent}08 0%, transparent 70%)`,
        }} />
      </div>

      <div className={clsx('relative', compact ? 'p-4' : 'p-5')}>
        {/* Header row: avatar + identity */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div style={{
            width: compact ? '52px' : '64px',
            height: compact ? '52px' : '64px',
            borderRadius: '50%',
            border: `2px solid ${s.accent}60`,
            boxShadow: `0 0 16px ${s.accent}30`,
            overflow: 'hidden',
            flexShrink: 0,
            background: `linear-gradient(135deg, ${s.accent}20, ${s.badge})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                crossOrigin="anonymous"
              />
            ) : (
              <span style={{ fontSize: compact ? '20px' : '26px', fontWeight: 700, color: s.accent }}>
                {profile.avatar && profile.avatar.startsWith('http')
                  ? avatarInitials(profile.username)
                  : (profile.avatar ?? avatarInitials(profile.username))}
              </span>
            )}
          </div>

          {/* Name + ID + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span style={{
                color: s.text, fontWeight: 700,
                fontSize: compact ? '14px' : '16px',
                letterSpacing: '0.02em',
                textShadow: `0 0 12px ${s.accent}50`,
              }}>
                {profile.username}
              </span>
              {profile.publicId && (
                <span style={{ color: s.labelColor, fontSize: '11px', fontFamily: 'monospace' }}>
                  #{profile.publicId}
                </span>
              )}
              {profile.isModerator && profile.moderatorBadgeVisible && (
                <span style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em',
                  padding: '1px 5px', borderRadius: '4px',
                  background: s.badge, border: `1px solid ${s.border}`,
                  color: s.accent, textTransform: 'uppercase',
                }}>
                  MOD
                </span>
              )}
            </div>

            {/* Clan */}
            {clan && (
              <div style={{ marginTop: '2px' }}>
                <span style={{ color: s.subtext, fontSize: '11px', fontFamily: 'monospace' }}>
                  [{clan.tag}] {clan.name}
                </span>
              </div>
            )}

            {/* Level + XP bar */}
            <div style={{ marginTop: '6px' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{
                  color: s.accent, fontSize: '10px', fontWeight: 700,
                  fontFamily: 'monospace', letterSpacing: '0.1em',
                }}>
                  {level >= MAX_LEVEL ? 'LV 100 MAX' : `LV ${level}`}
                </span>
                <div style={{
                  flex: 1, height: '3px', borderRadius: '2px',
                  background: `${s.accent}18`,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    width: `${xpPct}%`,
                    background: `linear-gradient(90deg, ${s.accent}80, ${s.accent})`,
                  }} />
                </div>
                <span style={{ color: s.labelColor, fontSize: '9px', fontFamily: 'monospace' }}>
                  {level >= MAX_LEVEL ? 'MAX' : `${xpPct}%`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '6px', marginBottom: '12px',
        }}>
          {[
            { label: 'Games', value: profile.stats.gamesPlayed },
            { label: 'Wins', value: profile.stats.wins },
            { label: 'Win Rate', value: `${winRate}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: s.statBg,
              border: `1px solid ${s.border}`,
              borderRadius: '8px',
              padding: compact ? '6px 8px' : '8px 10px',
              textAlign: 'center',
            }}>
              <div style={{ color: s.text, fontSize: compact ? '15px' : '17px', fontWeight: 700, fontFamily: 'monospace' }}>
                {value}
              </div>
              <div style={{ color: s.labelColor, fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1px' }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Top achievement */}
        {topAch && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: s.statBg, border: `1px solid ${s.border}`,
            borderRadius: '8px', padding: compact ? '6px 8px' : '7px 10px',
            marginBottom: '10px',
          }}>
            <span style={{ fontSize: '18px' }}>{topAch.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: s.text, fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {topAch.name}
              </div>
              <div style={{ color: s.labelColor, fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Achievement
              </div>
            </div>
          </div>
        )}

        {/* Bottom: branding */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: '8px', borderTop: `1px solid ${s.border}`,
          marginTop: topAch ? '0' : '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '14px', filter: `drop-shadow(0 0 4px ${s.accent})` }}>⬡</span>
            <span style={{ color: s.accent, fontSize: '11px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              VOID MAFIA
            </span>
          </div>
          <span style={{ color: s.labelColor, fontSize: '9px', fontFamily: 'monospace' }}>
            voidmafia.one
          </span>
        </div>
      </div>

      {/* Bottom accent line */}
      <div style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${s.accent}40, transparent)` }} />
    </div>
  );
});

ProfileCard.displayName = 'ProfileCard';

// ── Canvas-based image download ────────────────────────────────────────
export async function downloadProfileCardImage(
  data: ProfileCardData,
  template: CardTemplate,
): Promise<void> {
  const s = STYLES[template];
  const { profile, clan, achievements } = data;

  const W = 540, H = 300;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H * 2; // 2× for retina
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, template === 'mafia_gold' ? '#0a0500'
    : template === 'sheriff_blue' ? '#000a1a'
    : template === 'yakuza_neon' ? '#0a0000'
    : template === 'cult_ritual' ? '#08000f'
    : template === 'minimal_dark' ? '#0c0c0c'
    : '#060314');
  bgGrad.addColorStop(1, template === 'mafia_gold' ? '#1a0a00'
    : template === 'sheriff_blue' ? '#001233'
    : template === 'yakuza_neon' ? '#1a0308'
    : template === 'cult_ritual' ? '#14002a'
    : template === 'minimal_dark' ? '#141414'
    : '#0d0528');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Top accent line
  const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
  lineGrad.addColorStop(0, 'transparent');
  lineGrad.addColorStop(0.5, s.accent);
  lineGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(0, 0, W, 3);

  // Avatar circle
  const avX = 36, avY = 36, avR = 30;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2);
  ctx.clip();
  if (profile.avatarUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>(resolve => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = profile.avatarUrl!;
      });
      ctx.drawImage(img, avX, avY, avR * 2, avR * 2);
    } catch { drawInitials(); }
  } else {
    drawInitials();
  }
  ctx.restore();

  function drawInitials() {
    ctx.fillStyle = `${s.accent}20`;
    ctx.fillRect(avX, avY, avR * 2, avR * 2);
    ctx.fillStyle = s.accent;
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      profile.avatar?.startsWith('http') ? profile.username.slice(0, 2).toUpperCase() : (profile.avatar ?? profile.username.slice(0, 2).toUpperCase()),
      avX + avR, avY + avR,
    );
  }

  // Avatar border glow
  ctx.strokeStyle = `${s.accent}60`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(avX + avR, avY + avR, avR, 0, Math.PI * 2);
  ctx.stroke();

  // Username
  ctx.fillStyle = s.text;
  ctx.font = 'bold 18px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(profile.username, 82, 38);

  // Public ID
  if (profile.publicId) {
    ctx.fillStyle = s.labelColor;
    ctx.font = '11px monospace';
    ctx.fillText(`#${profile.publicId}`, 82, 60);
  }

  // Clan
  if (clan) {
    ctx.fillStyle = s.subtext;
    ctx.font = '10px monospace';
    ctx.fillText(`[${clan.tag}] ${clan.name}`, 82, 74);
  }

  // Level label
  ctx.fillStyle = s.accent;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`LV ${profile.level ?? 1}`, 82, profile.publicId ? (clan ? 90 : 80) : 70);

  // Stats grid
  const statsY = 108;
  const statW = 100, statH = 52, statGap = 8;
  const stats = [
    { label: 'GAMES', value: String(profile.stats.gamesPlayed) },
    { label: 'WINS', value: String(profile.stats.wins) },
    { label: 'WIN RATE', value: `${profile.stats.gamesPlayed > 0 ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100) : 0}%` },
  ];
  stats.forEach((stat, i) => {
    const x = 20 + i * (statW + statGap);
    // Box
    ctx.fillStyle = s.statBg;
    roundRect(ctx, x, statsY, statW, statH, 6);
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 0.8;
    roundRectStroke(ctx, x, statsY, statW, statH, 6);
    // Value
    ctx.fillStyle = s.text;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stat.value, x + statW / 2, statsY + 22);
    // Label
    ctx.fillStyle = s.labelColor;
    ctx.font = '8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(stat.label, x + statW / 2, statsY + 40);
  });

  // Top achievement
  if (achievements[0]) {
    const achY = statsY + statH + 10;
    ctx.fillStyle = s.statBg;
    roundRect(ctx, 20, achY, W - 40, 34, 6);
    ctx.strokeStyle = s.border;
    ctx.lineWidth = 0.8;
    roundRectStroke(ctx, 20, achY, W - 40, 34, 6);
    ctx.font = '16px system-ui';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(achievements[0].icon, 30, achY + 17);
    ctx.fillStyle = s.text;
    ctx.font = '11px system-ui';
    ctx.fillText(achievements[0].name, 54, achY + 14);
    ctx.fillStyle = s.labelColor;
    ctx.font = '8px system-ui';
    ctx.fillText('ACHIEVEMENT', 54, achY + 26);
  }

  // Bottom branding bar
  const brandY = H - 24;
  const divGrad = ctx.createLinearGradient(0, brandY, W, brandY);
  divGrad.addColorStop(0, 'transparent');
  divGrad.addColorStop(0.5, `${s.accent}30`);
  divGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = divGrad;
  ctx.fillRect(0, brandY - 1, W, 1);

  ctx.fillStyle = s.accent;
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('⬡ VOID MAFIA', 20, brandY + 11);

  ctx.fillStyle = s.labelColor;
  ctx.font = '9px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('voidmafia.one', W - 20, brandY + 11);

  // Download
  const link = document.createElement('a');
  link.download = `void-mafia-${profile.username.replace(/\s/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.stroke();
}
