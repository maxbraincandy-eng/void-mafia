/**
 * VOID IQ — question bank. Original, abstract, culture-reduced cognitive items
 * across six domains. All correct answers live here on the server; the client
 * only ever receives sanitized questions (no `correctId`). Scoring is therefore
 * server-authoritative and reproducible.
 *
 * Visual questions are described by a small JSON "spec" that the client's
 * IQGlyph renderer draws as SVG — so nothing here is a copyrighted image, and
 * new item types can be added later without touching the renderer's contract.
 */
// ── Cell builders (keep the pool terse) ─────────────────────────────────────
const EMPTY = { empty: true };
const P = (sides, rot = 0, fill = false, size = 0.9) => ({ shapes: [{ t: 'poly', sides, rot, fill, size }] });
const DOT = (n, fill = true) => ({ shapes: [{ t: 'dots', n, fill }] });
const ARR = (rot, fill = false, mirror = false) => ({ shapes: [{ t: 'arrow', rot, fill, mirror }] });
const FLAG = (rot, mirror = false) => ({ shapes: [{ t: 'flag', rot, mirror }] });
const GRID = (n) => ({ shapes: [{ t: 'grid', n }] });
const BARS = (o) => ({ shapes: [{ t: 'bars', ...o }] });
const CIRC = (fill = false, size = 0.9) => ({ shapes: [{ t: 'circle', fill, size }] });
const vopt = (id, cell) => ({ id, cell });
const topt = (id, text) => ({ id, text });
// ── The pool ────────────────────────────────────────────────────────────────
// Section order = presentation order; within a section, easy → hard.
export const IQ_POOL = [
    // ══ PATTERN RECOGNITION (visual sequences) ══
    {
        id: 'pat1', domain: 'pattern', difficulty: 1,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [DOT(1), DOT(2), DOT(3), DOT(4), EMPTY] },
        options: [vopt('a', DOT(5)), vopt('b', DOT(6)), vopt('c', DOT(4)), vopt('d', DOT(3))],
        correctId: 'a',
    },
    {
        id: 'pat2', domain: 'pattern', difficulty: 2,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [ARR(0), ARR(45), ARR(90), ARR(135), EMPTY] },
        options: [vopt('a', ARR(180)), vopt('b', ARR(225)), vopt('c', ARR(135)), vopt('d', ARR(90))],
        correctId: 'a',
    },
    {
        id: 'pat3', domain: 'pattern', difficulty: 3,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [P(3), P(4), P(5), P(6), EMPTY] },
        options: [vopt('a', P(7)), vopt('b', P(6)), vopt('c', P(8)), vopt('d', P(5))],
        correctId: 'a',
    },
    {
        id: 'pat4', domain: 'pattern', difficulty: 3,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [P(4, 0, true), P(4, 30, false), P(4, 60, true), P(4, 90, false), EMPTY] },
        options: [vopt('a', P(4, 120, true)), vopt('b', P(4, 120, false)), vopt('c', P(4, 90, true)), vopt('d', P(4, 150, true))],
        correctId: 'a',
    },
    {
        id: 'pat5', domain: 'pattern', difficulty: 4,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [ARR(0, true), ARR(60, false), ARR(120, true), ARR(180, false), EMPTY] },
        options: [vopt('a', ARR(240, true)), vopt('b', ARR(240, false)), vopt('c', ARR(300, true)), vopt('d', ARR(180, true))],
        correctId: 'a',
    },
    {
        id: 'pat6', domain: 'pattern', difficulty: 4,
        prompt: 'რომელი მოდის შემდეგ?',
        visual: { type: 'sequence', cells: [P(3, 0), P(4, 45), P(5, 0), P(6, 45), EMPTY] },
        options: [vopt('a', P(7, 0)), vopt('b', P(7, 45)), vopt('c', P(6, 0)), vopt('d', P(8, 0))],
        correctId: 'a',
    },
    // ══ MATRIX REASONING (3×3, find the missing cell) ══
    {
        id: 'mat1', domain: 'matrix', difficulty: 2,
        prompt: 'რომელი ავსებს მატრიცას?',
        visual: { type: 'matrix', cols: 3, cells: [DOT(1), DOT(2), DOT(3), DOT(2), DOT(3), DOT(4), DOT(3), DOT(4), EMPTY] },
        options: [vopt('a', DOT(5)), vopt('b', DOT(4)), vopt('c', DOT(6)), vopt('d', DOT(3))],
        correctId: 'a',
    },
    {
        id: 'mat2', domain: 'matrix', difficulty: 3,
        prompt: 'რომელი ავსებს მატრიცას?',
        visual: { type: 'matrix', cols: 3, cells: [ARR(0), ARR(45), ARR(90), ARR(45), ARR(90), ARR(135), ARR(90), ARR(135), EMPTY] },
        options: [vopt('a', ARR(180)), vopt('b', ARR(135)), vopt('c', ARR(225)), vopt('d', ARR(90))],
        correctId: 'a',
    },
    {
        id: 'mat3', domain: 'matrix', difficulty: 3,
        prompt: 'რომელი ავსებს მატრიცას?',
        visual: { type: 'matrix', cols: 3, cells: [P(3, 0, false), P(4, 0, false), P(5, 0, false), P(3, 0, true), P(4, 0, true), P(5, 0, true), P(3, 0, false), P(4, 0, false), EMPTY] },
        options: [vopt('a', P(5, 0, false)), vopt('b', P(5, 0, true)), vopt('c', P(6, 0, false)), vopt('d', P(4, 0, false))],
        correctId: 'a',
    },
    {
        id: 'mat4', domain: 'matrix', difficulty: 3,
        prompt: 'რომელი ავსებს მატრიცას?',
        visual: { type: 'matrix', cols: 3, cells: [GRID(1), GRID(2), GRID(3), GRID(4), GRID(5), GRID(6), GRID(7), GRID(8), EMPTY] },
        options: [vopt('a', GRID(9)), vopt('b', GRID(8)), vopt('c', GRID(7)), vopt('d', GRID(6))],
        correctId: 'a',
    },
    {
        id: 'mat5', domain: 'matrix', difficulty: 4,
        prompt: 'რომელი ავსებს მატრიცას? (მესამე სვეტი = პირველი და მეორის განსხვავება)',
        visual: {
            type: 'matrix', cols: 3, cells: [
                BARS({ top: true }), BARS({ bottom: true }), BARS({ top: true, bottom: true }),
                BARS({ top: true, bottom: true }), BARS({ top: true }), BARS({ bottom: true }),
                BARS({ top: true }), BARS({ top: true, bottom: true }), EMPTY,
            ],
        },
        options: [vopt('a', BARS({ bottom: true })), vopt('b', BARS({ top: true })), vopt('c', BARS({ top: true, bottom: true })), vopt('d', BARS({}))],
        correctId: 'a',
    },
    {
        id: 'mat6', domain: 'matrix', difficulty: 5,
        prompt: 'რომელი ავსებს მატრიცას?',
        visual: { type: 'matrix', cols: 3, cells: [ARR(0), ARR(30), ARR(60), ARR(90), ARR(120), ARR(150), ARR(180), ARR(210), EMPTY] },
        options: [vopt('a', ARR(240)), vopt('b', ARR(210)), vopt('c', ARR(270)), vopt('d', ARR(180))],
        correctId: 'a',
    },
    // ══ NUMERICAL REASONING ══
    { id: 'num1', domain: 'numeric', difficulty: 1, prompt: '2, 4, 6, 8, ?', options: [topt('a', '10'), topt('b', '12'), topt('c', '9'), topt('d', '16')], correctId: 'a' },
    { id: 'num2', domain: 'numeric', difficulty: 2, prompt: '3, 6, 12, 24, ?', options: [topt('a', '48'), topt('b', '36'), topt('c', '30'), topt('d', '64')], correctId: 'a' },
    { id: 'num3', domain: 'numeric', difficulty: 3, prompt: '1, 4, 9, 16, ?', options: [topt('a', '25'), topt('b', '20'), topt('c', '24'), topt('d', '36')], correctId: 'a' },
    { id: 'num4', domain: 'numeric', difficulty: 3, prompt: '1, 1, 2, 3, 5, 8, ?', options: [topt('a', '13'), topt('b', '11'), topt('c', '10'), topt('d', '15')], correctId: 'a' },
    { id: 'num5', domain: 'numeric', difficulty: 4, prompt: '2, 6, 12, 20, 30, ?', options: [topt('a', '42'), topt('b', '40'), topt('c', '36'), topt('d', '44')], correctId: 'a' },
    { id: 'num6', domain: 'numeric', difficulty: 5, prompt: '7, 14, 12, 24, 22, ?', options: [topt('a', '44'), topt('b', '33'), topt('c', '42'), topt('d', '20')], correctId: 'a' },
    { id: 'num7', domain: 'numeric', difficulty: 4, prompt: '1, 2, 6, 24, 120, ?', options: [topt('a', '720'), topt('b', '600'), topt('c', '240'), topt('d', '840')], correctId: 'a' },
    // ══ LOGICAL REASONING ══
    {
        id: 'log1', domain: 'logic', difficulty: 2, prompt: 'რომელია ზედმეტი?',
        visual: { type: 'group', cells: [P(3, 0, true), P(3, 0, true), P(4, 0, true), P(3, 0, true)] },
        options: [vopt('a', P(3, 0, true)), vopt('b', P(3, 0, true)), vopt('c', P(4, 0, true)), vopt('d', P(3, 0, true))],
        correctId: 'c',
    },
    {
        id: 'log2', domain: 'logic', difficulty: 3, prompt: 'რომელია ზედმეტი?',
        visual: { type: 'group', cells: [P(4), P(6), P(8), P(5)] },
        options: [vopt('a', P(4)), vopt('b', P(6)), vopt('c', P(8)), vopt('d', P(5))],
        correctId: 'd',
    },
    {
        id: 'log3', domain: 'logic', difficulty: 3, prompt: 'რომელია ზედმეტი?',
        visual: { type: 'group', cells: [CIRC(true), P(4, 0, true), P(3, 0, false), P(5, 0, true)] },
        options: [vopt('a', CIRC(true)), vopt('b', P(4, 0, true)), vopt('c', P(3, 0, false)), vopt('d', P(5, 0, true))],
        correctId: 'c',
    },
    {
        id: 'log4', domain: 'logic', difficulty: 3, prompt: 'A ისე, როგორც B — C ისე, როგორც ?',
        visual: { type: 'analogy', a: CIRC(false, 0.5), b: CIRC(false, 0.95), c: P(4, 0, false, 0.5) },
        options: [vopt('a', P(4, 0, false, 0.95)), vopt('b', P(4, 0, false, 0.5)), vopt('c', CIRC(false, 0.95)), vopt('d', P(3, 0, false, 0.95))],
        correctId: 'a',
    },
    {
        id: 'log5', domain: 'logic', difficulty: 4, prompt: 'A ისე, როგორც B — C ისე, როგორც ?',
        visual: { type: 'analogy', a: ARR(0), b: ARR(90), c: ARR(45) },
        options: [vopt('a', ARR(135)), vopt('b', ARR(90)), vopt('c', ARR(180)), vopt('d', ARR(45))],
        correctId: 'a',
    },
    {
        id: 'log6', domain: 'logic', difficulty: 4, prompt: 'A ისე, როგორც B — C ისე, როგორც ?',
        visual: { type: 'analogy', a: P(4, 0, true), b: P(4, 0, false), c: P(5, 0, true) },
        options: [vopt('a', P(5, 0, false)), vopt('b', P(5, 0, true)), vopt('c', P(4, 0, false)), vopt('d', CIRC(false))],
        correctId: 'a',
    },
    // ══ SPATIAL REASONING (rotation / mirror; flag = asymmetric reference glyph) ══
    {
        id: 'sp1', domain: 'spatial', difficulty: 2, prompt: 'რომელია იგივე ფიგურა მოტრიალებული (და არა სარკისებრი)?',
        visual: { type: 'analogy', a: FLAG(0), b: FLAG(0), c: FLAG(0) },
        options: [vopt('a', FLAG(90, false)), vopt('b', FLAG(0, true)), vopt('c', FLAG(90, true)), vopt('d', FLAG(180, true))],
        correctId: 'a',
    },
    {
        id: 'sp2', domain: 'spatial', difficulty: 3, prompt: 'რომელია ამ ფიგურის სარკისებრი ასახვა?',
        visual: { type: 'analogy', a: FLAG(0), b: FLAG(0), c: FLAG(0) },
        options: [vopt('a', FLAG(0, true)), vopt('b', FLAG(90, false)), vopt('c', FLAG(180, false)), vopt('d', FLAG(270, false))],
        correctId: 'a',
    },
    {
        id: 'sp3', domain: 'spatial', difficulty: 3, prompt: 'მოატრიალე ისარი 180°-ით — რომელი მიიღება?',
        visual: { type: 'analogy', a: ARR(0), b: ARR(0), c: ARR(0) },
        options: [vopt('a', ARR(180)), vopt('b', ARR(0)), vopt('c', ARR(90)), vopt('d', ARR(270))],
        correctId: 'a',
    },
    {
        id: 'sp4', domain: 'spatial', difficulty: 4, prompt: 'მოატრიალე ფიგურა 180°-ით — რომელი მიიღება?',
        visual: { type: 'analogy', a: FLAG(45), b: FLAG(45), c: FLAG(45) },
        options: [vopt('a', FLAG(225, false)), vopt('b', FLAG(135, false)), vopt('c', FLAG(45, false)), vopt('d', FLAG(225, true))],
        correctId: 'a',
    },
    {
        id: 'sp5', domain: 'spatial', difficulty: 4, prompt: 'რომელია ამ ფიგურის სარკისებრი ასახვა?',
        visual: { type: 'analogy', a: FLAG(90), b: FLAG(90), c: FLAG(90) },
        options: [vopt('a', FLAG(90, true)), vopt('b', FLAG(90, false)), vopt('c', FLAG(270, false)), vopt('d', FLAG(180, true))],
        correctId: 'a',
    },
    // ══ VERBAL / CONCEPTUAL (Georgian; language-appropriate for the audience) ══
    { id: 'ver1', domain: 'verbal', difficulty: 2, prompt: 'ჩიტი : ბუდე  =  ფუტკარი : ?', options: [topt('a', 'სკა'), topt('b', 'თაფლი'), topt('c', 'ყვავილი'), topt('d', 'ფრთა')], correctId: 'a' },
    { id: 'ver2', domain: 'verbal', difficulty: 3, prompt: 'მზე : დღე  =  მთვარე : ?', options: [topt('a', 'ღამე'), topt('b', 'ვარსკვლავი'), topt('c', 'ცა'), topt('d', 'სიბნელე')], correctId: 'a' },
    { id: 'ver3', domain: 'verbal', difficulty: 3, prompt: 'ექიმი : საავადმყოფო  =  მასწავლებელი : ?', options: [topt('a', 'სკოლა'), topt('b', 'წიგნი'), topt('c', 'მოსწავლე'), topt('d', 'დაფა')], correctId: 'a' },
    { id: 'ver4', domain: 'verbal', difficulty: 4, prompt: 'რომელია ზედმეტი?', options: [topt('a', 'ვარდი'), topt('b', 'ია'), topt('c', 'ტიტა'), topt('d', 'მუხა')], correctId: 'd' },
    { id: 'ver5', domain: 'verbal', difficulty: 4, prompt: 'წიგნი : ავტორი  =  ფილმი : ?', options: [topt('a', 'რეჟისორი'), topt('b', 'მსახიობი'), topt('c', 'ეკრანი'), topt('d', 'სცენა')], correctId: 'a' },
];
// Fix a small typo guard: ensure every question has a valid correct option.
for (const q of IQ_POOL) {
    if (!q.options.some(o => o.id === q.correctId)) {
        throw new Error(`[iqBank] question ${q.id} has no option matching correctId ${q.correctId}`);
    }
}
export const IQ_SECTION_ORDER = ['pattern', 'matrix', 'numeric', 'logic', 'spatial', 'verbal'];
export const IQ_DOMAIN_META = {
    pattern: { ka: 'პატერნების ამოცნობა', key: 'pattern' },
    matrix: { ka: 'მატრიცული მსჯელობა', key: 'matrix' },
    numeric: { ka: 'რიცხვითი მსჯელობა', key: 'numeric' },
    logic: { ka: 'ლოგიკური მსჯელობა', key: 'logic' },
    spatial: { ka: 'სივრცითი მსჯელობა', key: 'spatial' },
    verbal: { ka: 'ვერბალური მსჯელობა', key: 'verbal' },
};
function shuffle(a) { const r = [...a]; for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
} return r; }
/** Assemble a full test: section order preserved, options shuffled, answers stripped. */
export function assembleTest() {
    const ordered = IQ_SECTION_ORDER.flatMap(d => IQ_POOL.filter(q => q.domain === d).sort((a, b) => a.difficulty - b.difficulty));
    return ordered.map(q => ({
        id: q.id, domain: q.domain, difficulty: q.difficulty, prompt: q.prompt, visual: q.visual,
        options: shuffle(q.options.map(o => ({ id: o.id, cell: o.cell, text: o.text }))),
    }));
}
const BY_ID = new Map(IQ_POOL.map(q => [q.id, q]));
export function getQuestion(id) { return BY_ID.get(id); }
export function totalQuestions() { return IQ_POOL.length; }
export function maxWeight() { return IQ_POOL.reduce((s, q) => s + q.difficulty, 0); }
//# sourceMappingURL=iqBank.js.map