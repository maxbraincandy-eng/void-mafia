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
    title: 'სახელების წიგნი',
    lines: [
      'აქ ჩაწერილია ყველა სახელი, რაც კი წარმოთქმულა.',
      'შენი 4,102-ე გვერდზეა.',
      'ჩანაწერი დაუსრულებელია.',
    ],
  },
  {
    id: '004417',
    title: 'დავიწყებული თამაშების წიგნი',
    lines: [
      'ზოგი თამაში მთავრდება.',
      'სხვები უბრალოდ აღარ თამაშდება.',
      'ეს წიგნი მეორეებს ჩამოთვლის.',
    ],
  },
  {
    id: '011088',
    title: 'სარკეების წიგნი',
    lines: [
      'ყოველი გვერდი მკითხველს ირეკლავს.',
      'ვინც ორჯერ ჩაიხედა,',
      'ორ სხვადასხვა ანარეკლს იხსენებს.',
    ],
  },
  {
    id: '100000',
    title: 'შესაძლებლობების წიგნი',
    lines: [
      'შეიცავს ყველაფერს, რაც ჯერ კიდევ შეიძლება მოხდეს.',
      'მოსალოდნელზე თხელია.',
    ],
  },
  {
    id: '000000',
    title: 'უცნობის წიგნი',
    lines: [
      'გვერდები ცარიელია.',
      'საძიებელი ორმოცი გვერდია.',
    ],
  },
  {
    id: '——————',
    title: 'წიგნი სათაურის გარეშე',
    lines: [
      'ვინც კი გახსნა, ერთსა და იმავეს ამბობს.',
      'შემდეგ ვერავინ იმეორებს.',
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
    title: 'სტუმრის ჩანაწერი',
    lines: [
      'მაქსი ბიბლიოთეკაში 03:17-ზე შევიდა.',
      'მისი გასვლის ჩანაწერი არ არსებობს.',
    ],
  },
  {
    id: '719204',
    title: 'კაცი, რომელიც არ წასულა',
    lines: [
      'ერთხელ შემოვიდა ბიბლიოთეკაში.',
      'ბიბლიოთეკის თქმით,',
      'ის ჯერ კიდევ აქ არის.',
    ],
  },
  {
    id: '000318',
    title: 'ერთი წუთის შემდეგ',
    lines: [
      '03:18-ზე რაღაც ხდება.',
      'ბიბლიოთეკა დაზუსტებაზე უარს ამბობს.',
    ],
  },
  {
    id: '001114',
    title: 'კარების კატალოგი',
    lines: [
      'ბიბლიოთეკას 1,114 კარი აქვს.',
      'მათგან თერთმეტი გარეთ იღება.',
    ],
  },
  {
    id: '000002',
    title: 'მეორე სართულის წიგნი',
    lines: [
      'მეორე სართული არ არსებობს.',
      'კიბე არ ეთანხმება.',
    ],
  },
  {
    id: '000012',
    title: 'ჩუმი ოთახების ჩანაწერი',
    lines: [
      'მე-12 ოთახში არავინ შესულა.',
      'იქ ყოველთვის თბილა.',
    ],
  },
  {
    id: '098001',
    title: 'ბოლო გვერდების წიგნი',
    lines: [
      'მხოლოდ ბოლო გვერდები.',
      'ზოგი მათგანი შენია.',
    ],
  },
  {
    id: '004000',
    title: 'ლოდინის წიგნი',
    lines: [
      'დაწერა ვიღაცამ, ვინც სტუმარს ელოდა.',
      'ოთხი ათასი გვერდია.',
    ],
  },
  {
    id: '000003',
    title: 'ინვენტარი',
    lines: [
      'ყველაფერი, რაც კი აქ დაკარგულა.',
      'მათ შორის სამი ბიბლიოთეკარი.',
    ],
  },
  {
    id: '060060',
    title: 'დაბრუნებულთა წიგნი',
    lines: [
      'წიგნები, რომლებიც დაბრუნდა',
      'მკითხველებისგან, რომლებიც არა.',
    ],
  },
  {
    id: '999999',
    title: 'თითქმისის წიგნი',
    lines: [
      'ყველაფერი, რაც კინაღამ მოხდა.',
      'ბიბლიოთეკის ყველაზე დიდი წიგნია.',
    ],
  },
  {
    id: '000009',
    title: 'მდუმარე თარო',
    lines: [
      'მე-9 თარო ხმას არ გამოსცემს.',
      'იქიდან აღებულ წიგნებს არავინ ეძებს.',
    ],
  },
  {
    id: '021300',
    title: 'დერეფნების წიგნი',
    lines: [
      'იარე აღმოსავლეთით საკმარისად დიდხანს',
      'და იქ მიხვალ, სადაც დაიწყე — უფროსი.',
    ],
  },
  {
    id: '000047',
    title: 'ამ წიგნის კითხვის შესახებ',
    lines: [
      'შენც იმავე სიჩქარით გკითხულობენ.',
      'ბიბლიოთეკა ორივე ჩანაწერს ინახავს.',
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
    title: 'ჩანაწერი, რომელიც ჯერ არ დაწერილა',
    lines: [
      `ბიბლიოთეკას „${query}“-ის ჩანაწერი არ აქვს.`,
      'გირჩევს, დაბრუნდე, როცა შენ გექნება.',
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

  /*
   * Lowercased, though nothing in the catalogue currently needs it.
   *
   * Mkhedruli has no case, so while every book is Georgian this line does
   * nothing at all — a mutation removing it breaks no test, and there is no
   * honest test to write for it. It stays because the moment the catalogue
   * holds a name (a player's, a match's) it will be Latin and it will matter.
   */
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
