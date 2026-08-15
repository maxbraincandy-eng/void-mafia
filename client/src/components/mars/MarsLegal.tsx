/**
 * Terms and privacy policy for M.A.R.S.
 *
 * WRITTEN FOR THIS PRODUCT, NOT COPIED FROM A GENERATOR
 * ────────────────────────────────────────────────────
 * The unusual things this service does are exactly the things a generic
 * template does not cover, and they are the ones that matter: it stores records
 * about DECEASED people created by THIRD PARTIES, it registers the existence of
 * biological samples without ever receiving them, and it lets strangers add
 * text to a page about someone else's relative.
 *
 * Every one of those is addressed here in plain Georgian, with the legal basis
 * named where there is one.
 *
 * THIS IS A DRAFT FOR A LAWYER TO REVIEW. It is written carefully and honestly,
 * but I am not qualified to certify compliance with the Georgian Law on
 * Personal Data Protection or the GDPR, and the page says so to the reader as
 * well as here in the source. The company details are placeholders that must be
 * filled in before this is relied upon.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

type Doc = 'terms' | 'privacy';

/** Fill these in before publishing — a policy with no controller named is not a policy. */
const OPERATOR = {
  name: '[ოპერატორის სახელი / კომპანია]',
  email: '[საკონტაქტო ელფოსტა]',
  address: '[მისამართი]',
};

const UPDATED = '2026-08-15';

