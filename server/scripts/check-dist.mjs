#!/usr/bin/env node
// ── Deploy guard ──────────────────────────────────────────────────────
// railway.toml ships the COMMITTED server/dist ("using pre-built dist") rather
// than building on the host. That makes an ignored or unstaged build output a
// hard production crash: node throws ERR_MODULE_NOT_FOUND on an import that
// exists locally but was never committed, and it dies before listen(), so the
// healthcheck has nothing to answer it and the site goes down.
//
// That is exactly how v530 fell over — a bare `data/` line in .gitignore
// silently swallowed server/src/data/logic/ and server/dist/data/logic/.
//
// Run before pushing:  npm run check:dist  (also wired into `npm run build`)
import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');   // repo root
const DIST = resolve(import.meta.dirname, '..', 'dist');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(DIST).map(f => relative(ROOT, f).split('\\').join('/'));
if (files.length === 0) {
  console.error('✗ server/dist has no .js files — run `npx tsc` first.');
  process.exit(1);
}

// Ask git, in one call, which of these it is ignoring or does not know about.
const tracked = new Set(
  execSync('git ls-files server/dist', { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n').filter(Boolean),
);

const missing = files.filter(f => !tracked.has(f));
if (missing.length) {
  console.error(`✗ ${missing.length} compiled file(s) are NOT committed — the deploy would crash on import:\n`);
  for (const m of missing.slice(0, 25)) {
    let why = '';
    try {
      why = execSync(`git check-ignore -v -- "${m}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch { why = '(untracked — never `git add`ed)'; }
    console.error(`   ${m}\n     ↳ ${why}`);
  }
  if (missing.length > 25) console.error(`   …and ${missing.length - 25} more`);
  console.error('\nFix the .gitignore rule (anchor it with a leading slash) or `git add` the files, then re-run.');
  process.exit(1);
}

console.log(`✓ all ${files.length} compiled server files are committed — safe to deploy`);
