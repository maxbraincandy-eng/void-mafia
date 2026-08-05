/**
 * Design-token integrity check.
 *
 * Three files have to agree, and nothing at runtime complains when they don't —
 * a missing CSS variable resolves to nothing and the element just loses that
 * property, on one theme only, which is exactly the kind of bug that reaches a
 * user before it reaches a build log:
 *
 *   design/tokens.ts            — what the code asks for
 *   ui/ThemeProvider.tsx        — what each of the three themes provides
 *   styles/globals.css :root    — the pre-mount fallback
 *
 * So: every token `T` references must exist in EVERY theme and in :root.
 * Runs as part of `npm run build`.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');

// ── what the code asks for: every v('name') in tokens.ts ──
const tokensSrc = read('src/design/tokens.ts');
const wanted = [...tokensSrc.matchAll(/\bv\('([a-z0-9-]+)'\)/g)].map(m => `--vm-${m[1]}`);
if (!wanted.length) {
  console.error('✗ check-tokens: parsed 0 tokens from design/tokens.ts — the v() helper must have been renamed, so this check is no longer checking anything.');
  process.exit(1);
}
const uniqWanted = [...new Set(wanted)];

// ── what each theme provides ──
// Walk THEME_VARS by brace depth rather than regex-matching a whole object, so
// a nested value containing braces can't truncate a theme early.
const themeSrc = read('src/components/ui/ThemeProvider.tsx');
const start = themeSrc.indexOf('const THEME_VARS');
if (start < 0) { console.error('✗ check-tokens: THEME_VARS not found in ThemeProvider.tsx'); process.exit(1); }

const themes = {};
{
  let i = themeSrc.indexOf('{', start), depth = 0, current = null, buf = '';
  for (; i < themeSrc.length; i++) {
    const ch = themeSrc[i];
    if (ch === '{') {
      depth++;
      if (depth === 2) { const m = buf.match(/'([a-z-]+)'\s*:\s*$/); current = m ? m[1] : null; if (current) themes[current] = new Set(); }
      buf = '';
      continue;
    }
    if (ch === '}') { depth--; if (depth === 0) break; if (depth === 1) current = null; buf = ''; continue; }
    buf += ch;
    if (depth === 2 && current && ch === ',') {
      const m = buf.match(/'(--[a-z0-9-]+)'\s*:/i);
      if (m) themes[current].add(m[1]);
      buf = '';
    }
  }
}
const themeNames = Object.keys(themes);
if (themeNames.length < 2) { console.error(`✗ check-tokens: parsed ${themeNames.length} theme(s) — expected at least 2`); process.exit(1); }

// ── what :root falls back to ──
const cssSrc = read('src/styles/globals.css');
const rootStart = cssSrc.indexOf(':root {');
const rootEnd = cssSrc.indexOf('\n}', rootStart);
const rootBlock = cssSrc.slice(rootStart, rootEnd);
const rootVars = new Set([...rootBlock.matchAll(/(--vm-[a-z0-9-]+)\s*:/g)].map(m => m[1]));

// ── report ──
const problems = [];
for (const name of themeNames) {
  const missing = uniqWanted.filter(t => !themes[name].has(t));
  if (missing.length) problems.push(`theme '${name}' is missing ${missing.length}: ${missing.join(', ')}`);
}
const missingRoot = uniqWanted.filter(t => !rootVars.has(t));
if (missingRoot.length) problems.push(`globals.css :root is missing ${missingRoot.length}: ${missingRoot.join(', ')}`);

// Themes drifting apart from each other matters even for keys tokens.ts does
// not use yet — that is how a legacy var ends up defined on one theme only.
const union = new Set(themeNames.flatMap(n => [...themes[n]]));
for (const name of themeNames) {
  const gaps = [...union].filter(k => !themes[name].has(k));
  if (gaps.length) problems.push(`theme '${name}' lacks ${gaps.length} var(s) other themes define: ${gaps.join(', ')}`);
}

if (problems.length) {
  console.error('✗ design tokens are inconsistent:\n' + problems.map(p => `  · ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${uniqWanted.length} design tokens present in all ${themeNames.length} themes (${themeNames.join(', ')}) and in :root`);
