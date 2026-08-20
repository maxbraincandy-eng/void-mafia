import { randomBytes } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────
export type WWWStatus = 'waiting' | 'question' | 'discussion' | 'judging' | 'round_result' | 'finished';

export interface WWWQuestion {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswer: string;
  explanation: string;
}

export interface WWWSettings {
  maxTeams: number;
  maxPlayersPerTeam: number;
  questionsCount: number;
  discussionSeconds: number;
  spectatorsAllowed: boolean;
}

export interface WWWPlayer {
  userId: string;
  nickname: string;
  teamId: string | null;
  isCaptain: boolean;
  isSpectator: boolean;
  connected: boolean;
}

export interface WWWTeam {
  id: string;
  name: string;
  color: string;
  captainId: string | null;
  playerIds: string[];
}

export interface WWWAnswer {
  teamId: string;
  captainId: string;
  answerText: string;
  submittedAt: number;
  isCorrect?: boolean;
}

export interface WWWChatMsg {
  userId: string;
  nickname: string;
  text: string;
  ts: number;
  /** Isolation channel: 'broadcast' (host → all) | 'team_a' | 'team_b'. */
  channel: string;
}

export interface WWWMatch {
  id: string;
  code: string;
  status: WWWStatus;
  hostId: string;
  players: Record<string, WWWPlayer>;
  settings: WWWSettings;
  teams: WWWTeam[];
  questions: WWWQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, WWWAnswer>; // teamId → answer
  scores: Record<string, number>;     // teamId → score
  timerEndsAt: number | null;
  voiceSessionId: string;
  chat: WWWChatMsg[];
  createdAt: number;
}

export interface WWWMatchPublic {
  id: string;
  code: string;
  status: WWWStatus;
  hostId: string;
  players: Record<string, WWWPlayer>;
  settings: WWWSettings;
  teams: WWWTeam[];
  currentQuestion: WWWQuestion | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  answers: Record<string, WWWAnswer>;
  scores: Record<string, number>;
  timerEndsAt: number | null;
  voiceSessionId: string;
  chat: WWWChatMsg[];
}

export interface WWWListItem {
  id: string;
  code: string;
  status: WWWStatus;
  playerCount: number;
  hostNickname: string;
  questionsCount: number;
}

