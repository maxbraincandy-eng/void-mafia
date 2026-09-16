/**
 * The Library of the Void — its catalogue.
 *
 * WHY THIS IS A SEPARATE FILE
 * ───────────────────────────
 * Everything the Library knows lives here, and nothing here knows anything
 * about React. The screen asks three questions — what is on the shelf, what
 * matches this, give me one at random — and those three functions are the whole
 * surface. When the catalogue later comes from somewhere else (a match that was
 * played, a book written for one player, an archive that remembers who opened
 * what), only this file changes and the screen does not.
 *
 * NOTHING HERE TOUCHES REAL PLAYER DATA
 * ─────────────────────────────────────
 * Deliberately. This first version is self-contained fiction: no account, no
 * match history, no server. `MAX_ENTRY` names a Max because the Library is
 * supposed to feel as though it already knows things, not because it read
 * anybody's profile.
 *
 * ON LENGTH
 * ─────────
 * Two or three lines each, and the test enforces it. A book that explains
 * itself is not mysterious, it is documentation — and the whole design rests on
 * the reader believing there is far more here than they are being shown.
 */

export interface VoidBook {
  /** The catalogue number, as the Library gives it. Not an index. */
  id: string;
  title: string;
  /** The text, one line per line. Short. */
  lines: string[];
}

/**
 * The six on the shelf, in the order they stand.
 *
 * These are the ones a visitor can see. Everything else in the Library has to
 * be found — which is the point of having an everything else.
 */
export const SHELF: VoidBook[] = [
  {
    id: '000001',
    title: 'THE BOOK OF NAMES',
    lines: [
      'Every name ever spoken is written here.',
      'Yours appears on page 4,102.',
      'The entry is not finished.',
    ],
  },
  {
    id: '004417',
    title: 'THE BOOK OF FORGOTTEN GAMES',
    lines: [
      'Some games end.',
      'Others are merely no longer played.',
      'This book lists the second kind.',
    ],
  },
  {
    id: '011088',
    title: 'THE BOOK OF MIRRORS',
    lines: [
      'Each page reflects the reader.',
      'Those who have looked twice',
      'report two different reflections.',
    ],
  },
  {
    id: '100000',
    title: 'THE BOOK OF POSSIBILITIES',
    lines: [
      'It contains everything that could still happen.',
      'It is thinner than expected.',
    ],
  },
  {
    id: '000000',
    title: 'THE BOOK OF THE UNKNOWN',
    lines: [
      'The pages are blank.',
      'The index is forty pages long.',
    ],
  },
  {
    id: '——————',
    title: 'THE BOOK WITHOUT A TITLE',
    lines: [
      'Readers who open it agree on what it says.',
      'None can repeat it afterwards.',
    ],
  },
];

/**
 * Everything else. Found by searching, or by chance.
 *
 * The Library is meant to feel larger than the shelf, and this is the cheapest
 * honest way to do that: things exist here that a visitor will only meet if
 * they go looking, and a few they will only ever meet by accident.
 */
export const ARCHIVE: VoidBook[] = [
  {
    id: '000271',
    title: 'VISITOR RECORD',
    lines: [
      'Max entered the library at 03:17.',
      'No record exists of Max leaving.',
    ],
  },
  {
    id: '719204',
    title: 'THE MAN WHO NEVER LEFT',
    lines: [
      'He entered the library once.',
      'According to the library,',
      'he is still here.',
    ],
  },
  {
    id: '000318',
    title: 'THE HOUR AFTER',
    lines: [
      'Something happens at 03:18.',
      'The Library declines to specify.',
    ],
  },
  {
    id: '001114',
    title: 'THE CATALOGUE OF DOORS',
    lines: [
      'The Library has 1,114 doors.',
      'Eleven of them open outward.',
    ],
  },
  {
    id: '000002',
    title: 'THE BOOK OF THE SECOND FLOOR',
    lines: [
      'There is no second floor.',
      'The stairs disagree.',
    ],
  },
  {
    id: '000012',
    title: 'THE RECORD OF QUIET ROOMS',
    lines: [
      'Room 12 has never been entered.',
      'It is always warm.',
    ],
  },
  {
    id: '098001',
    title: 'THE BOOK OF LAST PAGES',
    lines: [
      'Final pages only.',
      'Some of them are yours.',
    ],
  },
  {
    id: '004000',
    title: 'THE BOOK OF WAITING',
    lines: [
      'Written by someone expecting company.',
      'It is four thousand pages long.',
    ],
  },
  {
    id: '000003',
    title: 'THE INVENTORY',
    lines: [
      'Every object ever lost here.',
      'Including three librarians.',
    ],
  },
  {
    id: '060060',
    title: 'THE BOOK OF RETURNS',
    lines: [
      'Books that came back',
      'from readers who did not.',
    ],
  },
  {
    id: '999999',
    title: 'THE BOOK OF ALMOST',
    lines: [
      'Everything that nearly happened.',
      'It is the largest book in the Library.',
    ],
  },
  {
    id: '000009',
    title: 'THE SILENT SHELF',
    lines: [
      'Shelf 9 makes no sound.',
      'Books removed from it are never missed.',
    ],
  },
  {
    id: '021300',
    title: 'THE BOOK OF CORRIDORS',
    lines: [
      'Walk east for long enough',
      'and you arrive where you began, older.',
    ],
  },
  {
    id: '000047',
    title: 'ON THE READING OF THIS BOOK',
    lines: [
      'You are being read at the same rate.',
      'The Library keeps both records.',
    ],
  },
];

/** Everything the Library will admit to holding. */
export const CATALOGUE: VoidBook[] = [...SHELF, ...ARCHIVE];

export interface LibrarySearch {
  query: string;
  /** Books the Library found. */
  found: VoidBook[];
  /**
   * What the Library says when it found nothing.
   *
   * Not an error and not an empty list. A search that returns "0 results" is a
   * database; a search that answers is a library. Exactly one of `found` and
   * `unindexed` is ever populated.
   */
  unindexed: VoidBook | null;
}

/**
 * The reply when there is no such book.
 *
 * One fixed entry with the query set into it — not a generator. The first
 * version of the Library deliberately has no procedural generation in it, and
 * this is a single sentence that happens to quote you back.
 */
function unindexedFor(query: string): VoidBook {
  return {
    id: '— — — — — —',
    title: 'THE ENTRY THAT IS NOT YET WRITTEN',
    lines: [
      `The Library holds no record of “${query}”.`,
      'It suggests you return when you do.',
    ],
  };
}

/**
 * Look something up.
 *
 * Matches on title and on the text, because a visitor typing "mirror" means
 * the book about mirrors and a visitor typing "Max" means the line with Max in
 * it, and the Library should not care which of the two they were doing.
 */
export function searchLibrary(raw: string): LibrarySearch {
  const query = raw.trim();
  if (!query) return { query, found: [], unindexed: null };

  const needle = query.toLowerCase();
  const found = CATALOGUE.filter(b =>
    b.title.toLowerCase().includes(needle) ||
    b.lines.some(l => l.toLowerCase().includes(needle)));

  return { query, found, unindexed: found.length ? null : unindexedFor(query) };
}

/**
 * One book, by chance.
 *
 * `avoid` is the book just shown: drawing the same one twice running makes a
 * Library of twenty feel like a Library of one, which is the opposite of the
 * whole effect. With nothing to avoid it draws from everything.
 */
export function randomBook(avoid?: string): VoidBook {
  const pool = CATALOGUE.filter(b => b.id !== avoid);
  const from = pool.length ? pool : CATALOGUE;
  return from[Math.floor(Math.random() * from.length)]!;
}
