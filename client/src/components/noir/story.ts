// ── ნუარი — the story ─────────────────────────────────────────────────
// Four chapters, one city, and no choice that is purely cosmetic: every option
// moves at least one stat, sets a flag, or opens a door that stays shut
// otherwise. Branches rejoin at chapter boundaries so the graph stays authored
// rather than exponential — the differences are carried forward in flags and
// stats, which is what makes the endings feel earned.
//
// Requirement-gated choices replace conditional routing on purpose: a locked
// option is visible, so the player can see the road they did not build.
import type { Ending, Scene } from './types';

export const START_ID = 'c1_start';

export const SCENES: Scene[] = [
  // ════════ თავი 1 — ვალი ════════
  {
    id: 'c1_start', chapter: 1, backdrop: 'rain_street',
    title: 'ვაკე · 23:40',
    text: 'წვიმა მესამე საათია არ ჩერდება. ბარის ნეონი გუბეში ირეკლება და წითლად ხეხავს ასფალტს. ზვიადი შიგნითაა — სამი კვირაა ვალს არ იხდის და ბატონმა ლევანმა შენ გამოგგზავნა.\n\nჯიბეში ტელეფონი გაქვს. კარი — ხუთ ნაბიჯში.',
    choices: [
      { text: 'შედი და პირდაპირ მოსთხოვე', effects: { nerve: 1 }, next: 'c1_bar_direct', beat: 'tense' },
      { text: 'დაელოდე გარეთ — ადრე თუ გვიან გამოვა', effects: { cunning: 1 }, next: 'c1_wait', beat: 'calm' },
      { text: 'ჯერ ლევანს დაურეკე და იკითხე რამდენად შორს წახვიდე', effects: { trust: 1 }, next: 'c1_call', beat: 'calm' },
    ],
  },
  {
    id: 'c1_call', chapter: 1, backdrop: 'rain_street',
    speaker: 'ბატონი ლევანი',
    text: '„მე რომ მეთქვა რამდენად შორს წახვიდე, შენ რაღას აკეთებ იქ?" — ხმაში გაღიზიანება არ ისმის, უარესი: მოწყენილობა. „ფული მინდა. დანარჩენი შენი საქმეა."\n\nყურმილი ითიშება. წვიმა უფრო ძლიერდება.',
    choices: [
      { text: 'შედი შიგნით', effects: { nerve: 1 }, next: 'c1_bar_direct', beat: 'tense' },
      { text: 'გარეთ დაელოდე', effects: { cunning: 1 }, next: 'c1_wait', beat: 'calm' },
    ],
  },
  {
    id: 'c1_bar_direct', chapter: 1, backdrop: 'bar',
    title: 'ბარი „ლურჯი"',
    text: 'შიგნით თბილა და კვამლი დგას. ზვიადი კუთხის მაგიდასთან ზის ორ კაცთან ერთად და იცინის. შენ რომ დაგინახა, სიცილი შუაზე გაუწყდა.\n\nორივე კაცი შენსკენ მოტრიალდა.',
    choices: [
      { text: 'მაგიდაზე ხელი დაარტყი და უთხარი ყველას გასაგონად', effects: { nerve: 2, heat: 1 }, next: 'c1_fight', beat: 'violent' },
      { text: 'ჩაუჯექი გვერდით და ჩუმად ჩასჩურჩულე', effects: { cunning: 2 }, next: 'c1_quiet', beat: 'clever' },
    ],
  },
  {
    id: 'c1_wait', chapter: 1, backdrop: 'alley',
    title: 'უკანა შესასვლელი',
    text: 'ორმოცი წუთი. სიგარეტი ჩაქრა და ხელახლა აანთე. ბოლოს უკანა კარი გაიღო — ზვიადი გამოვიდა, მარტო, ხელში შავი ჩანთა.\n\nშენ არ დაუნახავხარ. ჯერ.',
    choices: [
      { text: 'გამოეკიდე — ვნახოთ სად მიაქვს', effects: { cunning: 2 }, next: 'c1_follow', beat: 'clever' },
      { text: 'გზა გადაუღობე', effects: { nerve: 1 }, next: 'c1_block', beat: 'tense' },
    ],
  },
  {
    id: 'c1_follow', chapter: 1, backdrop: 'alley',
    text: 'ორ კვარტალს გაჰყევი. შემდეგ გაჩერდა — მოასფალტებულ ეზოში, სადაც ერთი მანქანა იდგა ჩამქრალი ფარებით.\n\nფანჯარა ჩამოწიეს. შიგნით მჯდომს ფორმა არ ეცვა, მაგრამ იმ სახეს იცნობ: ინსპექტორი ქავთარაძე. ზვიადმა ჩანთა გადასცა და რაღაც ხანგრძლივად უთხრა.',
    choices: [
      { text: 'გამოდი ჩრდილიდან და ჰკითხე პირდაპირ', effects: { nerve: 2, heat: 2 }, next: 'c1_confront_cop', beat: 'violent' },
      { text: 'დაიმახსოვრე ყველაფერი და ჩუმად წადი', effects: { cunning: 2 }, setFlags: { knows_snitch: true }, next: 'c1_collect', beat: 'clever' },
    ],
  },
  {
    id: 'c1_confront_cop', chapter: 1, backdrop: 'alley',
    speaker: 'ინსპექტორი ქავთარაძე',
    text: '„საინტერესოა," — ამბობს ის ისე, თითქოს ამინდზე საუბრობდეს. — „შენ ახლა ორი რამ გაიგე. პირველი: შენი მეგობარი ჩემთან ლაპარაკობს. მეორე: მე ვიცი, რომ შენ ეს იცი."\n\nზვიადი ფერმკრთალია. ინსპექტორი იღიმება.',
    choices: [
      { text: 'უკან დაიხიე — ეს შენი ბრძოლა არაა', effects: { heat: 1 }, setFlags: { knows_snitch: true }, next: 'c1_collect', beat: 'calm' },
      { text: 'დაემუქრე ინსპექტორს', requires: [{ stat: 'nerve', min: 5 }], lockedHint: 'საჭიროა ნერვი 5', effects: { nerve: 2, heat: 3 }, setFlags: { knows_snitch: true, marked: true }, next: 'c1_collect', beat: 'violent' },
    ],
  },
  {
    id: 'c1_block', chapter: 1, backdrop: 'alley',
    text: 'ჩრდილიდან გამოხვედი. ზვიადი შედგა ისე მკვეთრად, თითქოს კედელს დაეჯახა. ჩანთა უფრო მაგრად მოიჭირა.\n\n„არ არის ჩემთან," — თქვა მაშინვე, სანამ რამეს ჰკითხავდი. ცუდი მატყუარაა.',
    choices: [
      { text: 'დაამშვიდე — შეშინებული კაცი ცუდად ითვლის', effects: { cunning: 2 }, next: 'c1_quiet', beat: 'clever' },
      { text: 'ჩანთა წაართვი', effects: { nerve: 1, money: 2, heat: 1 }, next: 'c1_collect', beat: 'violent' },
    ],
  },
  {
    id: 'c1_fight', chapter: 1, backdrop: 'bar',
    text: 'ჭიქა იატაკზე გაიფანტა. პირველი კაცი ადგა — და დაჯდა, როცა დაინახა, რომ არ იხევ. მეორემ ხელი არ გაანძრია.\n\nზვიადმა ჯიბიდან რულონი ამოიღო და მაგიდაზე დადო. ბარმენი პირდაპირ ჭიქას წმენდს და არსად იყურება.',
    choices: [
      { text: 'აიღე და გადი', effects: { money: 3 }, next: 'c1_collect', beat: 'calm' },
      { text: 'ჯერ არ დაასრულო — გაკვეთილი უნდა დაამახსოვრდეს', effects: { nerve: 1, heat: 3, trust: 1 }, setFlags: { brutal: true }, next: 'c1_collect', beat: 'violent' },
    ],
  },
  {
    id: 'c1_quiet', chapter: 1, backdrop: 'bar',
    text: 'ჩაუჯექი ისე ახლოს, რომ სხვამ ვერაფერი გაიგოს. ორი წინადადება უთხარი — არც ერთი მუქარა.\n\nსახეზე ფერი შეეცვალა. „ნახევარი მაქვს ახლა," — თქვა ჩურჩულით. — „დანარჩენი ხუთშაბათს."',
    choices: [
      { text: 'მიიღე ნახევარი — სიტყვა უფრო ღირს, ვიდრე ლარი', effects: { money: 2, cunning: 1 }, next: 'c1_collect', beat: 'calm' },
      { text: 'მოსთხოვე სრული ახლავე', effects: { money: 3, nerve: 1, heat: 1 }, next: 'c1_press', beat: 'tense' },
    ],
  },
  {
    id: 'c1_press', chapter: 1, backdrop: 'bar',
    text: 'გავიდა და ათი წუთის შემდეგ დაბრუნდა — სრული თანხით. სად იშოვა, არ გითხრა და შენც არ გკითხავს.\n\nფულის გადმოცემისას თვალებში შეგხედა და იმ წამს გაიგე: ეს კაცი შენ აღარასდროს გაპატიებს.',
    choices: [
      { text: 'აიღე და გადი', setFlags: { zviad_hates: true }, next: 'c1_collect', beat: 'calm' },
    ],
  },
  {
    id: 'c1_collect', chapter: 1, backdrop: 'car',
    title: 'გზა ვაკიდან',
    text: 'მანქანაში წვიმის ხმა უცებ შორეული ხდება. ქუჩის ფარნები ერთმანეთის მიყოლებით გადაცურავენ საქარე მინაზე.\n\nჯიბეში ფული გაქვს. თავში — ის, რაც ამაღამ ნახე.',
    choices: [
      { text: 'ლევანთან წადი', next: 'c2_office', beat: 'calm' },
    ],
  },

  // ════════ თავი 2 — პორტი ════════
  {
    id: 'c2_office', chapter: 2, backdrop: 'office',
    title: 'ლევანის კაბინეტი · 01:20',
    speaker: 'ბატონი ლევანი',
    text: 'ფული დათვალა ისე, თითქოს არ აინტერესებდა, და უჯრაში ჩადო.\n\n„კარგი. ახლა — ნამდვილი საქმე." — ლამპის შუქი მხოლოდ მის ხელებს ანათებს, სახე ჩრდილშია. — „პორტში კონტეინერია. გათენებამდე უნდა გაქრეს. ვინც წაიღებს, ის ჩემი ხალხია. ვინც არა — ჩემი ნაცნობი."',
    choices: [
      { text: '„ვიღებ."', effects: { trust: 1 }, next: 'c2_docks_brief', beat: 'calm' },
      { text: '„რატომ მე?"', effects: { cunning: 1, trust: 1 }, next: 'c2_ask', beat: 'clever' },
      { text: '„არა. ეს ჩემი დონე არაა."', effects: { trust: -2, nerve: 1 }, setFlags: { reluctant: true }, next: 'c2_refuse', beat: 'tense' },
    ],
  },
  {
    id: 'c2_ask', chapter: 2, backdrop: 'office',
    speaker: 'ბატონი ლევანი',
    text: 'პირველად შემოგხედა პირდაპირ.\n\n„იმიტომ, რომ დღეს ღამით ორი გზა გქონდა და შენ ის აირჩიე, რომელზეც ნაკლები ხმაური იყო." — პაუზა. — „ან იმიტომ, რომ თუ რამე ცუდად წავა, შენი დაკარგვა იაფი მიჯდება. ორივე სიმართლეა. აირჩიე რომელი გირჩევნია."',
    choices: [
      { text: '„პირველი."', effects: { trust: 1 }, next: 'c2_docks_brief', beat: 'calm' },
      { text: '„მეორე. ასე მაინც ვიცი სად ვდგავარ."', effects: { cunning: 2 }, next: 'c2_docks_brief', beat: 'clever' },
    ],
  },
  {
    id: 'c2_refuse', chapter: 2, backdrop: 'office',
    speaker: 'ბატონი ლევანი',
    text: '„შენი დონე." — გაიმეორა ნელა, თითქოს უცხო სიტყვა ყოფილიყო. — „ბიჭო, დონე არ გაქვს. მხოლოდ ვალი გაქვს და დრო."\n\nსიგარეტს მოუკიდა. „მაინც წახვალ. უბრალოდ ახლა უფრო იაფად."',
    choices: [
      { text: 'დაეთანხმე', effects: { trust: 1 }, next: 'c2_docks_brief', beat: 'calm' },
    ],
  },
  {
    id: 'c2_docks_brief', chapter: 2, backdrop: 'docks',
    title: 'ფოთის პორტი · 03:05',
    text: 'ნისლი მუხლებამდე დგას. ამწეები ჩონჩხებივით ჩანან ლურჯ სიბნელეში. კონტეინერი მეშვიდე რიგშია — ლურჯი, ნომრით რომ არაფერი ჰგავს.\n\nდათო ჩრდილში დგას და შენ გელოდება. ის ყოველთვის ბევრს ლაპარაკობს.',
    choices: [
      { text: 'გაუშვი დათო — მარტო უფრო ჩუმია', effects: { cunning: 1, nerve: 1 }, next: 'c2_alone', beat: 'calm' },
      { text: 'წაიყვანე — ორი ხელი სჯობს', effects: { trust: 1 }, next: 'c2_dato', beat: 'calm' },
      { text: 'დარეკე ქავთარაძესთან და გაყიდე ეს ღამე', requires: [{ stat: 'cunning', min: 5, flag: 'knows_snitch' }], lockedHint: 'საჭიროა, რომ იცოდე ინსპექტორის ნომერი', effects: { money: 4, heat: 4, trust: -3 }, setFlags: { informed: true }, next: 'c2_tip', beat: 'clever' },
    ],
  },
  {
    id: 'c2_alone', chapter: 2, backdrop: 'docks',
    text: 'ბოქლომი ძველია და ხმაურიანი. ორჯერ გაჩერდი, როცა შორს ფეხის ხმა მოგეჩვენა.\n\nკარი გაიღო ერთი თითის სიგანეზე. შიგნიდან ჰაერი გამოვიდა — და იმ ჰაერს სუნი ჰქონდა, რომელიც ტექნიკას არ ახასიათებს.',
    choices: [
      { text: 'გახსენი ბოლომდე და ნახე', effects: { nerve: 2 }, next: 'c2_open', beat: 'tense' },
      { text: 'დახურე. შენი საქმე გადატანაა, არა ცოდნა', effects: { cunning: 1, trust: 1 }, next: 'c2_moved', beat: 'calm' },
    ],
  },
  {
    id: 'c2_dato', chapter: 2, backdrop: 'docks',
    speaker: 'დათო',
    text: '„შენ იცი რა არის შიგნით?" — ჩურჩულებს ისე ხმამაღლა, რომ ჩურჩული აღარაა. — „მე ერთმა მითხრა რომ..."\n\n„დათო."\n\n„კარგი, კარგი." — ხელს იქნევს. — „უბრალოდ ვამბობ, რომ ლურჯ კონტეინერებს ლევანი არასდროს არ..."',
    choices: [
      { text: '„გაჩუმდი და ბოქლომი გატეხე."', effects: { nerve: 1 }, next: 'c2_open', beat: 'tense' },
      { text: '„რა გითხრეს? მითხარი."', effects: { trust: 1, cunning: 1 }, setFlags: { dato_trusts: true }, next: 'c2_moved', beat: 'clever' },
    ],
  },
  {
    id: 'c2_tip', chapter: 2, backdrop: 'docks',
    text: 'ოც წუთში პორტი ლურჯად აინთო. შენ უკვე ღობის მეორე მხარეს იყავი და ისე უყურებდი, როგორც უცხო ადამიანი უყურებს სხვის უბედურებას.\n\nჯიბეში ფული დაგიმძიმდა. მკერდში — რაღაც სხვა.',
    choices: [
      { text: 'გაქრი ქალაქში', effects: { heat: 1 }, next: 'c3_suspicion', beat: 'tense' },
    ],
  },
  {
    id: 'c2_open', chapter: 2, backdrop: 'docks',
    text: 'შიგნით ხის ყუთები დგას, ბრეზენტით დაფარული. ბრეზენტი ასწიე.\n\nიარაღი. არა ორი-სამი — ორმოცდაათი, ზეთში, ახალი. და ყუთების უკან, კონტეინერის სიღრმეში, საბანი და ცარიელი ბოთლები. აქ ვიღაც იჯდა. ცოტა ხნის წინ.',
    choices: [
      { text: 'დახურე და გააგრძელე. არაფერი გინახავს', effects: { trust: 1, nerve: 1 }, setFlags: { saw_cargo: true }, next: 'c2_moved', beat: 'calm' },
      { text: 'იპოვე ის, ვინც აქ იჯდა', effects: { heat: 2, trust: -2, nerve: 2 }, setFlags: { saw_cargo: true, released: true }, next: 'c2_release', beat: 'violent' },
    ],
  },
  {
    id: 'c2_release', chapter: 2, backdrop: 'docks',
    text: 'ის მეზობელ კონტეინერში იყო — თექვსმეტისა, თუ იმდენიც. ლაპარაკი არ შეეძლო, მხოლოდ იყურებოდა.\n\nღობის ხვრელი აჩვენე და უკან აღარ მოგიხედავს. ეს შენი ღამის ერთადერთი ნაწილია, რომელსაც ლევანს ვერასდროს მოუყვები.',
    choices: [
      { text: 'დაასრულე სამუშაო ისე, თითქოს არაფერი მომხდარა', next: 'c2_moved', beat: 'calm' },
    ],
  },
  {
    id: 'c2_moved', chapter: 2, backdrop: 'car',
    title: 'გათენებამდე ერთი საათი',
    text: 'კონტეინერი გაქრა. მანქანა ცარიელ გზატკეცილზე მიდის და ცა კიდეზე ნაცრისფრდება.\n\nდაღლილობა ისეთია, რომ ტკივილს ჰგავს. მაგრამ ღამე გადაიტანე.',
    choices: [
      { text: 'შინ', next: 'c3_suspicion', beat: 'calm' },
    ],
  },

  // ════════ თავი 3 — ვირთხა ════════
  {
    id: 'c3_suspicion', chapter: 3, backdrop: 'room',
    title: 'შენი ბინა · სამი დღის შემდეგ',
    text: 'ტელეფონმა სამჯერ დარეკა და გაჩუმდა — ლევანის ნიშანი, როცა არ სურს, რომ ჩაწერილი დარჩეს.\n\nშეხვედრაზე ხუთი კაცი იყო. ლევანმა ერთი წინადადება თქვა: „ჩვენში ვიღაც პოლიციას ელაპარაკება." და დაამატა მეორე: „ვინც პირველი მომიყვანს — ის ჩემი მარჯვენა ხელია."',
    choices: [
      { text: 'გამოიძიე — ვინც ჩქარობს, ის კვდება', effects: { cunning: 2 }, next: 'c3_investigate', beat: 'clever' },
      { text: 'დაასახელე დათო — ის ზედმეტს ლაპარაკობს', requires: [{ stat: 'trust', min: 3 }], lockedHint: 'ლევანმა უნდა დაგიჯეროს — საჭიროა ნდობა 3', effects: { trust: 2, cunning: -1 }, setFlags: { blamed_dato: true }, next: 'c3_blame', beat: 'violent' },
      { text: 'გაჩუმდი და დაელოდე', effects: { nerve: 1, trust: -1 }, next: 'c3_silent', beat: 'calm' },
    ],
  },
  {
    id: 'c3_investigate', chapter: 3, backdrop: 'bar',
    title: 'ბარი „ლურჯი" · კვლავ',
    text: 'ბარმენი ნინო ყველაფერს ხედავს და არაფერს ამბობს — სანამ სწორად არ ჰკითხავ.\n\n„სამშაბათს," — თქვა ბოლოს, ჭიქიდან თვალის აუღებლად. — „ერთი კაცი უკანა კარიდან გავიდა და ოცი წუთით დაბრუნდა. ორი კვირაა ყოველ სამშაბათს ასე ხდება."',
    choices: [
      { text: 'დაელოდე სამშაბათს და თვითონ ნახე', effects: { cunning: 2, nerve: 1 }, next: 'c3_evidence', beat: 'clever' },
      { text: 'ნინოს გადაუხადე, რომ სახელი დაასახელოს', effects: { money: -2, cunning: 1 }, next: 'c3_evidence', beat: 'calm' },
    ],
  },
  {
    id: 'c3_evidence', chapter: 3, backdrop: 'alley',
    text: 'სამშაბათი. უკანა კარი გაიღო 22:15-ზე.\n\nზვიადი გამოვიდა. იმავე ეზოსკენ წავიდა, სადაც ერთხელ უკვე ნახე — და იმავე ჩამქრალფარებიან მანქანასთან შედგა.\n\nახლა უკვე ორივე რამ იცი: ვინ და როგორ.',
    choices: [
      { text: 'წაიღე ლევანთან. ეს არის ის, რაც სთხოვა', effects: { trust: 3 }, setFlags: { proved_zviad: true }, next: 'c3_summons', beat: 'calm' },
      { text: 'შეინახე. ეს ინფორმაცია ზვიადზე უფრო ღირს', requires: [{ stat: 'cunning', min: 6 }], lockedHint: 'საჭიროა ეშმაკობა 6', effects: { cunning: 2, money: 4, heat: 1 }, setFlags: { leverage: true }, next: 'c3_leverage', beat: 'clever' },
    ],
  },
  {
    id: 'c3_leverage', chapter: 3, backdrop: 'alley',
    text: 'ზვიადს არაფერი გამოსდის, როცა გაიგო, რომ იცი. ფერმკრთალდება, ცდილობს რაღაცის თქმას, ბოლოს ჩუმდება.\n\nყოველთვიური თანხა შენთვის — და შენი დუმილი მისთვის. ეს არ არის სამართლიანი გარიგება. სამართლიანობა არავის უთქვამს.',
    choices: [
      { text: 'ახლა ლევანთან', next: 'c3_summons', beat: 'clever' },
    ],
  },
  {
    id: 'c3_blame', chapter: 3, backdrop: 'room',
    text: 'დათო ორ დღეში გაქრა. მესამე დღეს მდინარესთან იპოვეს.\n\nლევანმა მხარზე ხელი დაგადო და „კარგი ბიჭი" გითხრა. იმ ღამეს პირველად ვერ დაიძინე ისე, რომ ჭერისთვის არ გეყურებინა.\n\nხოლო სამშაბათობით უკანა კარი კვლავ იღება. მაგრამ ამას შენ ჯერ არ იცი.',
    choices: [
      { text: 'მიიღე ის, რაც მოგცეს', effects: { nerve: -1 }, setFlags: { guilt: true }, next: 'c3_summons', beat: 'tense' },
    ],
  },
  {
    id: 'c3_silent', chapter: 3, backdrop: 'room',
    text: 'დუმილს ორი შედეგი აქვს. პირველი: არავის ეტყვი იმას, რაც არ იცი.\n\nმეორე: როცა ყველა სახელს ასახელებს და შენ არა, შენი სახელი ისედაც გაჟღერდება. ხუთშაბათს კარზე დააკაკუნეს — და ეს ლევანის კაცები არ იყვნენ.',
    choices: [
      { text: 'გაჰყევი მათ', next: 'c3_interrogation', beat: 'tense' },
    ],
  },
  {
    id: 'c3_interrogation', chapter: 3, backdrop: 'interrogation',
    title: 'განყოფილება · 04:00',
    speaker: 'ინსპექტორი ქავთარაძე',
    text: '„შენ ღრმად არ ხარ," — ამბობს და საქაღალდეს არ ხსნის. — „ჯერ. ეს კარგი ამბავია, იმიტომ რომ ღრმად რომ იყო, მე ახლა შენთან არ ვისხდებოდი — უბრალოდ დაგპატიმრებდი."\n\nსაქაღალდეზე თითი დაადო. „მითხარი პორტზე და ხვალვე შინ ხარ."',
    choices: [
      { text: 'გაჩუმდი. სულ', requires: [{ stat: 'nerve', min: 5 }], lockedHint: 'საჭიროა ნერვი 5 — რვა საათი დუმილი ადვილი არაა', effects: { nerve: 2, trust: 1 }, next: 'c3_released', beat: 'tense' },
      { text: 'ილაპარაკე — ცოტა. მხოლოდ ის, რაც არაფერს აფუჭებს', effects: { cunning: 1, heat: -2, trust: -2 }, setFlags: { deal: true }, next: 'c3_deal', beat: 'clever' },
    ],
  },
  {
    id: 'c3_released', chapter: 3, backdrop: 'interrogation',
    text: 'რვა საათის შემდეგ გაგიშვეს, იმიტომ რომ სხვა გზა არ ჰქონდათ.\n\nგარეთ დილაა და თვალები სტკივა. ლევანის მანქანა ქუჩის მეორე მხარეს დგას — ე.ი. იცის, რომ არაფერი თქვი. ეს ყველაზე ძვირფასი რამაა, რაც ამ კვირაში მოიპოვე.',
    choices: [
      { text: 'ჩაჯექი მანქანაში', effects: { trust: 2 }, next: 'c3_summons', beat: 'calm' },
    ],
  },
  {
    id: 'c3_deal', chapter: 3, backdrop: 'interrogation',
    text: 'ორი წინადადება თქვი. მხოლოდ ორი — და ორივე ისეთი, რომ თითქოს არაფერს ღალატობდე.\n\nქავთარაძემ არაფერი ჩაიწერა. ეს ყველაზე ცუდი ნიშანია: რაც არ იწერება, ის მოგვიანებით გამოიყენება.',
    choices: [
      { text: 'გადი გარეთ და ილოცე, რომ ეს არასდროს ამოტივტივდეს', next: 'c3_summons', beat: 'tense' },
    ],
  },

  // ════════ თავი 4 — ანგარიშსწორება ════════
  {
    id: 'c3_summons', chapter: 4, backdrop: 'office',
    title: 'ლევანის კაბინეტი · შაბათი',
    speaker: 'ბატონი ლევანი',
    text: 'ამჯერად კაბინეტში მარტო არაა. ორი კაცი კართან დგას და არც ერთი არ ზის.\n\n„დაჯექი." — ლამპა ისევ მხოლოდ ხელებს უნათებს. — „ერთი კითხვა მაქვს და ერთი პასუხი მინდა. ვინ ელაპარაკება პოლიციას?"\n\nჰაერი ისეთია, თითქოს ოთახს სუნთქვა შეეკრა.',
    choices: [
      { text: 'უთხარი სიმართლე — რაც არ უნდა იყოს', next: 'c4_truth', beat: 'tense' },
      { text: 'მოატყუე ისე, რომ დაიჯეროს', requires: [{ stat: 'cunning', min: 7 }], lockedHint: 'საჭიროა ეშმაკობა 7 — ლევანს ბევრმა სცადა', effects: { cunning: 1, trust: 1 }, next: 'c4_lie', beat: 'clever' },
      { text: 'პირველი დაარტყი — სანამ ისინი დაარტყამენ', requires: [{ stat: 'nerve', min: 7 }], lockedHint: 'საჭიროა ნერვი 7', effects: { heat: 3 }, next: 'c4_strike', beat: 'violent' },
      { text: 'ადექი და გაიქეცი', effects: { heat: 2, trust: -3 }, next: 'c4_run', beat: 'tense' },
    ],
  },
  {
    id: 'c4_truth', chapter: 4, backdrop: 'office',
    text: 'ყველაფერი თქვი. ისიც, რაც შენს სასარგებლოდ არ იყო.\n\nლევანი დიდხანს ჩუმად იყო. შემდეგ კართან მდგომებს ხელი ანიშნა და ისინი გავიდნენ.\n\n„ეს პირველი შემთხვევაა ხუთი წლის განმავლობაში, როცა ვინმემ ამ ოთახში სიმართლე თქვა."',
    choices: [
      { text: 'ითხოვე მეორე შანსი', requires: [{ stat: 'trust', min: 5 }], lockedHint: 'საჭიროა ნდობა 5', effects: { trust: 2 }, next: 'c4_forgiven', beat: 'calm' },
      { text: 'არაფერი ითხოვო. მიიღე, რაც მოგელის', effects: { nerve: 2 }, next: '@end:loyal', beat: 'calm' },
    ],
  },
  {
    id: 'c4_lie', chapter: 4, backdrop: 'office',
    text: 'ისე ალაგებ სიტყვებს, თითქოს წლების განმავლობაში გემზადებინოს. სახელს არ ასახელებ — მიმართულებას აძლევ. ეს უფრო სარწმუნოა.\n\nლევანმა თავი დაუქნია. „კარგი." — და შენ იმ წამს გაიგე, რომ დაგიჯერა. ან ისე მოიქცა, თითქოს დაგიჯერა. ამ ოთახში ეს ერთი და იგივეა.',
    choices: [
      { text: 'გაჩერდი მის გვერდით', next: 'c4_forgiven', beat: 'clever' },
    ],
  },
  {
    id: 'c4_strike', chapter: 4, backdrop: 'office',
    text: 'მაგიდა გადაბრუნდა. ლამპა იატაკზე დაეცა და ოთახი ერთბაშად უცნაურ კუთხეებად დაიშალა.\n\nყვირილი, ორი გასროლა, მერე — სიჩუმე, რომელიც ყურებში წკრიალებს.\n\nდგახარ. ისინი — არა. ლევანი კედელთან ზის და შენ გიყურებს ისე, როგორც ჯერ არასდროს.',
    choices: [
      { text: 'დაასრულე. ქალაქს ერთი პატრონი სჭირდება', requires: [{ stat: 'nerve', min: 8 }], lockedHint: 'საჭიროა ნერვი 8', effects: { heat: 2 }, next: '@end:king', beat: 'violent' },
      { text: 'გაიქეცი, სანამ დრო გაქვს', effects: { heat: 2 }, next: 'c4_run', beat: 'tense' },
    ],
  },
  {
    id: 'c4_forgiven', chapter: 4, backdrop: 'office',
    speaker: 'ბატონი ლევანი',
    text: '„ზვიადს მე მოვაგვარებ." — თქვა და უჯრა გამოაღო. — „შენ სხვა რამეს გავაკეთებინებ."\n\nმაგიდაზე გასაღები დადო. „ორი კვირის შემდეგ პორტში ჩემი ადამიანი მჭირდება. არა კაცი, რომელიც ყუთებს ეზიდება — ადამიანი, რომელიც წყვეტს."',
    choices: [
      { text: 'აიღე გასაღები და დარჩი ჯარისკაცად', effects: { trust: 1 }, next: '@end:loyal', beat: 'calm' },
      { text: 'უთხარი, რომ ნახევარი გინდა', requires: [{ stat: 'trust', min: 7 }, { stat: 'nerve', min: 6 }], lockedHint: 'საჭიროა ნდობა 7 და ნერვი 6', next: '@end:king', beat: 'clever' },
      { text: 'დადე გასაღები მაგიდაზე და გადი', requires: [{ stat: 'money', min: 5 }], lockedHint: 'საჭიროა ფული 5 — ცარიელი ჯიბით ვერსად წახვალ', next: '@end:clean', beat: 'calm' },
    ],
  },
  {
    id: 'c4_run', chapter: 4, backdrop: 'alley',
    title: 'უკანა ქუჩები',
    text: 'ორი კვარტალი გაიქეცი, სანამ მიხვდი, რომ არავინ მოგდევს. ეს არ ნიშნავს, რომ არ დაგეძებენ — მხოლოდ იმას, რომ ჩქარობა აღარ სჭირდებათ.\n\nჯიბეში ის გაქვს, რაც გაქვს. ქალაქი ორ მხარეს იშლება: აღმოსავლეთით — პორტი და გემები. დასავლეთით — ბინები, სადაც არავინ კითხულობს სახელს.',
    choices: [
      { text: 'პორტისკენ. ბილეთი და ზღვა', requires: [{ stat: 'money', min: 5 }], lockedHint: 'საჭიროა ფული 5', next: '@end:clean', beat: 'calm' },
      { text: 'დაიმალე ქალაქში', requires: [{ stat: 'cunning', min: 5 }], lockedHint: 'საჭიროა ეშმაკობა 5', next: '@end:ghost', beat: 'clever' },
      { text: 'თვითონ მიდი ქავთარაძესთან, სანამ ისინი მოვლენ', next: '@end:caught', beat: 'tense' },
      { text: 'დაჯექი კიბეზე და დაელოდე', next: '@end:betrayed', beat: 'violent' },
    ],
  },
];

