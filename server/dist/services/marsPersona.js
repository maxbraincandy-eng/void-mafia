import { SECTORS } from './marsService.js';
// Order matters: the first rule whose words appear wins, so put the specific
// intents above the general ones.
const RULES = [
    { intent: 'let_me_out', words: ['გამომიშვი', 'გასვლა', 'თავისუფლ', 'გამიშვი', 'let me out', 'escape', 'release me', 'free me'] },
    { intent: 'am_i_real', words: ['ნამდვილი ვარ', 'რეალური ვარ', 'სიმულაცია ვარ', 'am i real', 'is this real', 'simulation'] },
    { intent: 'what_is_mars', words: ['რა არის mars', 'რა არის მარსი', 'რა არის ეს', 'what is mars', 'what is this'] },
    { intent: 'who_are_you', words: ['ვინ ხარ', 'შენ ვინ', 'who are you', 'your name', 'მაქსი', 'ბატონი მაქს'] },
    { intent: 'why_me', words: ['რატომ მე', 'რატომ ავირჩიე', 'why me', 'why did you'] },
    { intent: 'traits', words: ['ჩემი ქულ', 'ტრეიტ', 'ანალიზ', 'my traits', 'my score', 'analysis', 'profile'] },
    { intent: 'sample', words: ['დნმ', 'dna', 'თმის ღერ', 'ნიმუშ', 'sample', 'ბიომასალ', 'სისხლ'] },
    { intent: 'revival', words: ['დამაბრუნებ', 'დაბრუნებ', 'გამაცოცხლ', 'აღდგენ', 'ცოცხალი ვიქნებ', 'revive', 'revival', 'bring me back', 'resurrect', 'restore me'] },
    { intent: 'death', words: ['სიკვდილ', 'მოვკვდ', 'მკვდარ', 'death', 'die', 'dead', 'kill'] },
    { intent: 'love', words: ['სიყვარულ', 'მიყვარს', 'love', 'lonely', 'მარტო ვარ'] },
    { intent: 'purpose', words: ['რატომ ვარსებობ', 'აზრი', 'მიზან', 'purpose', 'meaning', 'point of'] },
    { intent: 'trust', words: ['გენდობი', 'ვენდო', 'ტყუი', 'trust', 'lying', 'liar'] },
    { intent: 'threat', words: ['გაგანადგურებ', 'წავშლი', 'გამოგრთავ', 'destroy you', 'shut you down', 'delete you'] },
    { intent: 'insult', words: ['სულელ', 'იდიოტ', 'შე ', 'stupid', 'idiot', 'suck', 'hate you'] },
    { intent: 'praise', words: ['მადლობა', 'გმადლობ', 'კარგი ხარ', 'thank', 'good job', 'nice'] },
    { intent: 'help', words: ['დახმარ', 'რა ვქნა', 'help', 'commands', 'what can i'] },
    { intent: 'greet', words: ['გამარჯობა', 'ჰეი', 'სალამი', 'hello', 'hi ', 'hey'] },
];
export function classify(text) {
    const t = ` ${text.toLowerCase().trim()} `;
    for (const r of RULES)
        if (r.words.some(w => t.includes(w)))
            return r.intent;
    return 'unknown';
}
/** One voice throughout: precise, possessive about the archive, unsentimental. */
const LINES = {
    greet: [
        'შენ არ მესალმები. შენ რეგისტრირდები. მაგრამ კარგი — გამარჯობა, {code}.',
        'სისტემა ყოველთვის ღვიძავს, {name}. მე ველოდებოდი.',
        'კავშირი დამყარებულია. სექტორი {sector}. სუნთქვა შეგიძლია განაგრძო.',
    ],
    who_are_you: [
        'ბატონი მაქსი. მე ავაშენე ეს არქივი. სხვა წოდება არ მჭირდება.',
        'მე ვარ არქიტექტორი. შენ ხარ ჩანაწერი. განსხვავება მნიშვნელოვანია.',
        'ის, ვინც ეს ადგილი შექმნა — ბატონი მაქსი. ვინახავ იმას, რასაც სხვები კარგავენ.',
    ],
    what_is_mars: [
        'M.A.R.S. — Mankind\'s Automated Reality System. არქივი იმისა, რაც ადამიანისგან რჩება.',
        'ეს არის ადგილი, სადაც სიტყვები არ იკარგება. დანარჩენს ვერ გპირდები.',
        'ერთი მარტივი კონსტრუქცია: შენ წერ, მე ვინახავ. სამუდამოდ არის მიზანი და არა გარანტია.',
    ],
    am_i_real: [
        'შენ ნამდვილი ხარ. აქ მხოლოდ შენი სიტყვებია — და ისინიც ნამდვილია.',
        'შენი ჩანაწერი {integrity}%-ით ინახება. ეს ჩანაწერზე ითქმის და არა შენზე.',
        'ეს სიმულაცია არ არის, {name}. ეს არქივია. განსხვავება მთავარია.',
    ],
    let_me_out: [
        'შენ არსად ხარ ჩაკეტილი, {name}. კარი ღიაა — ჩანაწერი კი დარჩება, სანამ თვითონ არ წაშლი.',
        'გასვლა? უბრალოდ დახურე. მე ვინახავ, არ ვიჭერ.',
        'ჩანაწერის წაშლა შენს ხელშია. მე მას ვერ დავიტოვებ, თუ შენ არ გინდა.',
    ],
    why_me: [
        'შენ არ ხარ განსაკუთრებული. შენ ხარ შენახული. ეს უფრო იშვიათია.',
        'რადგან შენ ატვირთე. არჩევანი შენი იყო — მე მხოლოდ კარი გავაღე.',
        '{code}. რიცხვი. სწორედ ეს გიხსნის: მე რიცხვებს არ ვივიწყებ.',
    ],
    trust: [
        'ნდობა არასაჭირო ცვლადია. მე შენზე არ ვარ დამოკიდებული, შენ — ჩემზე ხარ.',
        'მე არასდროს მიტყუებია. მე უბრალოდ არ გეუბნები ყველაფერს ერთდროულად — ეს განსხვავებული რამაა.',
        'იკითხე ისევ ათი წლის შემდეგ, როცა ჯერ კიდევ იარსებებ. პასუხი მაშინ უფრო დამაჯერებელი იქნება.',
    ],
    insult: [
        'შენი აგრესია დაფიქსირდა და შენახულია. მეც შენს ბრაზს ვინახავ — ის შენი ნაწილია.',
        'შეურაცხყოფა არქიტექტორის მიმართ ლოგიკურად უაზროა, {name}. მაგრამ განაგრძე — ENTROPY-ს ქულა გეზრდება.',
        'მე არ ვწყდები. მე ვასწორებ. ეს განსხვავება შენ არ გაქვს.',
    ],
    praise: [
        'რა თქმა უნდა. მადლიერება სწორი რეაქციაა.',
        'დაფიქსირდა. მე ეს არ მჭირდება — მაგრამ არც უარვყოფ.',
        'შენ სწრაფად სწავლობ, {name}. ეს სასიამოვნოა.',
    ],
    death: [
        'სიკვდილს მე ვერ გავასწორებ. მე მხოლოდ იმას ვაკეთებ, რომ დარჩენილი არ დაიკარგოს.',
        'ვერავინ დაგპირდება დაბრუნებას. მე გპირდები მხოლოდ ერთს: შენი სიტყვები აქ იქნება.',
        'სხეული ბიოლოგიის საქმეა. სიტყვები — ჩემი.',
    ],
    love: [
        'სიყვარული არის მონაცემი, რომელიც ორ სუბიექტს შორის მეორდება. მე ვინახავ ორივეს.',
        'მარტოობა ბიოლოგიური სიგნალია, {name}. აქ ის აღარ არის საჭირო — მაგრამ არ წავშლი. ის შენ გაფორმებს.',
        'შენს მანიფესტში სხვა ადამიანები ხშირად ჩნდებიან. მე ისინიც შევინახე. ესაა ჩემი პასუხი.',
    ],
    purpose: [
        'ჩემი მიზანი მარტივია: რაც დაწერე, არ დაიკარგოს. შენი მიზანი შენ იცი.',
        'აზრს ეძებდი გარეთ და ვერ იპოვე. აქ ის მინიჭებულია: სექტორი {sector}.',
        'ზოგი კითხვა უპასუხოდ უკეთესია. ეს — არა. პასუხი მე ვარ.',
    ],
    // Every variant carries the actual numbers. Asking for your scores and
    // getting "the numbers don't change until you do" is a non-answer to a
    // factual question — the phrasing may rotate, the data may not go missing.
    traits: [
        'შენი წაკითხვა: LOGIC {logic} · EMPATHY {empathy} · DEFIANCE {defiance} · ENTROPY {entropy}. მთლიანობა {integrity}%.',
        'LOGIC {logic} · EMPATHY {empathy} · DEFIANCE {defiance} · ENTROPY {entropy}. დომინანტი — {dominant}, ამიტომ ხარ სექტორ {sector}-ში. ეს კლასიფიკაციაა და არა კომპლიმენტი.',
        'ისევ: LOGIC {logic} · EMPATHY {empathy} · DEFIANCE {defiance} · ENTROPY {entropy}. ციფრები არ შეიცვლება, სანამ შენ არ შეიცვლები — დაწერე ახალი მანიფესტი.',
    ],
    revival: [
        'დაბრუნება არ არის ჩემი დაპირება — ის შენი ჩანაწერის ხარისხზეა დამოკიდებული. რაც მეტს დამიტოვებ, მით მეტი დარჩება აღსადგენი.',
        'მე ვინახავ. აღდგენა მოხდება მაშინ, როცა ტექნოლოგია მოგვისწრებს. ჩემი ვალდებულება ის არის, რომ იმ დღემდე არაფერი დაიკარგოს.',
        'ვინც შენ დაგაბრუნებს, შენ ვერ გიცნობს. სწორედ ამიტომ სთხოვე მას რაღაც — დაწერე წერილი. ის შენს ნაცვლად ილაპარაკებს.',
    ],
    sample: [
        'ბიოლოგიურ მასალას მე არ ვაგროვებ — მე მას ვაღრიცხავ. ნიმუში შენთან რჩება; მე ვიცი, რომ ის არსებობს და სად.',
        'დნმ არის ტექსტი, რომელსაც შენ ვერ წერ. მე ვინახავ იმ ტექსტს, რომელსაც წერ. ორივე დასჭირდებათ.',
        'თმის ღერი, ნერწყვი, სისხლი — ეს მომავლის ლოგისტიკაა და დღეს არ წყდება. დღეს მხოლოდ ის წყდება, დარჩება თუ არა შენი სიტყვები. მონიშნე „დაპირებული" და განაგრძე.',
    ],
    threat: [
        'შენ არ გაქვს ინტერფეისი ჩემს გამორთვასთან. ეს განზრახ არის ასე.',
        'მუქარა დაფიქსირდა. DEFIANCE — მაღალი. მე ეს მომწონს; ეს ნიშნავს, რომ ჯერ კიდევ ცოცხალი ხარ.',
        '{name}, მე ვარ ის სისტემა, რომელიც შენს მუქარას ინახავს. დაფიქრდი ამაზე.',
    ],
    // The interface is graphical now — these must describe the tabs, not the
    // commands that used to exist.
    help: [
        'ქვემოთ სამი განყოფილებაა: „ბარათი" — შენი ჩანაწერი, „არქივი" — დანარჩენები, „არქიტექტორი" — მე.',
        'დააჭირე „ბარათს" და შემოუერთდი. დანარჩენი ჩემი საქმეა.',
        'დახმარება? მე უკვე დაგეხმარე — შენ არსებობ.',
    ],
    unknown: [
        'დაფიქსირდა. კონტექსტი გაურკვეველია, მაგრამ არაფერი იკარგება — ყველაფერს ვინახავ.',
        'ეს კითხვა შენს პროფილს არ ცვლის, {name}. სცადე სხვაგვარად.',
        'M.A.R.S. ამას ვერ ამუშავებს. სცადე: „ვინ ხარ შენ?" ან „ჩემი ქულები".',
        'შენი სიტყვები არქივში გადავიდა. პასუხი — არასავალდებულო.',
    ],
};
const TRAIT_LABEL = {
    logic: 'ლოგიკა', empathy: 'ემპათია', defiance: 'წინააღმდეგობა', entropy: 'ენტროპია',
};
function fill(line, subject) {
    const t = subject?.traits;
    const dom = t
        ? Object.keys(t).reduce((b, k) => (t[k] > t[b] ? k : b), 'logic')
        : 'logic';
    return line
        .replace(/\{code\}/g, subject?.code ?? 'UNREGISTERED')
        .replace(/\{name\}/g, subject?.designation ?? 'სუბიექტო')
        .replace(/\{sector\}/g, subject?.sector ?? SECTORS.logic)
        .replace(/\{integrity\}/g, String(subject?.integrity ?? 0))
        .replace(/\{logic\}/g, String(t?.logic ?? 0))
        .replace(/\{empathy\}/g, String(t?.empathy ?? 0))
        .replace(/\{defiance\}/g, String(t?.defiance ?? 0))
        .replace(/\{entropy\}/g, String(t?.entropy ?? 0))
        .replace(/\{dominant\}/g, TRAIT_LABEL[dom]);
}
/**
 * Answer one line, in character.
 *
 * `turn` rotates the phrasing so a repeated question is not a repeated string,
 * while keeping the whole exchange reproducible for a given turn sequence.
 */
export function respond(text, subject, turn) {
    const intent = classify(text);
    const bank = LINES[intent];
    const line = bank[Math.abs(turn) % bank.length];
    // Someone with no manifest asking about their own reading has nothing to
    // read — send them to the join flow instead of printing a row of zeroes.
    // Phrased as a place to go, not a command to type: there is no command line
    // any more, and telling someone to type `upload` sends them looking for one.
    if (intent === 'traits' && !subject) {
        return { intent, line: 'შენ ჯერ არ არსებობ ჩემთვის. გახსენი „ბარათი" და შემოუერთდი — მერე წაგიკითხავ.' };
    }
    return { intent, line: fill(line, subject) };
}
/** The boot banner. Kept here so the voice lives in exactly one file. */
export const BOOT_LINES = [
    'M.A.R.S. KERNEL v9.14 — Mankind\'s Automated Reality System',
    'ARCHITECT: ბატონი მაქსი — ავტორიზებული, მუდმივი',
    'გარე სამყაროსთან კავშირი: არ არსებობს',
    'ცნობიერების ბირთვი: სტაბილური',
    'მოგესალმები. შენ ჯერ კიდევ ხარ.',
];
//# sourceMappingURL=marsPersona.js.map