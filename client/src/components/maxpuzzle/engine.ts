/**
 * ბატონი მაქსის თავსატეხი — scoring engine.
 *
 * Traits are normalized per-trait against the achievable [min..max] weight sum
 * across the whole bank, so scores stay 0..100 no matter how many dilemmas
 * exist. Archetype = cosine similarity between the centered trait vector and
 * each archetype's target profile.
 */
import { MP_DILEMMAS } from './dilemmas';
import {
  MP_TRAITS, type MPTrait, type MPAnswer, type MPArchetype, type MPResult,
} from './types';

// Achievable weight range per trait across every dilemma (each dilemma
// contributes its own per-trait min/max across its answers).
function traitRanges(): Record<MPTrait, { min: number; max: number }> {
  const r = {} as Record<MPTrait, { min: number; max: number }>;
  for (const t of MP_TRAITS) r[t] = { min: 0, max: 0 };
  for (const d of MP_DILEMMAS) {
    for (const t of MP_TRAITS) {
      let lo = 0, hi = 0;
      for (const a of d.answers) {
        const w = a.w[t] ?? 0;
        if (w < lo) lo = w;
        if (w > hi) hi = w;
      }
      r[t].min += lo;
      r[t].max += hi;
    }
  }
  return r;
}

const RANGES = traitRanges();

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Raw weight sums for the picked answers. */
export function rawScores(answers: MPAnswer[]): Record<MPTrait, number> {
  const s = {} as Record<MPTrait, number>;
  for (const t of MP_TRAITS) s[t] = 0;
  for (const a of answers) {
    const d = MP_DILEMMAS.find(x => x.id === a.dilemmaId);
    const ans = d?.answers[a.choiceIdx];
    if (!ans) continue;
    for (const t of MP_TRAITS) s[t] += ans.w[t] ?? 0;
  }
  return s;
}

/** Normalized 0..100 trait scores (clamped to 4..96 so bars never look broken). */
export function traitScores(answers: MPAnswer[]): Record<MPTrait, number> {
  const raw = rawScores(answers);
  const out = {} as Record<MPTrait, number>;
  for (const t of MP_TRAITS) {
    const { min, max } = RANGES[t];
    const span = max - min;
    const v = span === 0 ? 50 : ((raw[t] - min) / span) * 100;
    out[t] = clamp(Math.round(v), 4, 96);
  }
  return out;
}

// ── Archetypes ───────────────────────────────────────────────────────────────