// ── Question Bank (35 Georgian questions) ─────────────────────────────────
const QUESTIONS: WWWQuestion[] = [
  { id:'q01', category:'ფილოსოფია', difficulty:'easy', questionText:'რომელ ფილოსოფოსს ეკუთვნის გამოთქმა \"ვფიქრობ, მაშასადამე ვარსებობ\"?', correctAnswer:'რენე დეკარტი', explanation:'ლათ. \"Cogito, ergo sum\" — XVII ს. ფრანგი ფილოსოფოსი.' },
  { id:'q02', category:'ფილოსოფია', difficulty:'medium', questionText:'\"ნება ძალაა\" — ვის ფილოსოფიაში ცენტრალური ცნებაა?', correctAnswer:'ფრიდრიხ ნიცშე', explanation:'\"Wille zur Macht\" ნიცშეს მთავარი კონცეფციაა.' },
  { id:'q03', category:'ფილოსოფია', difficulty:'medium', questionText:'ვინ დაწერა \"კრიტიკა სუფთა გონებისა\"?', correctAnswer:'იმანუელ კანტი', explanation:'კანტის მთავარი ფილოსოფიური ნაშრომი, 1781 წ.' },
  { id:'q04', category:'ფილოსოფია', difficulty:'hard', questionText:'სოკრატეს სასწავლო მეთოდი, სადაც კითხვებით ეხმარება სტუდენტს ჭეშმარიტების \"გამოჩეკაში\", ეწოდება?', correctAnswer:'მაიევტიკა', explanation:'ბერძ. maieutikē — \"მეანობის ხელოვნება\".' },
  { id:'q05', category:'ფილოსოფია', difficulty:'easy', questionText:'ატომის თეორიის ფუძემდებელი ძველ საბერძნეთში?', correctAnswer:'დემოკრიტე', explanation:'ძვ.წ. V ს. ბერძენი ფილოსოფოსი.' },
  { id:'q06', category:'ისტორია', difficulty:'easy', questionText:'ვინ გახდა კოსმოსში პირველი ადამიანი?', correctAnswer:'იური გაგარინი', explanation:'1961 წლის 12 აპრილი — \"ვოსტოკ 1\"-ით.' },
  { id:'q07', category:'ისტორია', difficulty:'medium', questionText:'ვატერლოოს ბრძოლაში (1815) ვინ განიცადა საბოლოო მარცხი?', correctAnswer:'ნაპოლეონ ბონაპარტი', explanation:'ბრიტანეთ-პრუსიის ალიანსმა დაამარცხა.' },
  { id:'q08', category:'ისტორია', difficulty:'easy', questionText:'პირველი ოლიმპიური თამაშები ძველ საბერძნეთში სად ჩატარდა?', correctAnswer:'ოლიმპია', explanation:'ძვ.წ. 776 წ. — პელოპონესზე.' },
  { id:'q09', category:'ისტორია', difficulty:'hard', questionText:'ბაბილონი ვინ დაიპყრო ძვ.წ. 539 წელს?', correctAnswer:'კვიროს II (სპარსეთი)', explanation:'სპარსეთის მეფემ ბაბილონი სისხლისღვრის გარეშე დაიპყრო.' },
  { id:'q10', category:'ისტორია', difficulty:'medium', questionText:'რომელ წელს დაიწყო პირველი მსოფლიო ომი?', correctAnswer:'1914', explanation:'1914 წლის 28 ივლისი — ომის გამოცხადება.' },
  { id:'q11', category:'მეცნიერება', difficulty:'easy', questionText:'ოქროს ქიმიური სიმბოლო?', correctAnswer:'Au', explanation:'ლათ. Aurum — ატომური ნომერი 79.' },
  { id:'q12', category:'მეცნიერება', difficulty:'easy', questionText:'წყლის ქიმიური ფორმულა?', correctAnswer:'H₂O', explanation:'ორი წყალბადი და ერთი ჟანგბადი.' },
  { id:'q13', category:'მეცნიერება', difficulty:'medium', questionText:'DNA-ს ორმაგი სპირალი ვინ აღმოაჩინა?', correctAnswer:'უოტსონი და კრიკი', explanation:'1953 წელს ჯეიმს უოტსონმა და ფრენსის კრიკმა.' },
  { id:'q14', category:'მეცნიერება', difficulty:'medium', questionText:'სინათლის სიჩქარე ვაკუუმში (მიახ.)?', correctAnswer:'300 000 კმ/წმ', explanation:'ზუსტი: 299,792,458 მ/წმ.' },
  { id:'q15', category:'მეცნიერება', difficulty:'hard', questionText:'ატომური ნომერი 79 — რომელი ელემენტი?', correctAnswer:'ოქრო', explanation:'Au, ატომური მასა 196.97.' },
  { id:'q16', category:'კინო', difficulty:'easy', questionText:'\"ტიტანიკი\" (1997) ვინ გადაიღო?', correctAnswer:'ჯეიმს კემერონი', explanation:'11 ოსკარი, 1,84 მლრდ $ კასაში.' },
  { id:'q17', category:'კინო', difficulty:'medium', questionText:'\"ვარსკვლავური ომები\" (1977) ვინ გადაიღო?', correctAnswer:'ჯორჯ ლუკასი', explanation:'კოსმოსური ეპოსი.' },
  { id:'q18', category:'კინო', difficulty:'medium', questionText:'\"მატრიქსი\" (1999) ვინ გადაიღო?', correctAnswer:'ვაჩოვსკის დები', explanation:'ლანა და ლილი ვაჩოვსკი.' },
  { id:'q19', category:'კინო', difficulty:'hard', questionText:'რომელმა 3 ფილმმა 11 ოსკარი მოიგო?', correctAnswer:'ბენ-ჰური, ტიტანიკი, ბეჭდების მბრძანებელი', explanation:'სამივე ფილმმა 11 ოსკარი მოიგო.' },
  { id:'q20', category:'კინო', difficulty:'easy', questionText:'\"ლომი მეფე\" (1994) — ანიმაციური ფილმი ვის მიერ?', correctAnswer:'Disney', explanation:'ვოლტ დიზნიის კლასიკური ანიმაცია.' },
  { id:'q21', category:'ლიტერატურა', difficulty:'easy', questionText:'\"პატარა უფლისწული\" ვინ დაწერა?', correctAnswer:'ანტუან დე სენტ-ეგზიუპერი', explanation:'1943 წ. ფრანგი ავტორის შედევრი.' },
  { id:'q22', category:'ლიტერატურა', difficulty:'easy', questionText:'\"ომი და მშვიდობა\" ვინ დაწერა?', correctAnswer:'ლევ ტოლსტოი', explanation:'1869 წ. რუსი მწერლის ეპიკური რომანი.' },
  { id:'q23', category:'ლიტერატურა', difficulty:'easy', questionText:'\"ჰამლეტი\" ვინ დაწერა?', correctAnswer:'უილიამ შექსპირი', explanation:'ინგლისელი დრამატურგი, XVI-XVII სს.' },
  { id:'q24', category:'ლიტერატურა', difficulty:'medium', questionText:'\"კარამაზოვის ძმები\" ვინ დაწერა?', correctAnswer:'ფიოდორ დოსტოევსკი', explanation:'1880 წ. ფსიქოლოგიური შედევრი.' },
  { id:'q25', category:'ლიტერატურა', difficulty:'easy', questionText:'\"ვეფხისტყაოსანი\" ვინ დაწერა?', correctAnswer:'შოთა რუსთველი', explanation:'XII ს. ქართული პოეტური შედევრი.' },
  { id:'q26', category:'გეოგრაფია', difficulty:'easy', questionText:'მსოფლიოში ყველაზე დიდი ქვეყანა ფართობით?', correctAnswer:'რუსეთი', explanation:'17+ მლნ კვ.კმ.' },
  { id:'q27', category:'გეოგრაფია', difficulty:'easy', questionText:'ყველაზე მაღალი მთა მსოფლიოში?', correctAnswer:'ევერესტი', explanation:'8,849 მ, ჰიმალაი.' },
  { id:'q28', category:'გეოგრაფია', difficulty:'medium', questionText:'ყველაზე პატარა ქვეყანა მსოფლიოში?', correctAnswer:'ვატიკანი', explanation:'0.44 კვ.კმ, რომის შიგნით.' },
  { id:'q29', category:'გეოგრაფია', difficulty:'medium', questionText:'მსოფლიოს ყველაზე გრძელი მდინარე?', correctAnswer:'ნილოსი', explanation:'6,650 კმ, აფრიკა.' },
  { id:'q30', category:'ლოგიკა', difficulty:'easy', questionText:'თუ ყველა ადამიანი სიკვდილია, სოკრატე ადამიანია — მაშ სოკრატე...?', correctAnswer:'სიკვდილია', explanation:'კლასიკური სილოგიზმი.' },
  { id:'q31', category:'ლოგიკა', difficulty:'medium', questionText:'ნაგვის ყუთი 10 კვირაში ივსება. მე-9 კვირაზე რამდენი სავსეა?', correctAnswer:'ნახევარი', explanation:'თუ ორმაგი ზრდა — 9-ე კვირაზე ნახევარი.' },
  { id:'q32', category:'ლოგიკა', difficulty:'hard', questionText:'3 მეთევზე, თითოეულმა 3 თევზი დაიჭირა. სულ რამდენი?', correctAnswer:'9', explanation:'3 × 3 = 9.' },
  { id:'q33', category:'ზოგადი ცოდნა', difficulty:'easy', questionText:'ჩინეთის დიდი კედლის სიგრძე (დაახ.)?', correctAnswer:'21 000 კმ', explanation:'ყველა განშტოებებით.' },
  { id:'q34', category:'ზოგადი ცოდნა', difficulty:'easy', questionText:'FIFA World Cup რამდენ წელიწადში ერთხელ ჩატარდება?', correctAnswer:'4 წელიწადში', explanation:'1930 წლიდან.' },
  { id:'q35', category:'ზოგადი ცოდნა', difficulty:'medium', questionText:'სად არის ათენის ცნობილი პართენონი?', correctAnswer:'ათენი, საბერძნეთი (აკროპოლისი)', explanation:'ძვ.წ. 438 წ. ათენას საპატივად.' },
  { id:'q36', category:'ისტორია', difficulty:'medium', questionText:'რომელი ქართველი მეფის დროს იყო საქართველოს "ოქროს ხანა"?', correctAnswer:'დავით IV აღმაშენებელი / თამარ მეფე', explanation:'XI-XIII სს. — გაერთიანება და აღმავლობა.' },
  { id:'q37', category:'ისტორია', difficulty:'easy', questionText:'რომელ წელს დაემხო ბერლინის კედელი?', correctAnswer:'1989', explanation:'9 ნოემბერი, 1989.' },
  { id:'q38', category:'ისტორია', difficulty:'medium', questionText:'ვინ იყო ძველი ეგვიპტის ბოლო ფარაონი (დედოფალი)?', correctAnswer:'კლეოპატრა VII', explanation:'ძვ.წ. 30 წ.' },
  { id:'q39', category:'ისტორია', difficulty:'hard', questionText:'რომელ ქალაქში დაიდო "მაგნა კარტა" 1215 წელს?', correctAnswer:'რანიმიდი (ინგლისი)', explanation:'მეფე ჯონმა ხელი მოაწერა.' },
  { id:'q40', category:'მეცნიერება', difficulty:'easy', questionText:'რამდენი პლანეტაა მზის სისტემაში?', correctAnswer:'8', explanation:'პლუტონი 2006 წლიდან ჯუჯა პლანეტაა.' },
  { id:'q41', category:'მეცნიერება', difficulty:'medium', questionText:'ფარდობითობის თეორია ვინ შექმნა?', correctAnswer:'ალბერტ აინშტაინი', explanation:'სპეც. 1905, ზოგადი 1915.' },
  { id:'q42', category:'მეცნიერება', difficulty:'easy', questionText:'ადამიანის სხეულში ყველაზე დიდი ორგანო?', correctAnswer:'კანი', explanation:'ფართობით ~2 კვ.მ.' },
  { id:'q43', category:'მეცნიერება', difficulty:'medium', questionText:'რომელი გაზი შთანთქავს მცენარეს ფოტოსინთეზისას?', correctAnswer:'ნახშირორჟანგი (CO₂)', explanation:'გამოყოფს ჟანგბადს.' },
  { id:'q44', category:'მეცნიერება', difficulty:'hard', questionText:'რომელია ყველაზე მსუბუქი ქიმიური ელემენტი?', correctAnswer:'წყალბადი', explanation:'ატომური ნომერი 1.' },
  { id:'q45', category:'გეოგრაფია', difficulty:'easy', questionText:'საქართველოს დედაქალაქი?', correctAnswer:'თბილისი', explanation:'დაარსდა V საუკუნეში.' },
  { id:'q46', category:'გეოგრაფია', difficulty:'medium', questionText:'რომელი ოკეანე ყველაზე დიდია?', correctAnswer:'წყნარი ოკეანე', explanation:'დედამიწის ~1/3.' },
  { id:'q47', category:'გეოგრაფია', difficulty:'medium', questionText:'რომელი ქვეყანა აქვს ყველაზე მეტ მოსახლეობას?', correctAnswer:'ინდოეთი', explanation:'2023 წლიდან ჩინეთს გაუსწრო.' },
  { id:'q48', category:'გეოგრაფია', difficulty:'hard', questionText:'რომელ კონტინენტზეა უდაბნო სახარა?', correctAnswer:'აფრიკა', explanation:'ყველაზე დიდი ცხელი უდაბნო.' },
  { id:'q49', category:'ლიტერატურა', difficulty:'medium', questionText:'"დანაშაული და სასჯელი" ვინ დაწერა?', correctAnswer:'ფიოდორ დოსტოევსკი', explanation:'1866 წ.' },
  { id:'q50', category:'ლიტერატურა', difficulty:'medium', questionText:'"1984" (ანტიუტოპია) ვინ დაწერა?', correctAnswer:'ჯორჯ ორუელი', explanation:'1949 წ.' },
  { id:'q51', category:'ლიტერატურა', difficulty:'hard', questionText:'ილია ჭავჭავაძის "მგზავრის წერილები" რომელ მდინარეზე იწყება?', correctAnswer:'თერგი', explanation:'დარიალის ხეობა.' },
  { id:'q52', category:'ხელოვნება', difficulty:'easy', questionText:'"მონა ლიზა" ვინ დახატა?', correctAnswer:'ლეონარდო და ვინჩი', explanation:'ლუვრში ინახება.' },
  { id:'q53', category:'ხელოვნება', difficulty:'medium', questionText:'"ვარსკვლავური ღამე" ვის ეკუთვნის?', correctAnswer:'ვინსენტ ვან გოგი', explanation:'1889 წ.' },
  { id:'q54', category:'ხელოვნება', difficulty:'medium', questionText:'ცნობილი ქართველი მხატვარი, "პრიმიტივიზმის" ოსტატი?', correctAnswer:'ნიკო ფიროსმანი', explanation:'XIX-XX სს.' },
  { id:'q55', category:'სპორტი', difficulty:'easy', questionText:'რამდენი მოთამაშეა ფეხბურთის გუნდში მოედანზე?', correctAnswer:'11', explanation:'მეკარის ჩათვლით.' },
  { id:'q56', category:'სპორტი', difficulty:'medium', questionText:'შახმატში რომელი ფიგურა დგას მეფის გვერდით საწყის პოზიციაზე?', correctAnswer:'ლაზიერი (ეზო) / ვეზირი', explanation:'მეფის გვერდით — ვეზირი (დედოფალი).' },
  { id:'q57', category:'მუსიკა', difficulty:'medium', questionText:'"მეცხრე სიმფონია" (ოდა სიხარულს) ვინ შექმნა?', correctAnswer:'ლუდვიგ ვან ბეთჰოვენი', explanation:'1824 წ.' },
  { id:'q58', category:'ლოგიკა', difficulty:'medium', questionText:'რიცხვთა მწკრივი: 2, 4, 8, 16, ... — შემდეგი?', correctAnswer:'32', explanation:'ორზე გამრავლება.' },
  { id:'q59', category:'ლოგიკა', difficulty:'hard', questionText:'ექიმმა 3 აბი მოგცა, ყოველ ნახევარ საათში ერთი. რამდენ ხანში დალევ ყველას?', correctAnswer:'1 საათი', explanation:'0, 30, 60 წუთი.' },
  { id:'q60', category:'ზოგადი ცოდნა', difficulty:'easy', questionText:'ცისარტყელას რამდენი ფერი აქვს?', correctAnswer:'7', explanation:'წითელი-ნარინჯისფერი-ყვითელი-მწვანე-ცისფერი-ლურჯი-იისფერი.' },
  // ── გაფართოებული ბანკი (q61–q120) ──────────────────────────────────────
  { id:'q61', category:'ფილოსოფია', difficulty:'easy', questionText:'ვინ იყო პლატონის მასწავლებელი?', correctAnswer:'სოკრატე', explanation:'ძვ.წ. V ს. ათენელი ფილოსოფოსი.' },
  { id:'q62', category:'ფილოსოფია', difficulty:'medium', questionText:'\"ადამიანი ყველაფრის საზომია\" — ვის ეკუთვნის?', correctAnswer:'პროტაგორა', explanation:'ბერძენი სოფისტი, ძვ.წ. V ს.' },
  { id:'q63', category:'ფილოსოფია', difficulty:'medium', questionText:'\"საზოგადოებრივი ხელშეკრულების\" თეორია ვინ განავითარა?', correctAnswer:'ჟან-ჟაკ რუსო', explanation:'\"Du contrat social\", 1762 წ.' },
  { id:'q64', category:'ფილოსოფია', difficulty:'hard', questionText:'\"არსებობა წინ უსწრებს არსს\" — რომელი ფრანგი ეგზისტენციალისტის დებულებაა?', correctAnswer:'ჟან-პოლ სარტრი', explanation:'XX ს. ეგზისტენციალიზმის მთავარი ფიგურა.' },
  { id:'q65', category:'ფილოსოფია', difficulty:'easy', questionText:'ვინ იყო არისტოტელეს ცნობილი მოსწავლე, რომელიც დიდი მხედართმთავარი გახდა?', correctAnswer:'ალექსანდრე მაკედონელი', explanation:'ძვ.წ. IV ს. მაკედონიის მეფე.' },
  { id:'q66', category:'ისტორია', difficulty:'easy', questionText:'რომელ წელს დასრულდა მეორე მსოფლიო ომი?', correctAnswer:'1945', explanation:'2 სექტემბერი, 1945 — იაპონიის კაპიტულაცია.' },
  { id:'q67', category:'ისტორია', difficulty:'medium', questionText:'ვინ იყო აშშ-ის პირველი პრეზიდენტი?', correctAnswer:'ჯორჯ ვაშინგტონი', explanation:'1789–1797 წწ.' },
  { id:'q68', category:'ისტორია', difficulty:'medium', questionText:'რომელ წელს აღადგინა საქართველომ სახელმწიფო დამოუკიდებლობა (თანამედროვე)?', correctAnswer:'1991', explanation:'9 აპრილი, 1991.' },
  { id:'q69', category:'ისტორია', difficulty:'hard', questionText:'რომაული იმპერია საბოლოოდ დასავლეთ და აღმოსავლეთ ნაწილებად რომელ წელს გაიყო?', correctAnswer:'395', explanation:'იმპერატორ თეოდოსიუს I-ის სიკვდილის შემდეგ.' },
  { id:'q70', category:'ისტორია', difficulty:'easy', questionText:'ვინ მიაღწია ამერიკის კონტინენტს 1492 წელს?', correctAnswer:'ქრისტეფორე კოლუმბი', explanation:'ესპანეთის სახელით ატლანტიკა გადალახა.' },
  { id:'q71', category:'ისტორია', difficulty:'medium', questionText:'რომელი დინასტია მართავდა საფრანგეთს დიდ რევოლუციამდე?', correctAnswer:'ბურბონები', explanation:'ლუი XVI ბოლო მეფე იყო რევოლუციამდე.' },
  { id:'q72', category:'ისტორია', difficulty:'hard', questionText:'ბიზანტიის იმპერიის დედაქალაქი?', correctAnswer:'კონსტანტინოპოლი', explanation:'დღევანდელი სტამბოლი.' },
  { id:'q73', category:'ისტორია', difficulty:'medium', questionText:'ვინ იყო საბჭოთა კავშირის პირველი და უკანასკნელი პრეზიდენტი?', correctAnswer:'მიხეილ გორბაჩოვი', explanation:'1990–1991 წწ.' },
  { id:'q74', category:'მეცნიერება', difficulty:'easy', questionText:'დედამიწის ბუნებრივი თანამგზავრი?', correctAnswer:'მთვარე', explanation:'ერთადერთი ბუნებრივი თანამგზავრი.' },
  { id:'q75', category:'მეცნიერება', difficulty:'medium', questionText:'რომელი პლანეტაა მზესთან ყველაზე ახლოს?', correctAnswer:'მერკური', explanation:'მზის სისტემის ყველაზე პატარა პლანეტა.' },
  { id:'q76', category:'მეცნიერება', difficulty:'easy', questionText:'რამდენი ძვალია ზრდასრული ადამიანის სხეულში?', correctAnswer:'206', explanation:'ახალშობილს ~270 აქვს, ნაწილი ერწყმის.' },
  { id:'q77', category:'მეცნიერება', difficulty:'medium', questionText:'სისხლს წითელ ფერს რომელი ცილა აძლევს?', correctAnswer:'ჰემოგლობინი', explanation:'ჟანგბადს ატარებს, შეიცავს რკინას.' },
  { id:'q78', category:'მეცნიერება', difficulty:'hard', questionText:'ნიუტონის მეორე კანონი ფორმულით?', correctAnswer:'F = ma', explanation:'ძალა = მასა × აჩქარება.' },
  { id:'q79', category:'მეცნიერება', difficulty:'easy', questionText:'რომელი გაზი გვჭირდება სუნთქვისთვის?', correctAnswer:'ჟანგბადი (O₂)', explanation:'ატმოსფეროს ~21%.' },
  { id:'q80', category:'მეცნიერება', difficulty:'hard', questionText:'აბსოლუტური ნული ცელსიუსის შკალაზე?', correctAnswer:'-273.15 °C', explanation:'0 კელვინი.' },
  { id:'q81', category:'მეცნიერება', difficulty:'medium', questionText:'რომელ ორგანელას უწოდებენ უჯრედის \"ენერგოსადგურს\"?', correctAnswer:'მიტოქონდრია', explanation:'ATP-ს გამომუშავება.' },
  { id:'q82', category:'მეცნიერება', difficulty:'easy', questionText:'მზის სისტემის ყველაზე დიდი პლანეტა?', correctAnswer:'იუპიტერი', explanation:'გაზური გიგანტი.' },
  { id:'q83', category:'კინო', difficulty:'easy', questionText:'\"ჯურასიკ პარკი\" (1993) ვინ გადაიღო?', correctAnswer:'სტივენ სპილბერგი', explanation:'რომანის ეკრანიზაცია.' },
  { id:'q84', category:'კინო', difficulty:'medium', questionText:'\"ნათლია\" (The Godfather) ვინ დადგა?', correctAnswer:'ფრენსის ფორდ კოპოლა', explanation:'1972 წ., 3 ოსკარი.' },
  { id:'q85', category:'კინო', difficulty:'medium', questionText:'\"ინტერსტელარი\" და \"ინსეფშენი\" ვინ გადაიღო?', correctAnswer:'კრისტოფერ ნოლანი', explanation:'ბრიტანელი რეჟისორი.' },
  { id:'q86', category:'კინო', difficulty:'hard', questionText:'პირველი სრულმეტრაჟიანი ხმოვანი ფილმი?', correctAnswer:'\"ჯაზის მომღერალი\"', explanation:'The Jazz Singer, 1927 წ.' },
  { id:'q87', category:'კინო', difficulty:'easy', questionText:'Pixar-ის პირველი სრულმეტრაჟიანი ანიმაცია?', correctAnswer:'\"სათამაშოების ისტორია\"', explanation:'Toy Story, 1995 წ.' },
  { id:'q88', category:'ლიტერატურა', difficulty:'easy', questionText:'\"რომეო და ჯულიეტა\" ვინ დაწერა?', correctAnswer:'უილიამ შექსპირი', explanation:'ტრაგედია, ~1595 წ.' },
  { id:'q89', category:'ლიტერატურა', difficulty:'medium', questionText:'\"ოლივერ ტვისტი\" და \"დიდი იმედები\" ვინ დაწერა?', correctAnswer:'ჩარლზ დიკენსი', explanation:'ინგლისელი მწერალი, XIX ს.' },
  { id:'q90', category:'ლიტერატურა', difficulty:'medium', questionText:'\"ას წელი მარტოობისა\" ვინ დაწერა?', correctAnswer:'გაბრიელ გარსია მარკესი', explanation:'კოლუმბიელი, მაგიური რეალიზმი, 1967 წ.' },
  { id:'q91', category:'ლიტერატურა', difficulty:'hard', questionText:'ვაჟა-ფშაველას პოემა, სადაც მთავარი გმირი ქისტ მუცალს ცხედარს პატივს მიაგებს?', correctAnswer:'\"ალუდა ქეთელაური\"', explanation:'1888 წ.' },
  { id:'q92', category:'ლიტერატურა', difficulty:'easy', questionText:'ქართული დამწერლობის სამი სახეობიდან თანამედროვე რომელია?', correctAnswer:'მხედრული', explanation:'ასომთავრული და ნუსხური ისტორიულია.' },
  { id:'q93', category:'ლიტერატურა', difficulty:'medium', questionText:'\"ფაუსტი\" ვინ დაწერა?', correctAnswer:'იოჰან ვოლფგანგ გოეთე', explanation:'გერმანელი, XVIII-XIX სს.' },
  { id:'q94', category:'გეოგრაფია', difficulty:'easy', questionText:'იაპონიის დედაქალაქი?', correctAnswer:'ტოკიო', explanation:'მსოფლიოს ერთ-ერთი უდიდესი აგლომერაცია.' },
  { id:'q95', category:'გეოგრაფია', difficulty:'easy', questionText:'რომელ კონტინენტზეა ეგვიპტე?', correctAnswer:'აფრიკა', explanation:'სინაის ნახევარკუნძული აზიაშია.' },
  { id:'q96', category:'გეოგრაფია', difficulty:'hard', questionText:'მსოფლიოში ყველაზე ღრმა ტბა?', correctAnswer:'ბაიკალი', explanation:'~1,642 მ სიღრმე, რუსეთი.' },
  { id:'q97', category:'გეოგრაფია', difficulty:'medium', questionText:'რომელ ქვეყანას ეკუთვნის კუნძული ბალი?', correctAnswer:'ინდონეზია', explanation:'პოპულარული ტურისტული მიმართულება.' },
  { id:'q98', category:'გეოგრაფია', difficulty:'medium', questionText:'საქართველოს უმაღლესი მწვერვალი?', correctAnswer:'შხარა', explanation:'5,193 მ, კავკასიონი.' },
  { id:'q99', category:'გეოგრაფია', difficulty:'easy', questionText:'რომელი ზღვა ესაზღვრება საქართველოს დასავლეთით?', correctAnswer:'შავი ზღვა', explanation:'ბათუმი, ფოთი, სოხუმი — სანაპირო ქალაქები.' },
  { id:'q100', category:'გეოგრაფია', difficulty:'medium', questionText:'რომელი მდინარე გაივლის თბილისზე?', correctAnswer:'მტკვარი', explanation:'ჩაედინება კასპიის ზღვაში.' },
  { id:'q101', category:'გეოგრაფია', difficulty:'easy', questionText:'აშშ-ის დედაქალაქი?', correctAnswer:'ვაშინგტონი', explanation:'Washington, D.C.' },
  { id:'q102', category:'ლოგიკა', difficulty:'easy', questionText:'თუ დღეს ორშაბათია, 3 დღის შემდეგ რა დღეა?', correctAnswer:'ხუთშაბათი', explanation:'ორშ.→სამშ.→ოთხშ.→ხუთშ.' },
  { id:'q103', category:'ლოგიკა', difficulty:'medium', questionText:'მშობლის შვილი ვარ, მაგრამ ძმა არ ვარ. ვინ ვარ?', correctAnswer:'ქალიშვილი (და)', explanation:'ძმა კი არა — და.' },
  { id:'q104', category:'ლოგიკა', difficulty:'hard', questionText:'მწკრივი: 1, 1, 2, 3, 5, 8, ... — შემდეგი რიცხვი?', correctAnswer:'13', explanation:'ფიბონაჩის მიმდევრობა (8+5=13).' },
  { id:'q105', category:'ლოგიკა', difficulty:'hard', questionText:'5 მანქანა 5 ნაწილს 5 წუთში აწყობს. 100 მანქანა 100 ნაწილს რამდენ წუთში?', correctAnswer:'5 წუთი', explanation:'თითო მანქანა 5 წუთში 1 ნაწილს.' },
  { id:'q106', category:'ლოგიკა', difficulty:'easy', questionText:'რომელი უფრო მძიმეა: 1 კგ ბამბა თუ 1 კგ რკინა?', correctAnswer:'თანაბარი', explanation:'ორივე 1 კგ-ია.' },
  { id:'q107', category:'ზოგადი ცოდნა', difficulty:'easy', questionText:'კვირაში რამდენი დღეა?', correctAnswer:'7', explanation:'ორშაბათიდან კვირამდე.' },
  { id:'q108', category:'ზოგადი ცოდნა', difficulty:'medium', questionText:'რომელ ქვეყანაში წარმოიშვა ჩაი?', correctAnswer:'ჩინეთი', explanation:'ათასწლეულების ისტორია.' },
  { id:'q109', category:'ზოგადი ცოდნა', difficulty:'easy', questionText:'ევროზონის საერთო ვალუტა?', correctAnswer:'ევრო', explanation:'2002 წლიდან მიმოქცევაში.' },
  { id:'q110', category:'ზოგადი ცოდნა', difficulty:'medium', questionText:'\"მონა ლიზა\" რომელ მუზეუმშია დაცული?', correctAnswer:'ლუვრი (პარიზი)', explanation:'საფრანგეთი.' },
  { id:'q111', category:'ზოგადი ცოდნა', difficulty:'hard', questionText:'\"ნაკბეჩი ვაშლი\" რომელი კომპანიის ლოგოა?', correctAnswer:'Apple', explanation:'დააარსა სტივ ჯობსმა 1976 წ.' },
  { id:'q112', category:'ხელოვნება', difficulty:'easy', questionText:'ცნობილი მარმარილოს ქანდაკება \"დავითი\" ვინ შექმნა?', correctAnswer:'მიქელანჯელო', explanation:'1504 წ., ფლორენცია.' },
  { id:'q113', category:'ხელოვნება', difficulty:'medium', questionText:'კუბიზმის ფუძემდებელი, ესპანელი მხატვარი?', correctAnswer:'პაბლო პიკასო', explanation:'\"გერნიკას\" ავტორი.' },
  { id:'q114', category:'ხელოვნება', difficulty:'hard', questionText:'\"ყვირილი\" (The Scream) ვის ეკუთვნის?', correctAnswer:'ედვარდ მუნკი', explanation:'ნორვეგიელი მხატვარი, 1893 წ.' },
  { id:'q115', category:'სპორტი', difficulty:'easy', questionText:'ზაფხულის ოლიმპიური თამაშები რამდენ წელიწადში ერთხელ ტარდება?', correctAnswer:'4', explanation:'თანამედროვე თამაშები 1896 წლიდან.' },
  { id:'q116', category:'სპორტი', difficulty:'medium', questionText:'რამდენი მოთამაშეა საკალათბურთო გუნდში მოედანზე?', correctAnswer:'5', explanation:'თითო გუნდიდან 5.' },
  { id:'q117', category:'სპორტი', difficulty:'medium', questionText:'ტენისში წელიწადში რამდენი \"გრანდ სლემის\" ტურნირია?', correctAnswer:'4', explanation:'Australian Open, Roland Garros, Wimbledon, US Open.' },
  { id:'q118', category:'სპორტი', difficulty:'hard', questionText:'რომელ ქვეყანას აქვს ყველაზე მეტი ფეხბურთის მსოფლიო ჩემპიონობა?', correctAnswer:'ბრაზილია', explanation:'5-გზის ჩემპიონი.' },
  { id:'q119', category:'მუსიკა', difficulty:'easy', questionText:'რამდენი სიმია სტანდარტულ გიტარაზე?', correctAnswer:'6', explanation:'E-A-D-G-B-E.' },
  { id:'q120', category:'მუსიკა', difficulty:'medium', questionText:'\"წელიწადის ოთხი დრო\" (The Four Seasons) ვინ შექმნა?', correctAnswer:'ანტონიო ვივალდი', explanation:'იტალიელი ბაროკოს კომპოზიტორი.' },
];