export function MarsLegal({ initial = 'terms', onClose }: { initial?: Doc; onClose: () => void }) {
  const [doc, setDoc] = useState<Doc>(initial);

  // Portalled to <body>: this opens from the landing page, from the sign-in
  // card and from inside the console — all of which sit under framer-motion
  // ancestors that carry a transform, and a transformed ancestor makes
  // `position: fixed` resolve against IT instead of the viewport.
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[2147483001] flex items-end sm:items-center justify-center p-3"
      style={{ background: 'rgba(0,6,3,0.9)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 24 }} animate={{ y: 0 }} exit={{ y: 16, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl p-4 overflow-y-auto"
        style={{
          maxHeight: '90dvh',
          border: '1px solid rgba(57,255,106,0.3)',
          background: 'linear-gradient(165deg, #04140c, #010806)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex gap-1.5">
            {([['terms', 'წესები'], ['privacy', 'კონფიდენციალურობა']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setDoc(id)}
                className="px-3 py-1.5 rounded-lg font-mono text-[12px] transition-all"
                style={{
                  border: `1px solid rgba(57,255,106,${doc === id ? 0.5 : 0.15})`,
                  background: doc === id ? 'rgba(57,255,106,0.12)' : 'transparent',
                  color: doc === id ? '#39ff6a' : 'rgba(255,255,255,0.45)',
                }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-auto font-mono text-[12px] px-2 py-1 rounded"
            style={{ border: '1px solid rgba(57,255,106,0.22)', color: 'rgba(57,255,106,0.7)' }}>✕</button>
        </div>

        <div className="font-mono text-[12px] leading-relaxed" style={{ color: 'rgba(230,255,240,0.8)' }}>
          {doc === 'terms' ? <Terms /> : <Privacy />}
        </div>

        <p className="font-mono text-[10px] mt-5 pt-3 text-center"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.28)' }}>
          ბოლო განახლება: {UPDATED}
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display font-bold text-[14px] mt-5 mb-1.5" style={{ color: '#39ff6a' }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-2">{children}</p>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-2.5 my-3"
      style={{ border: '1px solid rgba(255,212,90,0.3)', background: 'rgba(255,212,90,0.06)' }}>
      <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,212,90,0.9)' }}>{children}</p>
    </div>
  );
}

function Draft() {
  return (
    <Warn>
      <b>სამუშაო ვერსია.</b> ეს დოკუმენტი გულწრფელად და ყურადღებით არის დაწერილი, მაგრამ
      იურისტს არ განუხილავს. სანამ პროექტი რეალურ მომხმარებლებს მიიღებს, ის უნდა შეამოწმოს
      პერსონალურ მონაცემთა დაცვის სპეციალისტმა. ოპერატორის რეკვიზიტები ჯერ შევსებული არ არის.
    </Warn>
  );
}

function Terms() {
  return (
    <>
      <p className="font-display font-bold text-[16px] text-white mb-1">M.A.R.S. — მომსახურების წესები</p>
      <Draft />

      <H>1. რა არის M.A.R.S.</H>
      <P>
        M.A.R.S. არის ციფრული არქივი. მასში ინახება ტექსტი, ფოტოები, დოკუმენტები და მოგონებები —
        როგორც ცოცხალი ადამიანების შესახებ, რომლებიც თავად ქმნიან ჩანაწერს, ისე გარდაცვლილების
        შესახებ, რომელთა ჩანაწერსაც ახლობლები ქმნიან.
      </P>

      <H>2. რას არ ვაკეთებთ</H>
      <P>
        M.A.R.S. <b>არ არის</b> სამედიცინო, ბიოტექნოლოგიური ან სამემკვიდრეო მომსახურება.
        ჩვენ არ ვიღებთ, არ ვინახავთ და არ ვამუშავებთ ბიოლოგიურ მასალას. სისტემა მხოლოდ
        <b> აღრიცხავს</b> მომხმარებლის განცხადებას იმის შესახებ, რომ ნიმუში არსებობს და სად ინახება.
        ნიმუში მთლიანად მომხმარებლის პასუხისმგებლობაშია.
      </P>
      <P>
        არავითარი დაპირება არ არსებობს ცნობიერების აღდგენის, გაციფრულების ან ბიოლოგიური
        აღდგენის შესახებ. ასეთი ტექნოლოგია დღეს არ არსებობს და ჩვენ მას არ ვთავაზობთ.
      </P>

      <H>3. ანგარიში</H>
      <P>
        ანგარიშის შესაქმნელად საჭიროა ელფოსტა და პაროლი. ანგარიშის უსაფრთხოებაზე პასუხისმგებელი
        ხარ შენ. აღდგენის კოდი გაიცემა ერთხელ — შეინახე ის, რადგან მისი დაკარგვა ნიშნავს
        ანგარიშზე წვდომის დაკარგვას.
      </P>

      <H>4. ჩანაწერი სხვა ადამიანზე</H>
      <P>
        გარდაცვლილზე ჩანაწერის შექმნით შენ ადასტურებ, რომ:
      </P>
      <P>
        ა) ინფორმაცია, რომელსაც შეიტან, შენი უკეთესი ცოდნით სწორია;<br />
        ბ) გაქვს გონივრული საფუძველი, რომ ეს ჩანაწერი შექმნა — ხარ ნათესავი, ახლობელი
        ან სხვაგვარად დაკავშირებული პირი;<br />
        გ) გესმის, რომ ჩანაწერი საჯარო იქნება.
      </P>
      <Warn>
        <b>ცოცხალ ადამიანზე ყალბი ჩანაწერის შექმნა აკრძალულია.</b> ასეთი ჩანაწერი დაუყოვნებლივ
        იფარება და ანგარიში შეიძლება დაიბლოკოს. თუ დაინახე, რომ ვინმეზე ყალბი ჩანაწერია
        შექმნილი, გამოიყენე „პრობლემის შეტყობინება".
      </Warn>

      <H>5. შენი კონტენტი</H>
      <P>
        შენ ინარჩუნებ ყველა უფლებას იმაზე, რასაც ატვირთავ. გვაძლევ მხოლოდ იმ უფლებას, რაც
        მომსახურების გასაწევადაა საჭირო: ჩანაწერის შენახვა, ჩვენება და გადაცემა შენი
        მითითებისამებრ. ჩვენ არ ვყიდით და არ ვაძლევთ მესამე პირებს შენს მონაცემებს.
      </P>

      <H>6. აკრძალული ქცევა</H>
      <P>
        აკრძალულია: სხვისი პერსონალური მონაცემების უნებართვო გამოქვეყნება; შეურაცხმყოფელი,
        დისკრიმინაციული ან მუქარის შემცველი შიგთავსი; გარდაცვლილის ან მისი ოჯახის ღირსების
        შელახვა; სისტემის ავტომატიზებული ბოროტად გამოყენება.
      </P>

      <H>7. მოდერაცია</H>
      <P>
        ჩანაწერები ქვეყნდება მაშინვე. ჩვენ ვიტოვებთ უფლებას, დავფაროთ ან წავშალოთ ჩანაწერი,
        რომელიც არღვევს ამ წესებს. დაფარვა არ ნიშნავს მონაცემების განადგურებას — ჩანაწერი
        აღდგენადია, სანამ მფლობელი მის სრულ წაშლას არ მოითხოვს.
      </P>

      <H>8. მომსახურების ხელმისაწვდომობა</H>
      <P>
        მომსახურება მოწოდებულია „როგორც არის". ჩვენ ვცდილობთ მისი უწყვეტობის უზრუნველყოფას,
        მაგრამ არ ვიძლევით გარანტიას უსასრულო ხელმისაწვდომობაზე.
      </P>
      <Warn>
        სწორედ ამიტომ არსებობს <b>ექსპორტი</b>. ჩამოტვირთე შენი ჩანაწერი და შეინახე ასლი
        შენთან. ეს ერთადერთი გარანტიაა, რომელიც არავითარ სერვერზე არ არის დამოკიდებული.
      </Warn>

      <H>9. ცვლილებები</H>
      <P>
        წესების ცვლილებისას განახლების თარიღი შეიცვლება. არსებითი ცვლილების შემთხვევაში
        შეგატყობინებთ.
      </P>

      <H>10. კონტაქტი</H>
      <P>{OPERATOR.name} · {OPERATOR.email} · {OPERATOR.address}</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p className="font-display font-bold text-[16px] text-white mb-1">კონფიდენციალურობის პოლიტიკა</p>
      <Draft />

      <H>1. ვინ ამუშავებს მონაცემებს</H>
      <P>
        მონაცემთა დამმუშავებელი: {OPERATOR.name}. კონტაქტი: {OPERATOR.email}.
      </P>

      <H>2. რა მონაცემებს ვაგროვებთ</H>
      <P>
        <b>ანგარიშის მონაცემები:</b> ელფოსტა, მომხმარებლის სახელი, პაროლის ჰეში,
        აღდგენის კოდის ჰეში. პაროლი და აღდგენის კოდი ღია სახით არსად ინახება.
      </P>
      <P>
        <b>ჩანაწერის მონაცემები:</b> ტექსტი, ფოტო, დოკუმენტები, სახელი და გვარი,
        დაბადებისა და გარდაცვალების წელი, ნათესაური კავშირი, საკონტაქტო პირი,
        ბიოლოგიური ნიმუშის სტატუსი და მისი შენახვის ადგილის აღწერა.
      </P>
      <P>
        <b>ტექნიკური მონაცემები:</b> სესიის იდენტიფიკატორი, მოქმედების დროის ნიშნულები.
      </P>

      <H>3. სამართლებრივი საფუძველი</H>
      <P>
        საკუთარი ჩანაწერისთვის — შენი <b>თანხმობა</b> და მომსახურების გაწევის აუცილებლობა.
        გარდაცვლილზე ჩანაწერისთვის — ჩანაწერის შემქმნელის <b>ლეგიტიმური ინტერესი</b>
        ხსოვნის შენახვაში. მოდერაციისა და უსაფრთხოებისთვის — ჩვენი ლეგიტიმური ინტერესი
        სისტემის ბოროტად გამოყენების აღკვეთაში.
      </P>
      <Warn>
        GDPR არ ვრცელდება გარდაცვლილ პირებზე, თუმცა ევროკავშირის ცალკეულ ქვეყნებს აქვთ
        დამატებითი ეროვნული რეგულაცია. საქართველოს კანონმდებლობით გარდაცვლილის მონაცემების
        დამუშავებას სპეციალური რეჟიმი აქვს. <b>ეს პუნქტი აუცილებლად უნდა შეამოწმოს იურისტმა.</b>
      </Warn>

      <H>4. ვინ რას ხედავს</H>
      <P>
        <b>საჯაროა:</b> კოდი, სახელი, ფოტო, სექტორი, გარდაცვლილის შემთხვევაში წლები,
        გარდაცვლილის ჩანაწერის ტექსტი, მოგონებები, ნიმუშის არსებობის ფაქტი (და არა ადგილი).
      </P>
      <P>
        <b>მხოლოდ მფლობელი ხედავს:</b> წერილს მომავლისთვის, მითითებებს, საკონტაქტო პირს,
        ნიმუშის შენახვის ადგილს, ატვირთულ დოკუმენტებს, და ცოცხალი ადამიანის საკუთარი
        ჩანაწერის ტექსტს.
      </P>

      <H>5. შენახვის ვადა</H>
      <P>
        ჩანაწერი ინახება უვადოდ — ეს არქივის დანიშნულებაა. მონაცემები იშლება, როცა
        მფლობელი წაშლას მოითხოვს. მოდერაციის ჟურნალი ინახება უსაფრთხოების მიზნით.
      </P>

      <H>6. შენი უფლებები</H>
      <P>
        გაქვს უფლება: მიიღო შენი მონაცემების ასლი (გამოიყენე <b>ექსპორტი</b>);
        შეასწორო ისინი (რედაქტირება); წაშალო ჩანაწერი; გამოითხოვო თანხმობა;
        და საჩივრით მიმართო პერსონალურ მონაცემთა დაცვის სამსახურს.
      </P>
      <P>
        თუ ჩანაწერი შენს გარდაცვლილ ახლობელზეა და შენ არ ხარ მისი შემქმნელი, მაგრამ ოჯახის
        წევრი ხარ — მოგვმართე {OPERATOR.email}-ზე.
      </P>

      <H>7. უსაფრთხოება</H>
      <P>
        პაროლები და აღდგენის კოდები ინახება bcrypt ჰეშის სახით. კავშირი დაშიფრულია.
        პირად ველებზე წვდომა სერვერზე მოწმდება ველ-ველად და არა ინტერფეისში.
      </P>

      <H>8. მესამე პირები</H>
      <P>
        მონაცემები ინახება ჰოსტინგ-პროვაიდერის სერვერებზე. ჩვენ არ ვყიდით მონაცემებს და
        არ ვიყენებთ სარეკლამო მიზნებისთვის.
      </P>

      <H>9. ბავშვები</H>
      <P>
        ანგარიშის შექმნა დაშვებულია 16 წლიდან. გარდაცვლილ ბავშვზე ჩანაწერის შექმნა
        შეუძლია ოჯახის წევრს.
      </P>

      <H>10. კონტაქტი</H>
      <P>{OPERATOR.name} · {OPERATOR.email} · {OPERATOR.address}</P>
    </>
  );
}
