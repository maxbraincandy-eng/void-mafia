/**
 * The Library of the Void — its catalogue and the three questions asked of it.
 *
 * The rules worth pinning down here are the ones that are invisible on screen:
 * a book that is too long still renders, a duplicate catalogue number still
 * renders, and a search that quietly finds nothing looks exactly like a search
 * that found something until you read it.
 */

import { test } from 'node:test';
import { strict as assert } from 'assert';

import {
  SHELF, ARCHIVE, CATALOGUE, searchLibrary, randomBook,
} from './libraryBooks.js';

test('the shelf holds the six books a visitor can see, in order', () => {
  assert.deepEqual(SHELF.map(b => b.title), [
    'THE BOOK OF NAMES',
    'THE BOOK OF FORGOTTEN GAMES',
    'THE BOOK OF MIRRORS',
    'THE BOOK OF POSSIBILITIES',
    'THE BOOK OF THE UNKNOWN',
    'THE BOOK WITHOUT A TITLE',
  ]);
});

test('the Library is larger than its shelf', () => {
  /*
   * The whole design rests on the visitor believing there is more here than
   * they are being shown. If the archive were ever emptied, searching and
   * chance would only ever return the six on the shelf and the illusion would
   * be gone — without anything looking broken.
   */
  assert.ok(ARCHIVE.length >= 10, `only ${ARCHIVE.length} books beyond the shelf`);
  assert.ok(CATALOGUE.length > SHELF.length);
});

test('every book is well formed', () => {
  for (const b of CATALOGUE) {
    assert.ok(b.id.length > 0, `a book has no catalogue number`);
    assert.ok(b.title.trim().length > 0, `book ${b.id} has no title`);
    assert.ok(b.lines.length >= 2, `book ${b.id} is a single line`);
  }
});

test('no book explains itself', () => {
  // Short is the rule. A book that needs a paragraph is documentation.
  for (const b of CATALOGUE) {
    assert.ok(b.lines.length <= 3, `${b.title} runs to ${b.lines.length} lines`);
    for (const l of b.lines) {
      assert.ok(l.length <= 56, `a line of ${b.title} is ${l.length} characters: "${l}"`);
    }
  }
});

test('no two books share a catalogue number', () => {
  const ids = CATALOGUE.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length, 'the catalogue has a duplicate number');
});

// ── searching ───────────────────────────────────────────────────────────────

test('a search finds a book by its title', () => {
  const r = searchLibrary('mirrors');
  assert.equal(r.unindexed, null);
  assert.ok(r.found.some(b => b.title === 'THE BOOK OF MIRRORS'));
});

test('a search finds a book by something written inside it', () => {
  // The example the Library was designed around: a name, not a title.
  const r = searchLibrary('Max');
  assert.equal(r.unindexed, null, 'the Library did not know about Max');
  assert.ok(r.found.some(b => b.id === '000271'), 'the visitor record was not found');
});

test('searching does not care about case', () => {
  assert.deepEqual(
    searchLibrary('MAX').found.map(b => b.id),
    searchLibrary('max').found.map(b => b.id),
  );
});

test('a search with nothing to find is answered, not refused', () => {
  /*
   * A "0 results" is a database. The Library replies — and the reply quotes
   * the visitor back, which is the whole difference in feel.
   */
  const r = searchLibrary('zzzzzzz');
  assert.equal(r.found.length, 0);
  assert.ok(r.unindexed, 'the Library said nothing at all');
  assert.ok(r.unindexed!.lines.join(' ').includes('zzzzzzz'),
    'the reply does not mention what was asked for');
});

test('found and unindexed are never both set', () => {
  for (const q of ['mirrors', 'Max', 'zzzzzzz', 'the', 'door']) {
    const r = searchLibrary(q);
    assert.ok(!(r.found.length && r.unindexed), `both were set for "${q}"`);
  }
});

test('an empty search asks nothing and is told nothing', () => {
  for (const q of ['', '   ', '\n']) {
    const r = searchLibrary(q);
    assert.equal(r.found.length, 0, `"${q}" returned books`);
    assert.equal(r.unindexed, null, `"${q}" got a reply it did not ask for`);
  }
});

test('surrounding space does not change the answer', () => {
  assert.deepEqual(
    searchLibrary('  mirrors  ').found.map(b => b.id),
    searchLibrary('mirrors').found.map(b => b.id),
  );
});

// ── chance ──────────────────────────────────────────────────────────────────

test('a random book is a book from the catalogue', () => {
  for (let i = 0; i < 200; i++) {
    const b = randomBook();
    assert.ok(CATALOGUE.some(x => x.id === b.id), `${b.id} is not in the catalogue`);
  }
});

test('the same book is never drawn twice running', () => {
  /*
   * Twenty books will otherwise repeat within a handful of presses, and a
   * Library that hands you the same volume twice feels like a Library of one.
   */
  let last: string | undefined;
  for (let i = 0; i < 300; i++) {
    const b = randomBook(last);
    assert.notEqual(b.id, last, 'the Library repeated itself');
    last = b.id;
  }
});

test('chance reaches beyond the shelf', () => {
  // If it only ever drew the visible six, the archive would be unreachable.
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) seen.add(randomBook().id);
  const beyond = ARCHIVE.filter(b => seen.has(b.id));
  assert.ok(beyond.length >= ARCHIVE.length - 1,
    `chance only ever reached ${beyond.length} of ${ARCHIVE.length} archived books`);
});