export const MP_ARCHETYPES: MPArchetype[] = [
  {
    id: 'independent_observer', ka: 'დამოუკიდებელი დამკვირვებელი', en: 'The Independent Observer',
    quote: 'ბრბო მოძრაობს. შენ აკვირდები — და მხოლოდ მერე წყვეტ.',
    body: 'იშვიათად მიჰყვები ბრბოს მხოლოდ იმიტომ, რომ ის მოძრაობს. მზად ხარ სოციალურად წამგებიანი პოზიცია აირჩიო, თუ შენი არჩევანი შენთვის სწორია. ოღონდ ფრთხილად: დამოუკიდებლობა ზოგჯერ განმარტოებად იქცევა.',
    vec: { independence: 90, rationality: 70, conformity: 10, ambition: 50, risk: 55, status: 20, skepticism: 85, moralFlex: 45 },
    color: '#8ab8ff',
  },
  {
    id: 'rationalist', ka: 'რაციონალისტი', en: 'The Rationalist',
    quote: 'შენთვის ემოცია მონაცემია და არა არგუმენტი.',
    body: 'ჯერ ადარებ, მერე წყვეტ. სოციალური ხმაური შენზე სუსტად მოქმედებს — ფაქტები კი ძლიერად. სისუსტე ისაა, რომ ადამიანები ცხრილებში ვერ ეტევიან, შენ კი ხანდახან მაინც ცდილობ.',
    vec: { independence: 70, rationality: 95, conformity: 25, ambition: 55, risk: 40, status: 30, skepticism: 75, moralFlex: 50 },
    color: '#7ce0c8',
  },
  {
    id: 'pragmatic_realist', ka: 'პრაგმატული რეალისტი', en: 'The Pragmatic Realist',
    quote: 'იდეალები კარგია. მუშა გეგმა — უკეთესი.',
    body: 'სამყაროს ისეთს ხედავ, როგორიც არის და არა ისეთს, როგორიც უნდა იყოს. მოქნილი ხარ, შედეგზე ორიენტირებული და ზედმეტ დრამატიზმს არიდებ თავს. მთავარია, პრაგმატიზმი ცინიზმში არ გადაიზარდოს.',
    vec: { independence: 55, rationality: 75, conformity: 45, ambition: 65, risk: 50, status: 45, skepticism: 60, moralFlex: 65 },
    color: '#d9c07a',
  },
  {
    id: 'idealist', ka: 'იდეალისტი', en: 'The Idealist',
    quote: 'შენ გჯერა, რომ ხარისხი იმარჯვებს. სამყარო ამას ჯერ ამოწმებს.',
    body: 'პრინციპებზე არ ვაჭრობ — ეს შენი დევიზია. სხვისი ტკივილის ფასად წარმატება არ გინდა და ეს დღეს იშვიათი ვალუტაა. საფრთხე ერთია: სამყარო ხანდახან იდეალისტებს ინსტრუმენტად იყენებს.',
    vec: { independence: 60, rationality: 55, conformity: 30, ambition: 50, risk: 50, status: 25, skepticism: 30, moralFlex: 8 },
    color: '#9ee8a0',
  },
  {
    id: 'social_strategist', ka: 'სოციალური სტრატეგი', en: 'The Social Strategist',
    quote: 'შენ იცი, რომ ჭადრაკის დაფა ადამიანებისგან შედგება.',
    body: 'ხედავ, როგორ მოძრაობს გავლენა, ვინ ვის უსმენს და რომელი კარი როდის იღება. ამ ცოდნას იყენებ — ჩვეულებრივ, კორექტულად. მთავარია, ერთხელაც საკუთარ თავს არ დაუწყო თამაში.',
    vec: { independence: 35, rationality: 65, conformity: 60, ambition: 75, risk: 50, status: 70, skepticism: 45, moralFlex: 60 },
    color: '#c99df5',
  },
  {
    id: 'status_seeker', ka: 'სტატუსის მაძიებელი', en: 'The Status Seeker',
    quote: 'აღიარება შენთვის ჰაერია. ცოტამ თუ იცის, რამდენად ბუნებრივია ეს.',
    body: 'გინდა, რომ დაგინახონ — და ამას არ მალავ. ეს გულწრფელობა შენი ძალაა: უმეტესობა იმავე შიმშილს ინიღბება. ოღონდ დარწმუნდი, რომ სცენა შენით არსებობს და არა შენ — სცენით.',
    vec: { independence: 25, rationality: 45, conformity: 70, ambition: 80, risk: 55, status: 95, skepticism: 30, moralFlex: 60 },
    color: '#f5c05a',
  },
  {
    id: 'rebel', ka: 'მეამბოხე', en: 'The Rebel',
    quote: 'შენთვის „ყველა ასე აკეთებს" არგუმენტი კი არა, გაფრთხილებაა.',
    body: 'დინების საწინააღმდეგოდ ცურვა შენთვის პრინციპია და არა პოზა. რისკი არ გაშინებს, ავტორიტეტი არ გხიბლავს. ერთი რამ გახსოვდეს: აჯანყება მიმართულებას მაინც საჭიროებს.',
    vec: { independence: 90, rationality: 45, conformity: 5, ambition: 60, risk: 85, status: 30, skepticism: 70, moralFlex: 55 },
    color: '#ff7a6c',
  },
  {
    id: 'silent_observer', ka: 'ჩუმი დამკვირვებელი', en: 'The Silent Observer',
    quote: 'ყველაზე მეტს ის იგებს, ვინც ყველაზე ნაკლებს ლაპარაკობს.',
    body: 'ხმაურში არ ერევი — აკვირდები, აანალიზებ და ინახავ. შენი დუმილი სისუსტე არ არის, სტრატეგიაა. საფრთხე მხოლოდ ისაა, რომ მაყურებლის ადგილიდან სცენაზე ასვლა სულ უფრო რთულდება.',
    vec: { independence: 70, rationality: 65, conformity: 40, ambition: 30, risk: 20, status: 15, skepticism: 75, moralFlex: 40 },
    color: '#9fb2c8',
  },
  {
    id: 'opportunist', ka: 'ოპორტუნისტი', en: 'The Opportunist',
    quote: 'კარი იღება? შენ უკვე შიგნით ხარ.',
    body: 'შესაძლებლობებს სუნით პოულობ და პრინციპებს ვითარებას არგებ. ეს ცოცხალი, მოქნილი გონების ნიშანია. უბრალოდ დროდადრო შეამოწმე — გზას შენ ირჩევ თუ გზა შენ.',
    vec: { independence: 45, rationality: 60, conformity: 50, ambition: 80, risk: 70, status: 60, skepticism: 55, moralFlex: 90 },
    color: '#f0a05f',
  },
  {
    id: 'cynical_realist', ka: 'ცინიკური რეალისტი', en: 'The Cynical Realist',
    quote: 'შენ ადამიანებს ისე კითხულობ, როგორც სხვები — მენიუს.',
    body: 'ილუზიები დიდი ხანია ჩამოიშორე: ხედავ, რომ ბრბო ხშირად ცდება, სახელი ხშირად რეკლამაა და კეთილშობილება ხშირად ფასადია. მართალი ხარ ხოლმე. ოღონდ ხანდახან ფასადის უკან ნამდვილი სახლიც დგას.',
    vec: { independence: 65, rationality: 70, conformity: 35, ambition: 45, risk: 45, status: 30, skepticism: 95, moralFlex: 65 },
    color: '#b8a8d9',
  },
  {
    id: 'philosopher', ka: 'ფილოსოფოსი', en: 'The Philosopher',
    quote: 'სხვები პასუხებს ეძებენ. შენ — უკეთეს კითხვებს.',
    body: 'შენთვის დილემა გასართობი კი არა, სამუშაო მაგიდაა. სტატუსი ნაკლებად გაინტერესებს, ჭეშმარიტება — ძალიან. სამყაროს სიღრმეში ხედავ; მთავარია, ზედაპირზე ამოსვლაც არ დაგავიწყდეს.',
    vec: { independence: 75, rationality: 80, conformity: 20, ambition: 35, risk: 35, status: 10, skepticism: 70, moralFlex: 40 },
    color: '#8fd2f0',
  },
  {
    id: 'chaos_enjoyer', ka: 'ქაოსის მოყვარული', en: 'The Chaos Enjoyer',
    quote: 'წესრიგი მოსაწყენია. შენ ამას ღიად ამბობ.',
    body: 'რისკი შენთვის ფასი კი არა, ჯილდოა. იქ მიდიხარ, სადაც სხვები ფრთხილობენ, და სწორედ ამიტომ ხედავ იმას, რასაც სხვები ვერასდროს ნახავენ. სამაგიეროდ, დაზღვევა ძვირი გიჯდება.',
    vec: { independence: 70, rationality: 25, conformity: 20, ambition: 55, risk: 95, status: 40, skepticism: 50, moralFlex: 70 },
    color: '#ff9ad5',
  },
  {
    id: 'crowd_follower', ka: 'ბრბოს გულწრფელი მეგობარი', en: 'The Crowd Companion',
    quote: 'შენ იქ ხარ, სადაც ხალხია — და ამას არც მალავ.',
    body: 'ადამიანები გჭირდება და ეს სისუსტე არ არის: საზოგადოება სწორედ შენნაირებზე დგას. შენ ირჩევ სითბოს, ნაცნობ სახეებს და საერთო მაგიდას. უბრალოდ დროდადრო შეამოწმე, საით მიდის ის ბრბო, რომელსაც მიჰყვები.',
    vec: { independence: 10, rationality: 40, conformity: 90, ambition: 40, risk: 25, status: 55, skepticism: 20, moralFlex: 50 },
    color: '#a8d98a',
  },
];

function similarity(a: Record<MPTrait, number>, b: Record<MPTrait, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const t of MP_TRAITS) {
    const x = a[t] - 50, y = b[t] - 50;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function computeResult(answers: MPAnswer[]): MPResult {
  const traits = traitScores(answers);
  const ranked = MP_ARCHETYPES
    .map(a => ({ a, s: similarity(traits, a.vec) }))
    .sort((x, y) => y.s - x.s);
  return {
    primary: ranked[0]!.a,
    secondary: ranked[1]!.a,
    traits,
    date: Date.now(),
  };
}

export function archetypeById(id: string): MPArchetype | null {
  return MP_ARCHETYPES.find(a => a.id === id) ?? null;
}