// ── In-memory state ────────────────────────────────────────────────────────
const matches = new Map<string, WWWMatch>();
const userMatch = new Map<string, string>(); // userId → matchId

function code6(): string { return randomBytes(3).toString('hex').toUpperCase(); }

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** First team to this many points wins. */
export const WWW_WIN_SCORE = 10;

export function toPublic(m: WWWMatch, viewerId?: string): WWWMatchPublic {
  const q = m.questions[m.currentQuestionIndex] ?? null;
  const showQuestion = m.status !== 'waiting' && m.status !== 'finished';
  // Isolation protocol: while teams are still thinking/being judged, only the
  // host sees every submitted answer; a team member sees ONLY their own team's
  // answer (never the opponent's). Answers are revealed to all once the round
  // result is shown or the game ends.
  const revealed = m.status === 'round_result' || m.status === 'finished';
  const isHost = viewerId != null && viewerId === m.hostId;
  const viewerTeam = viewerId != null ? m.players[viewerId]?.teamId : undefined;
  let answers = m.answers;
  if (!revealed && !isHost) {
    answers = viewerTeam && m.answers[viewerTeam] ? { [viewerTeam]: m.answers[viewerTeam]! } : {};
  }
  // Chat isolation: host sees every channel; a team member sees broadcasts +
  // only their own team's channel; a spectator sees broadcasts.
  const chat = (isHost
    ? m.chat
    : m.chat.filter(c => c.channel === 'broadcast' || (viewerTeam != null && c.channel === viewerTeam))
  ).slice(-60);
  return {
    id: m.id, code: m.code, status: m.status, hostId: m.hostId,
    players: m.players, settings: m.settings, teams: m.teams,
    currentQuestion: showQuestion ? q : null,
    currentQuestionIndex: m.currentQuestionIndex,
    totalQuestions: m.questions.length,
    answers, scores: m.scores,
    timerEndsAt: m.timerEndsAt, voiceSessionId: m.voiceSessionId,
    chat,
  };
}

