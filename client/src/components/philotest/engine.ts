// ფილოსოფიური პიროვნების ტესტი — scoring engine.
// Pure functions, no UI: everything derives deterministically from the answer
// list, so undo/refresh just replay the answers.
import {
  AXES, type Axis, type Weights, type PTAnswer, type PTScenario, type Archetype,
  type Influence, type PTResult, AXIS_META,
} from './types';
import { CORE, DEEP, ALL_SCENARIOS } from './scenarios';

const byId = new Map(ALL_SCENARIOS.map(s => [s.id, s]));
export function getScenario(id: string): PTScenario | undefined { return byId.get(id); }

export const DEEP_PICKS = 6;            // რამდენი ღრმა სცენარი ემატება
export const TOTAL_QUESTIONS = CORE.length + DEEP_PICKS + 1; // +1 ბოლო მეტა-კითხვა

// ── ქულები ────────────────────────────────────────────────────────────────────
export function scoresFromAnswers(answers: PTAnswer[]): Record<Axis, number> {
  const s = Object.fromEntries(AXES.map(a => [a, 0])) as Record<Axis, number>;
  for (const a of answers) {
    const sc = byId.get(a.scenarioId);
    const ch = sc?.choices[a.choiceIdx];
    if (!ch) continue;
    for (const [axis, w] of Object.entries(ch.w)) s[axis as Axis] += w ?? 0;
  }
  return s;
}

/** Per-axis positive/negative pulls — the raw material for contradiction/blind-spot analysis. */
export function pullsFromAnswers(answers: PTAnswer[]): Record<Axis, { pos: number; neg: number }> {
  const p = Object.fromEntries(AXES.map(a => [a, { pos: 0, neg: 0 }])) as Record<Axis, { pos: number; neg: number }>;
  for (const a of answers) {
    const ch = byId.get(a.scenarioId)?.choices[a.choiceIdx];
    if (!ch) continue;
    for (const [axis, w] of Object.entries(ch.w)) {
      if ((w ?? 0) > 0) p[axis as Axis].pos += w!;
      else if ((w ?? 0) < 0) p[axis as Axis].neg += -w!;
    }
  }
  return p;
}

/** DNA: 0..100 toward pole A, normalized by how much each axis could have moved. */
export function dnaFromAnswers(answers: PTAnswer[]): Record<Axis, number> {
  const scores = scoresFromAnswers(answers);
  const potential = Object.fromEntries(AXES.map(a => [a, 0])) as Record<Axis, number>;
  for (const a of answers) {
    const sc = byId.get(a.scenarioId);
    if (!sc) continue;
    for (const axis of AXES) {
      let m = 0;
      for (const ch of sc.choices) m = Math.max(m, Math.abs(ch.w[axis] ?? 0));
      potential[axis] += m;
    }
  }
  const dna = {} as Record<Axis, number>;
  for (const axis of AXES) {
    const pot = potential[axis];
    const pct = pot > 0 ? 50 + 50 * (scores[axis] / pot) : 50;
    dna[axis] = Math.round(Math.max(4, Math.min(96, pct)));
  }
  return dna;
}

// ── ადაპტიური რიგი ────────────────────────────────────────────────────────────
// ბირთვის ამოწურვის შემდეგ ვამატებთ ღრმა სცენარებს მოთამაშის სამი ყველაზე
// გამოკვეთილი ღერძიდან (ღრმა პული ღერძზე 2-2 სცენარს იტევს).
export function buildQueue(answers: PTAnswer[]): string[] {
  const queue = CORE.map(s => s.id);
  if (answers.length < CORE.length) return queue;
  const coreAnswers = answers.slice(0, CORE.length);
  const scores = scoresFromAnswers(coreAnswers);
  const deepAxes = [...AXES]
    .filter(a => DEEP.some(s => s.deep === a))
    .sort((x, y) => Math.abs(scores[y]) - Math.abs(scores[x]));
  const picked: string[] = [];
  for (const axis of deepAxes) {
    if (picked.length >= DEEP_PICKS) break;
    for (const s of DEEP.filter(d => d.deep === axis)) {
      if (picked.length >= DEEP_PICKS) break;
      picked.push(s.id);
    }
  }
  return [...queue, ...picked];
}