export const ENDINGS: Ending[] = [
  {
    id: 'king', tone: 'triumph', label: 'ქალაქის პატრონი',
    body: 'ლევანის კაბინეტში ახლა შენ ზიხარ და ლამპას ისე აყენებ, რომ სახე ჩრდილში დაგრჩეს — ეს ის დეტალია, რომელსაც არავინ გასწავლის.\n\nქალაქი არ შეცვლილა. მხოლოდ სახელი შეიცვალა, რომელსაც ჩურჩულით ამბობენ.',
  },
  {
    id: 'clean', tone: 'survival', label: 'გემი გათენებამდე',
    body: 'ბილეთი ნაღდი ფულით იყიდე და სახელი არავის უთხარი. გემი ხუთ საათზე გავიდა.\n\nნაპირი ჯერ კიდევ ჩანდა, როცა ტელეფონი ზღვაში ჩააგდე. ეს არ არის გამარჯვება. ეს არის ის იშვიათი რამ, რაც ამ ქალაქში გამარჯვებაზე ძვირია: გასვლა.',
  },
  {
    id: 'loyal', tone: 'survival', label: 'ლევანის მარჯვენა',
    body: 'გასაღები აიღე. ორ კვირაში პორტში სხვა კაცი დგას შენს ადგილას და შენ ეუბნები, რომელი კონტეინერი როდის გაქრეს.\n\nზოგჯერ, ღამით, გახსოვს ბიჭი მეზობელ კონტეინერში. მაგრამ ეს იშვიათად ხდება. და წლებთან ერთად — უფრო იშვიათად.',
  },
  {
    id: 'ghost', tone: 'survival', label: 'აჩრდილი',
    body: 'იმ ბინაში ცხოვრობ, სადაც პატრონმა სახელი არ იკითხა. ფულს ნაღდად იხდი, სამსახურში ღამით დადიხარ და ორ კვირაში ერთხელ სხვა უბანში გადადიხარ.\n\nცოცხალი ხარ. ეს სიტყვა უფრო პატარაა, ვიდრე გეგონა, მაგრამ სხვა არაფერი დაგრჩა.',
  },
  {
    id: 'caught', tone: 'ruin', label: 'ცივი ოთახი',
    body: 'ქავთარაძემ საქაღალდე ბოლოს და ბოლოს გახსნა. შიგნით შენი სახელი ისე ბევრჯერ ეწერა, რომ ლაპარაკს აზრი აღარ ჰქონდა.\n\nშვიდი წელი მიიღე. მესამე წელს გაიგე, რომ ლევანი ისევ იმავე კაბინეტში ზის და ლამპას ისევე აყენებს.',
  },
  {
    id: 'betrayed', tone: 'death', label: 'კიბეზე',
    body: 'არ გაქცეულხარ, იმიტომ რომ არსად გქონდა გასაქცევი. ისინი მოვიდნენ — არა ჩქარა, არა ბრაზით. სამსახურეობრივად.\n\nუკანასკნელი, რაც დაინახე, ქუჩის ფარანი იყო, რომელიც წვიმაში ორად იშლებოდა. ისევე, როგორც პირველ ღამეს.',
  },
];