const TEAM_COLORS = ['#ff2244', '#0090ff', '#22c55e', '#f59e0b'];
const TEAM_NAMES  = ['გუნდი A', 'გუნდი B', 'გუნდი C', 'გუნდი D'];

export function createMatch(hostId: string, nickname: string, opts: Partial<WWWSettings> = {}): WWWMatch {
  const id = randomBytes(8).toString('hex');
  const settings: WWWSettings = {
    maxTeams: 2, maxPlayersPerTeam: 6, questionsCount: 10,
    discussionSeconds: 60, spectatorsAllowed: true, ...opts,
  };
  const teams: WWWTeam[] = [
    { id: 'team_a', name: TEAM_NAMES[0]!, color: TEAM_COLORS[0]!, captainId: null, playerIds: [] },
    { id: 'team_b', name: TEAM_NAMES[1]!, color: TEAM_COLORS[1]!, captainId: null, playerIds: [] },
  ];
  const scores: Record<string, number> = { team_a: 0, team_b: 0 };
  const m: WWWMatch = {
    id, code: code6(), status: 'waiting', hostId,
    // The creator is the HOST / moderator — not on any team (teamId null,
    // not a spectator). Participants pick Team A or Team B in the lobby.
    players: { [hostId]: { userId: hostId, nickname, teamId: null, isCaptain: false, isSpectator: false, connected: true } },
    settings, teams, questions: [],
    currentQuestionIndex: 0, answers: {}, scores,
    timerEndsAt: null, voiceSessionId: randomBytes(6).toString('hex'),
    chat: [], createdAt: Date.now(),
  };
  matches.set(id, m);
  userMatch.set(hostId, id);
  setTimeout(() => matches.delete(id), 2 * 60 * 60 * 1000);
  return m;
}

