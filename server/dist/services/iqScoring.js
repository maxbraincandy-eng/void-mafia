/**
 * VOID IQ — deterministic scoring, percentile, banding, verification.
 *
 * The score is a pure function of (which questions were answered correctly).
 * Same answers → same IQ, every time. IQ follows the familiar mean-100 /
 * SD-15 scale; the raw→IQ transfer is a fixed calibration curve (there is no
 * real standardization sample, so we do NOT overclaim — see the disclaimer).
 */
import { maxWeight, IQ_POOL } from './iqBank.js';
// ── Normal CDF (Abramowitz-Stegun) for percentile from a z-score ────────────
function normalCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    if (z > 0)
        p = 1 - p;
    return p;
}
const BANDS = [
    { min: 145, band: 'EXCEPTIONAL', ka: 'გამორჩეული' },
    { min: 130, band: 'VERY HIGH', ka: 'ძალიან მაღალი' },
    { min: 115, band: 'ABOVE AVERAGE', ka: 'საშუალოზე მაღალი' },
    { min: 100, band: 'AVERAGE', ka: 'საშუალო' },
    { min: 85, band: 'LOW AVERAGE', ka: 'საშუალოზე დაბალი' },
    { min: 70, band: 'BELOW AVERAGE', ka: 'დაბალი' },
    { min: 0, band: 'EXTREMELY LOW', ka: 'ძალიან დაბალი' },
];
function bandFor(iq) { return BANDS.find(b => iq >= b.min); }
const DOMAIN_KA = {
    pattern: 'პატერნების ამოცნობა',
    matrix: 'მატრიცული მსჯელობა',
    numeric: 'რიცხვითი მსჯელობა',
    logic: 'ლოგიკური მსჯელობა',
    spatial: 'სივრცითი მსჯელობა',
    verbal: 'ვერბალური მსჯელობა',
};
// Verification thresholds are deliberately lenient — they exist to catch blatant
// automation / answer-key runs, NOT fast legitimate solvers. A sharp player can
// finish 35 abstract items in a few minutes and must still count as VERIFIED.
const MIN_REASONABLE_MS = 60 * 1000; // under 1 min for 35 items is not a real sitting
const MIN_PER_Q_MS = 1200; // avg under 1.2s/question is not real reading
const MAX_TAB_BLURS = 12; // occasional focus loss is normal on mobile
export function scoreTest(answers, meta) {
    const byId = new Map(answers.map(a => [a.questionId, a]));
    let rawScore = 0;
    let correct = 0;
    const domTotals = {};
    for (const q of IQ_POOL) {
        const dom = domTotals[q.domain] ?? (domTotals[q.domain] = { got: 0, total: 0 });
        dom.total++;
        const ans = byId.get(q.id);
        if (ans && ans.optionId === q.correctId) {
            rawScore += q.difficulty;
            correct++;
            dom.got++;
        }
    }
    const total = IQ_POOL.length;
    const answered = answers.filter(a => a.optionId != null).length;
    const maxScore = maxWeight();
    const p = maxScore > 0 ? rawScore / maxScore : 0;
    // Fixed calibration: weighted-fraction 0.5 → IQ 100; each 0.16 fraction ≈ 1 SD
    // (a flawless test lands in the Exceptional band, ~147).
    const z = (p - 0.5) / 0.16;
    let iq = Math.round(100 + 15 * z);
    iq = Math.max(55, Math.min(160, iq));
    const percentile = Math.max(1, Math.min(99, Math.round(normalCdf((iq - 100) / 15) * 100)));
    const domainScores = {};
    for (const [dom, v] of Object.entries(domTotals)) {
        domainScores[dom] = v.total ? Math.round((v.got / v.total) * 100) : 0;
    }
    // ── Verification ──
    const flags = [];
    if (meta.totalMs < MIN_REASONABLE_MS)
        flags.push('too_fast_total');
    if (total > 0 && meta.totalMs / total < MIN_PER_Q_MS)
        flags.push('too_fast_per_question');
    if (meta.tabBlurs > MAX_TAB_BLURS)
        flags.push('excessive_tab_switching');
    // A near-perfect score achieved implausibly fast (only catches automation).
    if (iq >= 140 && meta.totalMs < 90 * 1000)
        flags.push('high_score_low_time');
    const verified = flags.length === 0;
    const bandInfo = bandFor(iq);
    const interpretation = buildInterpretation(domainScores, iq);
    return {
        iq, percentile, band: bandInfo.band, bandKa: bandInfo.ka,
        correct, answered, total, rawScore, maxScore, domainScores,
        durationMs: meta.totalMs, verified, flags, interpretation,
    };
}
function buildInterpretation(domainScores, iq) {
    const entries = Object.entries(domainScores);
    if (entries.length === 0)
        return 'ტესტი დასრულებულია.';
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 2).map(([d]) => DOMAIN_KA[d]);
    const weak = sorted[sorted.length - 1];
    const level = iq >= 130 ? 'გამორჩეულად მაღალ' : iq >= 115 ? 'მაღალ' : iq >= 100 ? 'სტაბილურ' : 'განვითარებად';
    let s = `შენი ყველაზე ძლიერი მხარეა ${top.join(' და ')}. `;
    s += `აბსტრაქტული კავშირებისა და სტრუქტურების ამოცნობაში ${level} დონეს აჩვენებ. `;
    if (weak && weak[1] < 60)
        s += `${DOMAIN_KA[weak[0]]} შედარებით დამატებით ვარჯიშს საჭიროებს.`;
    else
        s += 'შედეგები ყველა დომენში თანაბრად გამართულია.';
    return s;
}
//# sourceMappingURL=iqScoring.js.map