# Void Mafia — გამოშვების გზამკვლევი (Play Store + App Store)

ეს დოკუმენტი აღწერს რა არის **უკვე გაკეთებული** კოდის მხარეს და რა ნაბიჯებია
დარჩენილი, რომ აპლიკაცია რეალურად ატვირთო მაღაზიებში.

---

## 0. მიმდინარე მდგომარეობა

| ნაწილი | სტატუსი |
|--------|---------|
| Capacitor shell (Android + iOS) | ✅ დაყენებული (`client/capacitor.config.ts`) |
| APK ტვირთავს live საიტს `https://voidmafia.one` | ✅ — ვებ-განახლება ავტომატურად ჩანს, ახალი APK არ სჭირდება |
| Permissions: კამერა, მიკროფონი, Bluetooth | ✅ `AndroidManifest.xml` |
| WebRTC `getUserMedia` grant + audio autoplay | ✅ `MainActivity.java` |
| ScreenSecurity bridge (VOID IQ) | ✅ |
| ბრენდირებული app icon (ყველა density) | ✅ |
| targetSdk 36 (Play-ის მოთხოვნა) | ✅ |
| **Release signing config** | ✅ ახლა დაემატა (`keystore.properties`) |
| **AAB build script** (`npm run android:aab`) | ✅ ახლა დაემატა |
| Upload keystore | ⛔ **შენ უნდა შექმნა** |
| Google Play Console ანგარიში ($25) | ⛔ **შენ** |
| Store listing (screenshots, აღწერა, privacy policy) | ⛔ **შენ** |
| გადახდები (IAP) | ⛔ ცალკე ეტაპი — იხ. ქვემოთ |

**მთავარი დასკვნა:** Android-ის ტექნიკური შეფუთვა პრაქტიკულად მზადაა.
დარჩენილია ანგარიშები/keystore/listing (შენი მხარე) და გადახდები (ცალკე ეტაპი).

---

## 1. Upload keystore-ის შექმნა (ერთჯერადი — შენ)

⚠️ ეს ფაილი და პაროლები **სამუდამოდ** უნდა შეინახო. თუ დაკარგავ, ვეღარასოდეს
განაახლებ აპს Play-ზე იმავე იდენტობით.

```bash
cd client/android
keytool -genkey -v -keystore void-mafia-upload.jks \
  -alias void-mafia -keyalg RSA -keysize 2048 -validity 10000
```

შემდეგ შექმენი `android/keystore.properties` (იხ. `keystore.properties.example`):

```
storeFile=void-mafia-upload.jks
storePassword=<შენი პაროლი>
keyAlias=void-mafia
keyPassword=<შენი პაროლი>
```

ორივე ფაილი (`*.jks`, `keystore.properties`) git-ით იგნორირებულია.

---

## 2. Play-ისთვის ხელმოწერილი AAB-ის აწყობა

Google Play ითხოვს **Android App Bundle (.aab)**, არა APK.

```bash
cd client
npm run android:aab
```

გამოსავალი: `client/android/app/build/outputs/bundle/release/app-release.aab`

> საჭიროა Android SDK + Java 17/21 build მანქანაზე (Android Studio ავტომატურად
> აყენებს). ამ session-ის კონტეინერში SDK არ არის, ამიტომ build ლოკალურად ან
> CI-ზე უნდა გაეშვას.

---

## 3. Google Play Console (შენ)

1. დარეგისტრირდი — https://play.google.com/console (ერთჯერადი $25)
2. Create app → შეავსე listing: სახელი, აღწერა, კატეგორია
3. ატვირთე ასეტები: icon 512×512, feature graphic 1024×500, screenshots (≥2 phone)
4. **Privacy Policy URL** — სავალდებულო (კამერა/მიკ + ანგარიშები იყენებ)
5. Data safety ფორმა — რა მონაცემებს აგროვებ
6. Content rating კითხვარი
7. ატვირთე `.aab` → Internal testing → შემდეგ Production

⚠️ ახალ დეველოპერებს Google ითხოვს **20 ტესტერს 14 დღე** closed testing-ში,
სანამ Production გაიხსნება. დაგეგმე ეს ადრე.

---

## 4. გადახდები (ცალკე ეტაპი)

### წესი, რომელსაც ვერ გვერდს ავუვლით
ციფრული საქონელი (მონეტები, Season Pass, unlock-ები) **სავალდებულოდ** მაღაზიის
billing-ით უნდა გაიყიდოს:
- Android → **Google Play Billing**
- iOS → **Apple In-App Purchase**

**Stripe/ბარათი ციფრულ საქონელზე აკრძალულია** → აპს ჩააგდებენ ან დაბლოკავენ.
(ფიზიკური საქონელი/გარე სერვისი — სხვა საქმეა, მაგრამ აქ ეს არ გვაქვს.)

### არქიტექტურული საკითხი
ამჟამად აპი **remote URL-ს** ტვირთავს (`server.url: voidmafia.one`). IAP-ისთვის
ორი გზაა:
1. **Capacitor IAP plugin** (მაგ. `@capacitor-community/in-app-purchases` ან
   **RevenueCat**) — native bridge იძახება WebView-დან. მუშაობს remote URL-თანაც,
   მაგრამ ბრიჯი მხოლოდ native build-ში არსებობს (ვებ-ბრაუზერში fallback უნდა).
2. RevenueCat რეკომენდებულია — ერთი SDK ფარავს Google + Apple-ს, receipt
   validation + webhook სერვერისკენ (მონეტების ჩარიცხვა).

### რაც უნდა აიგოს (მომავალი session)
- [ ] IAP plugin/RevenueCat ინტეგრაცია client-ში
- [ ] პროდუქტების კატალოგი Play/Apple-ში (მაგ. `coins_500`, `season_pass`)
- [ ] server webhook: receipt → მონეტების/Pass-ის ჩარიცხვა (`coinStore`)
- [ ] ვებ-fallback: ბრაუზერში IAP ღილაკები დამალვა ან „აპში გახსენი"
- [ ] restore purchases ღილაკი (Apple-ის მოთხოვნა)

---

## 5. iOS (მოგვიანებით)

- Apple Developer Program — $99/წელი
- Xcode + Mac (ან CI: Codemagic / GitHub Actions macOS runner)
- `npx cap sync ios` → Xcode-ში signing + archive → App Store Connect
- იგივე IAP წესები (Apple IAP)

რეკომენდაცია: ჯერ Android გავუშვათ ბოლომდე, iOS მერე.
