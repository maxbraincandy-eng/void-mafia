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
/** Genitive: "მაქსი" → "მაქსის", "ლომიძე" → "ლომიძის", "ანა" → "ანას". */
export declare function genitive(nameRaw: string): string;
//# sourceMappingURL=georgian.d.ts.map