export function getMatch(id: string): WWWMatch | null { return matches.get(id) ?? null; }
export function getMatchByCode(code: string): WWWMatch | null {
  for (const m of matches.values()) if (m.code === code.toUpperCase()) return m;
  return null;
}
export function getMatchIdForUser(userId: string): string | null { return userMatch.get(userId) ?? null; }

export function listMatches(): WWWListItem[] {
  return [...matches.values()]
    .filter(m => m.status !== 'finished')
    .map(m => ({
      id: m.id, code: m.code, status: m.status,
      playerCount: Object.values(m.players).filter(p => !p.isSpectator).length,
      hostNickname: m.players[m.hostId]?.nickname ?? 'Host',
      questionsCount: m.settings.questionsCount,
    }));
}

export function joinMatch(matchId: string, userId: string, nickname: string): { match: WWWMatch; isNew: boolean } | null {
  const m = matches.get(matchId);
  if (!m) return null;
  if (m.players[userId]) {
    m.players[userId]!.connected = true;
    userMatch.set(userId, matchId);
    return { match: m, isNew: false };
  }
  if (m.status !== 'waiting') return null;

  // Auto-assign to team with fewer players
  let targetTeam = m.teams.reduce((a, b) => a.playerIds.length <= b.playerIds.length ? a : b);
  m.players[userId] = { userId, nickname, teamId: targetTeam.id, isCaptain: !targetTeam.captainId, isSpectator: false, connected: true };
  if (!targetTeam.captainId) targetTeam.captainId = userId;
  targetTeam.playerIds.push(userId);
  userMatch.set(userId, matchId);
  return { match: m, isNew: true };
}

