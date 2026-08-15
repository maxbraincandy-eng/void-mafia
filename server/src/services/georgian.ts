/**
 * Georgian noun cases for names.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Sentences were being built as `${name}-ის ჩანაწერი`, which produced
 * "ბატონი მაქსი-ის ჩანაწერი" on the live share card. That hyphen form is how
 * Georgian writes FOREIGN words; applied to a Georgian name it reads the way
 * "Max's's record" would read in English. On a memorial — where the sentence
 * is about a person someone lost — getting their name wrong is not a cosmetic
 * defect.
 *
 * Only the LAST word inflects: in "გიორგი ლომიძე" the given name stays as it
 * is and the surname carries the case — "გიორგი ლომიძის ჩანაწერი".
 *
 * A name with no Georgian letters keeps the hyphen, because for foreign words
 * that IS the correct convention: "ORPHEUS-ის ჩანაწერი".
 */

const GEORGIAN_WORD = /^[ა-ჿ]+$/;

/** Genitive: "მაქსი" → "მაქსის", "ლომიძე" → "ლომიძის", "ანა" → "ანას". */
export function genitive(nameRaw: string): string {
  const name = String(nameRaw ?? '').trim();
  if (!name) return name;

  const parts = name.split(/\s+/);
  const last = parts[parts.length - 1];
  if (!GEORGIAN_WORD.test(last)) return `${name}-ის`;

  const end = last.slice(-1);
  parts[parts.length - 1] =
    // The nominative marker drops before the case ending.
    end === 'ი' || end === 'ე' ? `${last.slice(0, -1)}ის`
      // Names already ending in a vowel just take -ს.
      : end === 'ა' || end === 'ო' || end === 'უ' ? `${last}ს`
        // Consonant-final names take the full ending.
        : `${last}ის`;

  return parts.join(' ');
}