// ── არქეტიპები ────────────────────────────────────────────────────────────────
export const ARCHETYPES: Archetype[] = [
  {
    id: 'existentialist', ka: 'ეგზისტენციალისტი', en: 'THE EXISTENTIALIST', color: '#c3b8ff',
    quote: 'არსებობა წინ უსწრებს არსს — ჯერ ხარ, მერე წყვეტ, ვინ ხარ.',
    body: 'შენ არ ელოდები, რომ ცხოვრების აზრი ვინმემ ხელში ჩაგიდოს. თავისუფლება შენთვის საჩუქარიც არის და ტვირთიც — რადგან ყოველი არჩევანი შენია და გასაქცევი არსად არის. ავთენტურობა შენი მთავარი კანონია: ყალბ სიმშვიდეს ნამდვილ ღელვას არჩევ.',
    vec: { freedom: 1, authenticity: 1, individual: 0.7, meaning: 0.6, truth: 0.5, control: 0.2 },
  },
  {
    id: 'absurdist', ka: 'აბსურდისტი', en: 'THE ABSURDIST', color: '#8ee9ff',
    quote: 'სამყარო დუმს — შენ კი მაინც კითხულობ. ამ შეჯახებაში იბადება თავისუფლება.',
    body: 'შენ პირდაპირ უყურებ იმის შესაძლებლობას, რომ სამყაროს ობიექტური აზრი არ აქვს — და უარს ამბობ, ეს დაბლა დაგწიოს. სიზიფეს ლოდი შენთვის დასჯა კი არა, ცხოვრების პატიოსანი მეტაფორაა: ტრიალებ და იღიმები.',
    vec: { meaning: 0.5, freedom: 0.9, control: -0.6, truth: 0.6, authenticity: 0.6 },
  },
  {
    id: 'stoic', ka: 'სტოიკოსი', en: 'THE STOIC', color: '#e8dcc8',
    quote: 'შენი არ არის ქარიშხალი. შენია — აფრა.',
    body: 'შენ მკაფიოდ ყოფ სამყაროს ორად: რასაც აკონტროლებ და რასაც ვერა. მეორეზე ღელვას პირველზე მუშაობას არჩევ. ტკივილს არ გაურბიხარ და არც აზვიადებ — ატარებ, როგორც ამინდს. სიმშვიდე შენთვის პასიურობა კი არა, დისციპლინაა.',
    vec: { control: -0.8, reason: 0.9, meaning: 0.5, sacrifice: 0.3, identity: 0.4 },
  },
  {
    id: 'nietzschean', ka: 'ნიცშეანელი', en: 'THE NIETZSCHEAN', color: '#ff8c6b',
    quote: 'ვისაც „რატომ" აქვს საცხოვრებლად, თითქმის ყველა „როგორ"-ს გაუძლებს.',
    body: 'შენ ეჭვით უყურებ მემკვიდრეობით მიღებულ ღირებულებებს — გინდა, საკუთარი სასწორი შექმნა. სისუსტის თანაგრძნობად შენიღბვა გაღიზიანებს; სიძლიერე შენთვის სიცოცხლის სიყვარულის ფორმაა. ამორალური არ ხარ — უბრალოდ მორალს ავტორობას უწესებ.',
    vec: { freedom: 0.9, individual: 0.9, authenticity: 0.8, control: 0.6, truth: 0.5, justice: -0.2 },
  },
  {
    id: 'utilitarian', ka: 'უტილიტარისტი', en: 'THE UTILITARIAN', color: '#9ad06f',
    quote: 'სასწორზე ყველა ტკივილი ერთ ენაზე ლაპარაკობს.',
    body: 'შენთვის მორალი ანგარიშია — ცივი კი არა, პატიოსანი: ყველა ადამიანის ტანჯვა თანაბრად ითვლება, შენიც და უცნობისაც. მზად ხარ, არაპოპულარული გადაწყვეტილება მიიღო, თუ ჯამში ნაკლები ტკივილი დარჩება. შენი რისკი ისაა, რომ ანგარიშმა ზოგჯერ სახე დაკარგოს.',
    vec: { reason: 1, individual: -0.8, justice: -0.3, sacrifice: 0.4, truth: 0.3 },
  },
  {
    id: 'skeptic', ka: 'სკეპტიკოსი', en: 'THE SKEPTIC', color: '#b98cff',
    quote: 'ყველაზე საშიში წინადადება ასე იწყება: „ეჭვგარეშეა..."',
    body: 'შენ არცერთ პასუხს არ ენდობი ბოლომდე — მათ შორის საკუთარსაც. ეს სისუსტე არ არის: ეჭვი შენთვის ჰიგიენაა, რომელიც გონებას ცრურწმენებისგან იცავს. მშვენივრად ცხოვრობ პასუხგაუცემელ კითხვებში, სადაც სხვები სასწრაფოდ აშენებენ რწმენებს.',
    vec: { truth: 0.8, reason: 0.8, control: -0.3, meaning: -0.2, freedom: 0.4 },
  },
  {
    id: 'idealist', ka: 'იდეალისტი', en: 'THE IDEALIST', color: '#6fd0ff',
    quote: 'რუკაზე რომ არ არის, არ ნიშნავს, რომ ნაპირი არ არსებობს.',
    body: 'შენ იმ სამყაროთი ცხოვრობ, რომელიც ჯერ არ არსებობს — და ეს შენი ძალაა. კომპრომისებს დროებით ბანაკებად აღიქვამ, არა სახლებად. ხალხს შენში ის იზიდავს, რომ შეუძლებელს სერიოზულად ეკიდები; შენი საფრთხე კი ისაა, რომ რეალურ ადამიანებს ზოგჯერ იდეალის ჩრდილში ტოვებ.',
    vec: { meaning: 0.9, justice: 0.6, sacrifice: 0.6, truth: 0.4, control: 0.4, reason: -0.3 },
  },
  {
    id: 'pragmatist', ka: 'პრაგმატიკოსი', en: 'THE PRAGMATIST', color: '#f2c14e',
    quote: 'ჭეშმარიტია ის, რაც მუშაობს — დანარჩენი პოეზიაა.',
    body: 'შენ იდეებს შედეგით ზომავ და არა სილამაზით. დიდი თეორიების ნაცვლად გირჩევნია ნაბიჯი, რომელიც დღეს რაღაცას აუმჯობესებს. მოქნილი ხარ იქ, სადაც სხვები პრინციპებს ეხეთქებიან — და იცი, რომ ნახევარი გამარჯვება ნულზე მეტია.',
    vec: { reason: 0.9, control: 0.5, truth: -0.2, meaning: -0.3, authenticity: -0.3 },
  },
  {
    id: 'romantic', ka: 'რომანტიკოსი', en: 'THE ROMANTIC', color: '#ff6fb5',
    quote: 'გული იმ ადგილებსაც ხედავს, სადაც გონება რუკას ვერ ადგენს.',
    body: 'შენთვის განცდის სიღრმე ცხოვრების საზომია: გიყვარს ძლიერად, გტკივა ნამდვილად და ორივეს ღირსებად თვლი. ცივი ანგარიში შენს თვალში ცხოვრების გაღარიბებაა. მშვენიერება შენთვის ფუფუნება კი არა, საკვებია.',
    vec: { reason: -1, meaning: 0.6, authenticity: 0.7, sacrifice: 0.4, truth: -0.3 },
  },
  {
    id: 'humanist', ka: 'ჰუმანისტი', en: 'THE HUMANIST', color: '#7fe0a0',
    quote: 'ყველა დიდი იდეა ერთ პატარა კითხვაზე მოწმდება: რას უზამს ის ადამიანს?',
    body: 'შენი კომპასი ადამიანია — არა სისტემა, არა პრინციპი, არა გამარჯვება. გჯერა, რომ ღირსება ყველას ეკუთვნის, უპირობოდ. მკაცრი ჭეშმარიტებებიც კი შენს ხელში რბილდება, რადგან იცი: სიმართლის თქმა და ადამიანის გატეხვა სხვადასხვა ხელობაა.',
    vec: { individual: -0.7, justice: -0.6, sacrifice: 0.6, meaning: 0.5, reason: -0.2 },
  },
  {
    id: 'fatalist', ka: 'ფატალისტი', en: 'THE FATALIST', color: '#8892a6',
    quote: 'მდინარე არ ეკამათება კალაპოტს — და მაინც ზღვამდე აღწევს.',
    body: 'შენ ღრმად გრძნობ, რომ ბევრი რამ ჩვენს ხელში არასდროს ყოფილა — და ამ ცოდნაში სიმშვიდეს პოულობ, არა სასოწარკვეთას. ბრძოლას იქ ინახავ, სადაც აზრი აქვს; დანარჩენს მიჰყვები. შენი რისკი: „ვერაფერს შევცვლი" ზოგჯერ იმის საბაბიც ხდება, რისი შეცვლაც შეიძლებოდა.',
    vec: { control: -1, freedom: -0.4, reason: 0.3, meaning: 0.2, identity: 0.3 },
  },
  {
    id: 'rebel', ka: 'მეამბოხე', en: 'THE REBEL', color: '#ff5d6c',
    quote: 'ვამბობ „არა" — მაშასადამე ვარსებობ.',
    body: 'შენი პირველი რეფლექსი კედლის შემოწმებაა: მართლა კედელია თუ უბრალოდ ყველას სჯერა, რომ კედელია. ავტორიტეტი შენთვის მტკიცებულებას ითხოვს, ტრადიცია — დასაბუთებას. ამბოხი შენში სიძულვილი კი არა, ღირსების ფორმაა: არსებობს ხაზები, რომლებზეც ფეხს არ იღებ, ვინც არ უნდა გიბრძანოს.',
    vec: { freedom: 1, authenticity: 0.8, individual: 0.7, justice: 0.4, control: 0.3, reason: -0.2 },
  },
  {
    id: 'nihilist-artist', ka: 'ღიმილიანი ნიჰილისტი', en: 'THE SMILING NIHILIST', color: '#a88cff',
    quote: 'არაფერს აზრი არ აქვს — რა თავისუფლებაა!',
    body: 'შენ სერიოზულად განიხილავ იმ ვერსიას, რომ საბოლოო საზრისი არ არსებობს — და ამას ტრაგედიად კი არა, ამოსუნთქვად აქცევ: თუ ზემოდან არავინ გვაფასებს, მაშინ სასწორი ჩვენ გვაქვს ხელში. სიმსუბუქე შენი ფილოსოფიური პოზაა; მისი ჩრდილი — რომ ზოგჯერ სიღრმესაც სიმსუბუქით გაურბიხარ.',
    vec: { meaning: -0.8, truth: 0.5, freedom: 0.6, control: -0.4, justice: -0.3 },
  },
  {
    id: 'tragic-optimist', ka: 'ტრაგიკული ოპტიმისტი', en: 'THE TRAGIC OPTIMIST', color: '#ffd34d',
    quote: 'ვიცი, როგორ მთავრდება — და მაინც ვრგავ ხეს.',
    body: 'შენ არ იტყუები საკუთარ თავს: ხედავ დანაკარგს, დასასრულს, უსამართლობას — და მაინც ირჩევ შენებას, სიყვარულს, ზრუნვას. შენი იმედი გულუბრყვილო არ არის, ის ნაიარევია. სწორედ ამიტომ სხვებს ბნელ დღეებში შენკენ მიუწევთ.',
    vec: { meaning: 0.8, truth: 0.6, sacrifice: 0.6, control: -0.3, reason: -0.2, authenticity: 0.5 },
  },
];