export function spectateMatch(matchId: string, userId: string, nickname: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || !m.settings.spectatorsAllowed) return null;
  if (!m.players[userId]) {
    m.players[userId] = { userId, nickname, teamId: null, isCaptain: false, isSpectator: true, connected: true };
  } else {
    m.players[userId]!.connected = true;
  }
  userMatch.set(userId, matchId);
  return m;
}

export function leaveMatch(matchId: string, userId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  const player = m.players[userId];
  if (player) {
    player.connected = false;
    if (!player.isSpectator && player.teamId) {
      const team = m.teams.find(t => t.id === player.teamId);
      if (team) {
        team.playerIds = team.playerIds.filter(id => id !== userId);
        if (team.captainId === userId) {
          team.captainId = team.playerIds[0] ?? null;
          if (team.captainId && m.players[team.captainId]) {
            m.players[team.captainId]!.isCaptain = true;
          }
        }
      }
    }
  }
  userMatch.delete(userId);
  // The host IS the game here — they read the questions. Passing the room to
  // whoever was standing nearest left rooms open that nobody was running.
  if (userId === m.hostId) {
    m.status = 'finished';
    for (const p of Object.values(m.players)) userMatch.delete(p.userId);
    return m;
  }
  return m;
}

export function assignCaptain(matchId: string, hostId: string, teamId: string, newCaptainId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId) return null;
  const team = m.teams.find(t => t.id === teamId);
  if (!team || !team.playerIds.includes(newCaptainId)) return null;
  if (team.captainId && m.players[team.captainId]) m.players[team.captainId]!.isCaptain = false;
  team.captainId = newCaptainId;
  if (m.players[newCaptainId]) m.players[newCaptainId]!.isCaptain = true;
  return m;
}

