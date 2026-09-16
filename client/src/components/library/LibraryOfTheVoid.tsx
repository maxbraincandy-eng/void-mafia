/**
 * THE LIBRARY OF THE VOID.
 *
 * An infinite library, entered from გონება. Every book contains a possibility.
 *
 * WHAT THIS VERSION IS
 * ────────────────────
 * A room, six books on a shelf, a search, and chance. No server, no account, no
 * match history, no procedural generation — the catalogue is twenty pieces of
 * fiction in `libraryBooks.ts` and this file draws them. That is deliberate:
 * the feature is self-contained so it can be judged on whether it feels right
 * before anything is wired into it.
 *
 * WHERE IT IS MEANT TO GO
 * ───────────────────────
 * The seam is `libraryBooks.ts` and nowhere else. This screen asks three
 * questions — what is on the shelf, what matches this, give me one at random —
 * so a catalogue that later comes from somewhere real (a match that was played,
 * a book written for one reader, an archive that remembers who opened what)
 * replaces that file and leaves this one alone.
 *
 * NAVIGATION IS TWO STATES
 * ────────────────────────
 * The Library, or one open book. There is no third screen and no route: you are
 * looking at the room, or you are reading, and closing the book puts you back
 * exactly where you were. A place that is supposed to feel endless should not
 * ask anybody to learn its menus.
 *
 * WHY THE INTERFACE IS IN ENGLISH
 * ───────────────────────────────
 * Everything else in this product is Georgian. The Library is not of this
 * place, and it says so by not speaking the language of the rest of the app —
 * the spec set every string in English and it reads as deliberate rather than
 * untranslated. The tile in the hub carries a Georgian subtitle so the catalogue
 * still makes sense from outside.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { LibraryAtmosphere } from './LibraryAtmosphere';
import { SHELF, searchLibrary, randomBook, type VoidBook } from './libraryBooks';

const INK = '#cfe4f2';
const GLOW = '#79c6e8';
const VIOLET = '#9a86d8';

export function LibraryOfTheVoid({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<VoidBook | null>(null);
  const lastRandom = useRef<string | undefined>(undefined);

  const result = useMemo(() => searchLibrary(query), [query]);
  const searching = query.trim().length > 0;

  const read = useCallback((b: VoidBook) => setOpen(b), []);
  const drawOne = useCallback(() => {
    const b = randomBook(lastRandom.current);
    lastRandom.current = b.id;
    setOpen(b);
  }, []);

  // Escape closes the book first, the Library second — the order you expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open) setOpen(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[730] overflow-y-auto"
      style={{ background: '#04060c' }}>

      <LibraryAtmosphere dim={!!open} />

      {/* Everything readable sits above the room. */}
      <div className="relative min-h-full flex flex-col max-w-lg mx-auto px-5 pb-12">

        <div className="flex items-center pt-5 pb-1">
          <button onClick={onClose} aria-label="Leave the Library"
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              color: 'rgba(207,228,242,0.6)',
              background: 'rgba(120,180,220,0.06)',
              border: '1px solid rgba(120,180,220,0.18)',
            }}>✕</button>
        </div>

        {/* ── The name of the place ────────────────────────────────────────── */}
        <div className="pt-6 pb-7 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.15 }}
            className="font-display font-black leading-tight"
            style={{
              fontSize: 'clamp(21px, 6.2vw, 27px)',
              color: INK,
              letterSpacing: '0.055em',
              textShadow: `0 0 26px rgba(121,198,232,0.28)`,
            }}>
            THE LIBRARY<br />OF THE VOID
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: 0.7 }}
            className="font-mono pt-3"
            style={{ fontSize: 11.5, color: 'rgba(207,228,242,0.44)', letterSpacing: '0.04em' }}>
            “Every book contains a possibility.”
          </motion.p>
        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className="relative pb-6">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the Library…"
            aria-label="Search the Library"
            spellCheck={false}
            className="w-full h-12 rounded-xl px-4 font-mono outline-none"
            style={{
              fontSize: 13,
              color: INK,
              background: 'rgba(10,18,32,0.55)',
              border: '1px solid rgba(120,180,220,0.18)',
              backdropFilter: 'blur(3px)',
            }} />
          {searching && (
            <button onClick={() => setQuery('')} aria-label="Clear"
              className="absolute right-3 top-0 h-12 font-mono"
              style={{ fontSize: 12, color: 'rgba(207,228,242,0.4)' }}>✕</button>
          )}
        </div>

        {/* ── What the Library has to say ──────────────────────────────────── */}
        {searching ? (
          <div className="flex-1">
            {result.found.map((b, i) => (
              <Entry key={b.id} book={b} index={i} onOpen={read} />
            ))}
            {result.unindexed && <Entry book={result.unindexed} index={0} onOpen={read} faint />}
          </div>
        ) : (
          <div className="flex-1">
            <p className="font-mono pb-3"
              style={{ fontSize: 10, color: 'rgba(207,228,242,0.3)', letterSpacing: '0.16em' }}>
              WITHIN REACH
            </p>
            {SHELF.map((b, i) => (
              <Entry key={b.id} book={b} index={i} onOpen={read} />
            ))}

            {/*
              * The only line that says out loud how big the place is — once,
              * quietly, and without a number that could ever be checked.
              */}
            <p className="font-mono text-center pt-7 pb-6"
              style={{ fontSize: 10.5, color: 'rgba(207,228,242,0.22)', lineHeight: 1.9 }}>
              The remaining shelves continue<br />past the reach of the light.
            </p>

            <button onClick={drawOne}
              className="w-full h-12 rounded-xl font-mono"
              style={{
                fontSize: 12,
                letterSpacing: '0.12em',
                color: GLOW,
                background: 'rgba(121,198,232,0.07)',
                border: '1px solid rgba(121,198,232,0.28)',
              }}>
              OPEN A RANDOM BOOK
            </button>
          </div>
        )}
      </div>

      {/* ── One open book ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && <Reading book={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/** A book on the shelf, or in a list of results. */
function Entry({ book, index, onOpen, faint }: {
  book: VoidBook; index: number; onOpen: (b: VoidBook) => void; faint?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.07 }}
      onClick={() => onOpen(book)}
      className="w-full text-left flex items-baseline gap-3 py-3.5 px-3 rounded-lg mb-1.5"
      style={{
        // Translucent on purpose: the shelves have to stay visible behind the
        // shelf, or the room is a picture the list is standing in front of.
        background: 'rgba(8,14,26,0.34)',
        border: '1px solid rgba(120,180,220,0.14)',
        backdropFilter: 'blur(2px)',
        opacity: faint ? 0.72 : 1,
      }}>
      <span className="font-mono flex-shrink-0"
        style={{ fontSize: 9.5, color: 'rgba(154,134,216,0.6)', letterSpacing: '0.06em' }}>
        {book.id}
      </span>
      <span className="font-display flex-1 min-w-0"
        style={{ fontSize: 13.5, color: INK, letterSpacing: '0.03em' }}>
        {book.title}
      </span>
    </motion.button>
  );
}