// ── გავლენები ────────────────────────────────────────────────────────────────
export const INFLUENCES: Influence[] = [
  { name: 'ნიცშე', vec: { freedom: 1, individual: 0.9, authenticity: 0.8, control: 0.5, justice: -0.3 } },
  { name: 'კამიუ', vec: { freedom: 0.8, meaning: 0.4, control: -0.5, truth: 0.6, authenticity: 0.6 } },
  { name: 'სტოიციზმი', vec: { control: -0.8, reason: 0.9, meaning: 0.4, identity: 0.4 } },
  { name: 'კანტი', vec: { justice: 1, reason: 0.7, truth: 0.6, individual: -0.2, sacrifice: 0.4 } },
  { name: 'უტილიტარიზმი', vec: { reason: 0.9, individual: -0.8, justice: -0.4, sacrifice: 0.3 } },
  { name: 'კირკეგორი', vec: { authenticity: 0.9, individual: 0.7, reason: -0.5, meaning: 0.7 } },
  { name: 'ეპიკურე', vec: { meaning: -0.7, reason: 0.4, control: -0.4, freedom: 0.3 } },
  { name: 'ჰიუმი', vec: { truth: 0.6, reason: 0.5, control: -0.3, meaning: -0.3 } },
  { name: 'სარტრი', vec: { freedom: 1, authenticity: 0.9, meaning: 0.5, individual: 0.6 } },
  { name: 'შოპენჰაუერი', vec: { control: -0.6, meaning: -0.4, truth: 0.5, reason: 0.4, individual: 0.3 } },
];