/** Lobby role assignment: a participant picks Team A, Team B, or spectator.
 *  The host stays the moderator (cannot join a team). */
export function setRole(matchId: string, userId: string, role: 'team_a' | 'team_b' | 'spectator'): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'waiting') return null;
  if (userId === m.hostId) return null; // the host is the moderator, not a team member
  const player = m.players[userId];
  if (!player) return null;

  // Remove from the current team (reassign captaincy if they were the captain).
  if (player.teamId) {
    const cur = m.teams.find(t => t.id === player.teamId);
    if (cur) {
      cur.playerIds = cur.playerIds.filter(id => id !== userId);
      if (cur.captainId === userId) {
        cur.captainId = cur.playerIds[0] ?? null;
        if (cur.captainId && m.players[cur.captainId]) m.players[cur.captainId]!.isCaptain = true;
      }
    }
  }
  player.isCaptain = false;

  if (role === 'spectator') {
    player.teamId = null;
    player.isSpectator = true;
    return m;
  }
  const team = m.teams.find(t => t.id === role);
  if (!team) return null;
  player.teamId = role;
  player.isSpectator = false;
  team.playerIds.push(userId);
  if (!team.captainId) { team.captainId = userId; player.isCaptain = true; }
  return m;
}

/** Host picks the game length in the lobby: 10 or 15 questions. */
export function setQuestionCount(matchId: string, hostId: string, count: number): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId || m.status !== 'waiting') return null;
  m.settings.questionsCount = count === 15 ? 15 : 10;
  return m;
}