/**
 * Reading.
 *
 * Over the room rather than instead of it — the Library stays visible and dims
 * behind the page, because a reader who is shown a blank screen has left, and
 * the whole point is that they have not.
 */
function Reading({ book, onClose }: { book: VoidBook; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[740] flex items-center justify-center px-6"
      style={{ background: 'rgba(3,5,11,0.86)', backdropFilter: 'blur(7px)' }}
      onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl px-6 py-8"
        style={{
          background: 'linear-gradient(180deg, rgba(14,22,38,0.96), rgba(8,12,22,0.96))',
          border: '1px solid rgba(120,180,220,0.2)',
          boxShadow: '0 0 60px rgba(60,120,180,0.13)',
        }}>

        <p className="font-mono text-center"
          style={{ fontSize: 9.5, color: 'rgba(154,134,216,0.75)', letterSpacing: '0.16em' }}>
          BOOK #{book.id}
        </p>
        <h2 className="font-display font-black text-center pt-3 pb-6 leading-snug"
          style={{ fontSize: 17, color: INK, letterSpacing: '0.04em' }}>
          {book.title}
        </h2>

        {/*
          * The text arrives a line at a time.
          *
          * These are two or three sentences and the last of them is usually the
          * turn — showing all of it at once throws the ending away.
          */}
        <div className="pb-7">
          {book.lines.map((l, i) => (
            <motion.p key={i}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.35 + i * 0.55 }}
              className="font-mono text-center"
              style={{ fontSize: 13, color: 'rgba(207,228,242,0.86)', lineHeight: 2.05 }}>
              {l}
            </motion.p>
          ))}
        </div>

        <button onClick={onClose}
          className="w-full h-11 rounded-xl font-mono"
          style={{
            fontSize: 11,
            letterSpacing: '0.14em',
            color: 'rgba(207,228,242,0.6)',
            background: 'rgba(120,180,220,0.06)',
            border: '1px solid rgba(120,180,220,0.16)',
          }}>
          RETURN TO THE LIBRARY
        </button>
      </motion.div>
    </motion.div>
  );
}

export default LibraryOfTheVoid;