// ── მსგავსება ────────────────────────────────────────────────────────────────
function similarity(dna: Record<Axis, number>, vec: Weights): number {
  // player vector: -1..1
  let dot = 0, np = 0, nv = 0;
  for (const axis of AXES) {
    const p = (dna[axis] - 50) / 50;
    const v = vec[axis] ?? 0;
    dot += p * v; np += p * p; nv += v * v;
  }
  if (np === 0 || nv === 0) return 0;
  return dot / (Math.sqrt(np) * Math.sqrt(nv)); // -1..1
}

function toPct(sim: number): number { return Math.round(Math.max(2, Math.min(98, 50 + sim * 50))); }

// ── შედეგი ────────────────────────────────────────────────────────────────────
export function computeResult(answers: PTAnswer[], finalChoice: number): PTResult {
  const dna = dnaFromAnswers(answers);
  const pulls = pullsFromAnswers(answers);

  const ranked = [...ARCHETYPES]
    .map(a => ({ a, sim: similarity(dna, a.vec) }))
    .sort((x, y) => y.sim - x.sim);
  const primary = ranked[0]!.a;
  const secondary = ranked[1]!.a;

  // ყველაზე გამოკვეთილი ღერძი
  const strongestAxis = [...AXES].sort((x, y) => Math.abs(dna[y] - 50) - Math.abs(dna[x] - 50))[0]!;

  // ფარული დაძაბულობა: მაღალი მსგავსების არქეტიპი, რომელიც მოთამაშის
  // უძლიერეს ღერძზე საპირისპიროდ იხრება.
  const playerSign = Math.sign(dna[strongestAxis] - 50) || 1;
  const tension = ranked
    .slice(1)
    .find(r => Math.sign(r.a.vec[strongestAxis] ?? 0) === -playerSign)?.a ?? ranked[2]!.a;

  // წინააღმდეგობა: ღერძი, რომელზეც ორივე მიმართულებით ძლიერად წევდა
  let contradictionAxis: Axis | null = null;
  let bestMix = 0;
  for (const axis of AXES) {
    const mix = Math.min(pulls[axis].pos, pulls[axis].neg);
    if (mix > bestMix) { bestMix = mix; contradictionAxis = axis; }
  }
  if (bestMix < 3) contradictionAxis = null; // სუსტი შერევა წინააღმდეგობად არ ღირს

  // ბრმა წერტილი: ღერძი, რომელსაც თითქმის არ შეხებია
  const blindSpotAxis = [...AXES].sort(
    (x, y) => (pulls[x].pos + pulls[x].neg) - (pulls[y].pos + pulls[y].neg),
  )[0]!;

  const influences = INFLUENCES
    .map(i => ({ name: i.name, pct: toPct(similarity(dna, i.vec)) }))
    .sort((x, y) => y.pct - x.pct)
    .slice(0, 5);

  return { primary, secondary, tension, dna, strongestAxis, contradictionAxis, blindSpotAxis, influences, finalChoice };
}