export function startMatch(matchId: string, hostId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId || m.status !== 'waiting') return null;
  // Both teams need at least one player (host is the moderator, not a team).
  if (m.teams.some(t => t.playerIds.length === 0)) return null;
  // Ensure each team has a captain
  for (const team of m.teams) {
    if (team.playerIds.length > 0 && !team.captainId) {
      team.captainId = team.playerIds[0]!;
      if (m.players[team.captainId]) m.players[team.captainId]!.isCaptain = true;
    }
  }
  // Fixed-length game: the host-chosen number of questions (10 or 15), drawn
  // randomly from the (large) pool so rounds rarely repeat.
  const count = m.settings.questionsCount === 15 ? 15 : 10;
  m.questions = shuffle([...QUESTIONS]).slice(0, Math.min(count, QUESTIONS.length));
  m.currentQuestionIndex = 0;
  m.answers = {};
  m.status = 'question';
  return m;
}

export function advanceToDiscussion(matchId: string, hostId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId || m.status !== 'question') return null;
  m.status = 'discussion';
  m.timerEndsAt = Date.now() + m.settings.discussionSeconds * 1000;
  m.answers = {};
  return m;
}

export function submitAnswer(matchId: string, userId: string, answerText: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'discussion') return null;
  const player = m.players[userId];
  if (!player || !player.isCaptain || !player.teamId) return null;
  m.answers[player.teamId] = {
    teamId: player.teamId, captainId: userId,
    answerText: answerText.trim().slice(0, 200), submittedAt: Date.now(),
  };
  // Auto-advance to judging if all active teams submitted
  const activeTeams = m.teams.filter(t => t.playerIds.length > 0);
  if (activeTeams.every(t => m.answers[t.id])) {
    m.status = 'judging';
    m.timerEndsAt = null;
  }
  return m;
}

export function judgeAnswer(matchId: string, hostId: string, teamId: string, isCorrect: boolean): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId) return null;
  if (m.status !== 'judging' && m.status !== 'discussion') return null;
  const answer = m.answers[teamId];
  if (!answer) return null;
  // Guard: already judged — do not double-apply
  if (answer.isCorrect !== undefined) return null;
  // Only update this specific team's answer
  answer.isCorrect = isCorrect;
  // Score increment only happens once (guarded above)
  if (isCorrect) m.scores[teamId] = (m.scores[teamId] ?? 0) + 1;
  // Check if all submitted answers are judged
  const judged = Object.values(m.answers).filter(a => a.isCorrect !== undefined).length;
  const total = Object.values(m.answers).length;
  if (judged >= total && total > 0) {
    m.status = 'round_result';
    m.timerEndsAt = null;
  }
  return m;
}

export function autoAdvanceToJudging(matchId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.status !== 'discussion') return null;
  // Fill missing answers for teams that didn't submit
  for (const team of m.teams) {
    if (team.playerIds.length > 0 && !m.answers[team.id]) {
      m.answers[team.id] = {
        teamId: team.id,
        captainId: team.captainId ?? '',
        answerText: '',
        submittedAt: Date.now(),
        isCorrect: undefined,
      };
    }
  }
  m.status = 'judging';
  m.timerEndsAt = null;
  return m;
}

export function nextQuestion(matchId: string, hostId: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m || m.hostId !== hostId || m.status !== 'round_result') return null;
  m.currentQuestionIndex += 1;
  m.answers = {};
  m.timerEndsAt = null;
  m.status = m.currentQuestionIndex >= m.questions.length ? 'finished' : 'question';
  return m;
}

export function sendChat(matchId: string, userId: string, nickname: string, text: string): WWWMatch | null {
  const m = matches.get(matchId);
  if (!m) return null;
  // Channel: the host (and team-less spectators) broadcast to everyone; a team
  // member's message stays inside that team's isolated channel.
  const player = m.players[userId];
  const channel = userId === m.hostId || !player?.teamId ? 'broadcast' : player.teamId;
  m.chat.push({ userId, nickname, text: text.slice(0, 300), ts: Date.now(), channel });
  if (m.chat.length > 200) m.chat = m.chat.slice(-200);
  return m;
}

export function disconnectUser(userId: string): string | null {
  const matchId = userMatch.get(userId);
  if (!matchId) return null;
  const m = matches.get(matchId);
  if (m?.players[userId]) m.players[userId]!.connected = false;
  userMatch.delete(userId);
  return matchId;
}
