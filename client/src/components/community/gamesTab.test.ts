/**
 * Every game in the catalogue is in a section.
 *
 * THE FAILURE THIS EXISTS FOR
 * ───────────────────────────
 * Membership of the hub is the `SECTIONS` list, not a field on the game — the
 * file says so — and a game absent from every section's `ids` is silently
 * never rendered. `sectionGames` maps section ids to definitions; it never asks
 * the other way round.
 *
 * So a new game can be completely finished — the definition added, the modal
 * wired, the server shipped, the tests green — and be invisible. Both სიტყვა
 * and ვინ თქვა? shipped that way. Nothing warned, because nothing was wrong:
 * the catalogue had them and the hub was never asked to show them.
 *
 * This reads the source rather than importing the component, because the
 * catalogue is built inside the component body out of closures over its own
 * state. Scraping is crude, so the parse is checked before it is trusted: if
 * either list comes back implausibly short the test fails rather than passing
 * on having found nothing.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, 'GamesTab.tsx'), 'utf8');

/** The ids listed inside the SECTIONS array. */
function sectionIds(): string[] {
  const start = src.indexOf('const SECTIONS: SectionDef[] = [');
  assert.ok(start >= 0, 'SECTIONS has been renamed — this test is stale');
  const end = src.indexOf('\n];', start);
  assert.ok(end > start, 'could not find the end of SECTIONS');
  const block = src.slice(start, end);
  return [...block.matchAll(/'([a-z0-9_]+)'/g)]
    .map(m => m[1]!)
    // The section's own id and its title/emoji fields live in the same block.
    .filter(id => !['fun', 'mind', 'spaces'].includes(id));
}

/** Every game id the catalogue defines, from both the array and the pushes. */
function catalogueIds(): string[] {
  const start = src.indexOf('const defs: GameDef[] = [');
  assert.ok(start >= 0, 'the catalogue has been restructured — this test is stale');
  const end = src.indexOf('const byId', start);
  assert.ok(end > start, 'could not find the end of the catalogue');
  const block = src.slice(start, end);
  return [...block.matchAll(/\{\s*id:\s*'([a-z0-9_]+)'/g)].map(m => m[1]!);
}

const SECTION = sectionIds();
const CATALOGUE = catalogueIds();

test('the lists were actually parsed', () => {
  // A scrape that finds nothing would otherwise make every assertion below
  // vacuously true, which is the one way this test could lie.
  assert.ok(SECTION.length >= 25, `only ${SECTION.length} ids found in SECTIONS`);
  assert.ok(CATALOGUE.length >= 25, `only ${CATALOGUE.length} games found in the catalogue`);
});

test('every game in the catalogue appears in a section', () => {
  const missing = CATALOGUE.filter(id => !SECTION.includes(id));
  assert.deepEqual(missing, [],
    `these games are defined but can never be seen: ${missing.join(', ')}`);
});

test('no section lists a game twice', () => {
  const seen = new Set<string>();
  const dupes = SECTION.filter(id => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual(dupes, [], `listed more than once: ${dupes.join(', ')}`);
});

test('the two games added most recently are reachable', () => {
  // Named rather than left to the sweep above, because these are the two that
  // shipped invisible and the regression would otherwise be a silent one.
  for (const id of ['word', 'whosaid']) {
    assert.ok(CATALOGUE.includes(id), `${id} is not in the catalogue`);
    assert.ok(SECTION.includes(id), `${id} is in the catalogue but in no section`);
  }
});
