/**
 * The Legacy panel: one level, and where it came from.
 *
 * WHAT THIS ANSWERS THAT THE OLD PROFILE DID NOT
 * ──────────────────────────────────────────────
 * The account has had a level and an XP total for a long time. What it could
 * never say was where they came from — `addXP(id, 20)` recorded a number and
 * nothing else, so "level 14" was a fact about a player with no story behind
 * it. The breakdown is the whole reason this panel exists; the bar at the top
 * is what people already had.
 *
 * GAMES AND SOCIAL ARE SEPARATED
 * ──────────────────────────────
 * Winning at mafia and posting to the feed both earn XP and are not the same
 * kind of achievement. Mixed into one list, a player who posts a lot outranks
 * one who plays a lot inside their own profile, which is a claim neither of
 * them made. They are two lists.
 *
 * A BAR AT THE TOP OF THE CURVE
 * ─────────────────────────────
 * At level 100 there is no next level, so the bar has nothing to fill toward.
 * It shows full and says so, rather than sitting at 0% forever or dividing by
 * a zero-width level.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { LegacyAvatar, LegacyAvatarStyles } from './LegacyAvatar';
import { AURA_BY_TIER, nextAura, type PlayerCharacter, type LegacySourceBreakdown } from '@/types/legacy';

const PURPLE = '#c084fc';

/** Thousands separated, because six digits of XP is unreadable otherwise. */
const n = (x: number) => x.toLocaleString('en-US');

function SourceRow({ s, total }: { s: LegacySourceBreakdown; total: number }) {
  const share = total > 0 ? Math.round((s.xp / total) * 100) : 0;
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{s.emoji}</span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.label}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: s.color, fontWeight: 700, flexShrink: 0 }}>
          {n(s.xp)}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', width: 34, textAlign: 'right', flexShrink: 0 }}>
          {share}%
        </span>
      </div>
      {/* The share as a bar as well as a number: a row of percentages is a table
          to read, and a row of bars is a shape to glance at. */}
      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginTop: 5, overflow: 'hidden' }}>
        <div style={{ width: `${share}%`, height: '100%', background: s.color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

export function LegacyPanel({ character }: { character: PlayerCharacter }) {
  const [openGames, setOpenGames] = useState(true);
  const [openSocial, setOpenSocial] = useState(false);

  const c = character;
  const aura = c.avatarConfig.aura ? AURA_BY_TIER[c.avatarConfig.aura] : null;
  const next = nextAura(c.level);
  const pct = c.atMaxLevel ? 100 : Math.min(100, Math.round((c.xpIntoLevel / c.xpForLevel) * 100));

  const games = c.perSource.filter(s => s.kind === 'game');
  const social = c.perSource.filter(s => s.kind === 'social');
  const gamesXP = games.reduce((a, s) => a + s.xp, 0);
  const socialXP = social.reduce((a, s) => a + s.xp, 0);

  return (
    <div style={{ borderRadius: 18, padding: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <LegacyAvatarStyles />

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <LegacyAvatar config={c.avatarConfig} size={62} level={c.level} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: 'var(--font-display, inherit)', fontWeight: 800, fontSize: 17,
            color: c.avatarConfig.nameColor ?? '#fff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.displayName}</p>
          {c.avatarConfig.title && (
            <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{c.avatarConfig.title}</p>
          )}
          <p style={{ fontFamily: 'monospace', fontSize: 11, color: aura?.color ?? 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            დონე {c.level}{aura ? ` · ${aura.label}` : ''}
          </p>
        </div>
      </div>

      {/* ── The bar ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'rgba(255,255,255,0.45)' }}>
            {c.atMaxLevel ? 'მაქსიმალური დონე' : `${n(c.xpIntoLevel)} / ${n(c.xpForLevel)}`}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'rgba(255,255,255,0.3)' }}>
            სულ {n(c.totalXP)} XP
          </span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${aura?.color ?? PURPLE}, ${PURPLE})` }}
          />
        </div>
        {!c.atMaxLevel && (
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
            შემდეგ დონემდე {n(c.xpToNextLevel)} XP
            {next && ` · ${next.label} ${next.minLevel}-ე დონეზე`}
          </p>
        )}
      </div>

      {/* ── Reputation ───────────────────────────────────────────────────── */}
      {c.reputationTags.length > 0 && (
        <div style={{ marginTop: 15 }}>
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 7 }}>რეპუტაცია</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {c.reputationTags.map(t => (
              // The detail is the point: a tag nobody can trace is a sticker.
              <span key={t.key} title={t.detail}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 999,
                  background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.3)',
                  fontFamily: 'monospace', fontSize: 11, color: PURPLE,
                }}>
                <span>{t.emoji}</span>{t.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Achievements ─────────────────────────────────────────────────── */}
      {c.achievements.length > 0 && (
        <div style={{ marginTop: 15 }}>
          <p style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 7 }}>
            მიღწევები · {c.achievements.length}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {c.achievements.slice(0, 12).map(a => (
              <span key={a.key} title={a.name}
                style={{
                  width: 32, height: 32, borderRadius: 9, fontSize: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)',
                }}>{a.emoji}</span>
            ))}
            {c.achievements.length > 12 && (
              <span style={{
                width: 32, height: 32, borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
              }}>+{c.achievements.length - 12}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Breakdown ────────────────────────────────────────────────────── */}
      {c.perSource.length === 0 ? (
        /*
         * A player from before the ledger. Their XP is real and their level is
         * real; only the provenance is missing.
         *
         * The sections are not drawn at all here rather than drawn empty. A row
         * reading "თამაშები 0 XP" beside a total of 9,800 is a contradiction on
         * its face, and a reader has no way to know it means "not recorded"
         * rather than "none" — so the note says which, and the zero goes.
         */
        <p style={{ marginTop: 15, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.7, color: 'rgba(255,255,255,0.35)' }}>
          ეს XP ადრინდელი თამაშებიდანაა, სანამ წყაროს ჩაწერას დავიწყებდით.
          დაშლა თამაშების მიხედვით შემდეგი თამაშიდან გამოჩნდება.
        </p>
      ) : (
        <>
          {games.length > 0 && (
            <Section
              label="თამაშები" xp={gamesXP} total={c.totalXP}
              open={openGames} onToggle={() => setOpenGames(o => !o)} rows={games}
            />
          )}
          {social.length > 0 && (
            <Section
              label="აქტივობა" xp={socialXP} total={c.totalXP}
              open={openSocial} onToggle={() => setOpenSocial(o => !o)} rows={social}
            />
          )}
        </>
      )}
    </div>
  );
}

/** A section is only rendered when it has rows, so there is no empty state. */
function Section({ label, xp, total, open, onToggle, rows }: {
  label: string; xp: number; total: number; open: boolean; onToggle: () => void;
  rows: LegacySourceBreakdown[];
}) {
  return (
    <div style={{ marginTop: 15 }}>
      <button onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit',
        }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.3)', flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{n(xp)} XP</span>
      </button>
      {open && (
        <div style={{ marginTop: 4 }}>
          {rows.map(s => <SourceRow key={s.source} s={s} total={total} />)}
        </div>
      )}
    </div>
  );
}