// ── ანალიზის ტექსტები ─────────────────────────────────────────────────────────
function pole(axis: Axis, high: boolean): string {
  return high ? AXIS_META[axis].poleA : AXIS_META[axis].poleB;
}

export function analysisSections(r: PTResult): { title: string; text: string }[] {
  const d = r.dna;
  const s: { title: string; text: string }[] = [];

  // უძლიერესი ღირებულება
  const sa = r.strongestAxis;
  s.push({
    title: 'შენი უძლიერესი ღირებულება',
    text: `ყველაზე თანმიმდევრულად ${pole(sa, d[sa] >= 50)}სკენ იხრები — ეს შენი გადაწყვეტილებების უხილავი ღერძია. იქაც კი, სადაც სცენარი სხვა რამეზე „იყო", შენი არჩევანი ამ მიმართულებას ინახავდა.`,
  });

  // უდიდესი წინააღმდეგობა
  if (r.contradictionAxis) {
    const ca = r.contradictionAxis;
    const toward = pole(ca, d[ca] >= 50);
    const away = pole(ca, d[ca] < 50);
    s.push({
      title: 'შენი უდიდესი წინააღმდეგობა',
      text: `აცხადებ, რომ ${toward} გირჩევნია — და ჯამში მართლაც იქით იხრები. მაგრამ რამდენიმე არჩევანში, როცა ფასი გაიზარდა, მშვიდად აირჩიე ${away}. ეს თვალთმაქცობა არ არის: ეს ის ადგილია, სადაც შენი პრინციპი და შენი შიში ჯერ არ შეთანხმებულან.`,
    });
  } else {
    s.push({
      title: 'შენი შინაგანი თანხმობა',
      text: 'შენს პასუხებში იშვიათი რამ გამოჩნდა: თითქმის არცერთ ღერძზე არ წაგიწევია ორივე მიმართულებით. ან უკვე კარგად იცნობ საკუთარ სასწორს — ან ჯერ არ შეგხვედრია სცენარი, რომელიც მას მართლა შეარყევდა.',
    });
  }

  // რისი გეშინია
  const fearTexts: Partial<Record<Axis, [string, string]>> = {
    freedom: ['ყველაზე მეტად გალიის გეშინია — თუნდაც მოოქროვილის: ცხოვრების, რომელსაც შენ აღარ მართავ.', 'ყველაზე მეტად ქაოსის გეშინია: სამყაროსი, სადაც არავინ და არაფერი გიცავს.'],
    truth: ['ყველაზე მეტად ილუზიაში ცხოვრების გეშინია — ბედნიერების, რომელიც ტყუილზე დგას.', 'ყველაზე მეტად იმ ცოდნის გეშინია, რომელიც უკან ვეღარ დაბრუნდება.'],
    control: ['ყველაზე მეტად უმწეობის გეშინია — დღის, როცა ვერაფერს იზამ და მხოლოდ ყურება მოგიწევს.', 'ყველაზე მეტად იმის გეშინია, რომ ბრძოლაში ის დღეები დაკარგო, რომლებიც სიმშვიდეს ეკუთვნოდა.'],
    meaning: ['ყველაზე მეტად უკვალოდ გავლის გეშინია — ცხოვრების, რომელიც არაფერს შეცვლის.', 'ყველაზე მეტად იმის გეშინია, რომ „დიდი აზრის" დევნაში თვითონ ცხოვრება გამოგეპაროს.'],
    individual: ['ყველაზე მეტად ბრბოში გათქვეფის გეშინია — საკუთარი ხმის დაკარგვის.', 'ყველაზე მეტად მარტოობის გეშინია — იმის, რომ შენს „მე"-ს „ჩვენ" აღარ ჰყავდეს.'],
    sacrifice: ['ყველაზე მეტად იმის გეშინია, რომ გადამწყვეტ წამს საკუთარი თავი სხვებზე მაღლა დააყენო.', 'ყველაზე მეტად იმის გეშინია, რომ სხვისთვის თავგანწირვამ შენივე სიცოცხლე წაშალოს.'],
  };
  const fearAxis = ([...AXES].sort((x, y) => Math.abs(d[y] - 50) - Math.abs(d[x] - 50)).find(a => fearTexts[a]) ?? 'freedom') as Axis;
  s.push({ title: 'რისი გეშინია ყველაზე მეტად', text: fearTexts[fearAxis]![d[fearAxis] >= 50 ? 0 : 1] });

  // რას გაწირავ
  const weakest = [...AXES].sort((x, y) => Math.abs(d[x] - 50) - Math.abs(d[y] - 50))
    .filter(a => a !== r.blindSpotAxis)[0] ?? r.blindSpotAxis;
  const lowPoleAxis = [...AXES].sort((x, y) => d[x] - d[y])[0]!;
  s.push({
    title: 'რას გაწირავ ყველაზე ადვილად',
    text: `როცა არჩევანი გამკაცრდა, ყველაზე იოლად ${AXIS_META[lowPoleAxis].poleA} დათმე — არა იმიტომ, რომ არ გაინტერესებს, არამედ იმიტომ, რომ სასწორზე ის ყოველთვის მეორე ადგილზეა. (${AXIS_META[weakest].dna} კი შენთვის მოქნილი ზონაა — იქ კომპრომისი არ გტკივა.)`,
  });

  // ურთიერთობა აზრთან
  s.push({
    title: 'შენი ურთიერთობა აზრთან',
    text: d.meaning >= 62
      ? 'აზრი შენთვის ჰაერია: მზად ხარ კომფორტი, სიმშვიდე და ზოგჯერ ბედნიერებაც კი გაცვალო იმაზე, რაც „რაღაცად ღირს". ცხოვრება პროექტად გესმის და არა სასტუმროდ.'
      : d.meaning <= 38
        ? 'დიდი საზრისების მიმართ ეჭვიანი ხარ — შენთვის ცხოვრება ჯერ განცდაა და მერე მისია. ეს სიმსუბუქე ძალაა: იმას აფასებ, რაც აქ არის, და არა იმას, რაც „უნდა იყოს".'
        : 'აზრსა და სიამოვნებას შორის ხიდზე ცხოვრობ: არც მისიას ეწირები მთლიანად და არც წამს. ეს წონასწორობა იშვიათია — და მყიფე.',
  });

  // ურთიერთობა თავისუფლებასთან
  s.push({
    title: 'შენი ურთიერთობა თავისუფლებასთან',
    text: d.freedom >= 62
      ? 'თავისუფლება შენთვის მოლაპარაკებას არ ექვემდებარება: გირჩევნია საკუთარი შეცდომა, ვიდრე სხვისი სისწორე. ფასს იხდი შფოთვით — რადგან ვინც ირჩევს, ის ცდება კიდეც.'
      : d.freedom <= 38
        ? 'შენ გულწრფელად აღიარებ იმას, რასაც ბევრი მალავს: უსაზღვრო თავისუფლება ღირებულებაზე მეტად ტვირთია. სტრუქტურა, საზღვრები, დაცულობა — შენთვის ეს სიმხდალე კი არა, არქიტექტურაა.'
        : 'თავისუფლებას ეტაპობრივად ყიდულობ — იქ, სადაც ის მართლა გჭირდება. დანარჩენს მშვიდად ცვლი დაცულობაზე. პრაგმატული გარიგებაა; მთავარია, ერთ დღეს არ აღმოაჩინო, რომ ძალიან ბევრი გაყიდე.',
  });

  // ურთიერთობა სიკვდილთან
  s.push({
    title: 'შენი ურთიერთობა სიკვდილთან',
    text: d.control <= 40
      ? 'დასასრულს იღებ, როგორც წესს და არა შეურაცხყოფას. ეს მიღება გათავისუფლებს: ვინც სიკვდილს არ ეკამათება, ის სიცოცხლეს უფრო ნაკლებს უკარგავს.'
      : d.control >= 60
        ? 'დასასრული შენთვის მოწინააღმდეგეა — მასთან ბრძოლა კი ღირსების საქმე. ეს შენი ძრავია, მაგრამ ფრთხილად: ომში ისეთ დღეებსაც წვავ, რომლებიც ზავს ეკუთვნოდა.'
        : 'სიკვდილს შორიდან უყურებ — არც მეგობრად გიქცევია, არც მტრად. ეს დისტანცია ჯანსაღია, სანამ ერთ დღეს პირისპირ შეხვედრა არ მოგიწევს.',
  });

  // ბრმა წერტილი
  s.push({
    title: 'შენი ფილოსოფიური ბრმა წერტილი',
    text: `მთელი ტესტის განმავლობაში ერთი ღერძი თითქმის არ აგირჩევია საკვანძოდ: ${AXIS_META[r.blindSpotAxis].poleA} ↔ ${AXIS_META[r.blindSpotAxis].poleB}. ან ეს კონფლიქტი შენთვის დიდი ხნის მოგვარებულია — ან ჯერ არ დაგიდგა დღე, როცა ის მთელი წონით დაგაწვება. მეორე ვარაუდი უფრო ხშირად მართლდება.`,
  });

  return s;
}
