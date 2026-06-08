Void Mafia — Shareable Profile Cards + Social Growth

Goal

Add shareable player profile cards to Void Mafia.

Players should be able to generate a beautiful cyberpunk/mafia-style profile card that shows their identity, rank, stats, clan, gifts, titles, and achievements.

This should help the app grow socially because players can share their profile image/card with friends.

Important:
Do not reset database.
Do not use destructive migrations.
Do not use prisma migrate reset.
Do not break gameplay, roles, rooms, voice/WebRTC, spectators, profiles, clans, messages, gifts/coins, cosmetics, achievements, ranked, admin/mod system, reports, Google/Facebook login, or Railway deployment.

Use safe migrations only if needed.

⸻

A. Profile Card Content

The shareable profile card should show:

* avatar
* display name
* publicId
* player title
* equipped profile frame
* clan name/tag
* level
* XP
* rank/rating if ranked exists
* total games
* wins
* win rate
* MVP count if available
* rarest gift
* total gifts received
* top achievement/badge
* admin/mod shield if applicable
* Void Mafia logo/branding
* website URL: voidmafia.one

Example:

Max #1
The Godfather
Clan: VOID
Rank: Diamond
Games: 184
Win Rate: 61%
Rarest Gift: Golden Crown
voidmafia.one

⸻

B. Card Styles

Add several card templates.

Starter templates:

1. Classic Void

* black/purple/cyan neon

2. Mafia Gold

* black/gold/red luxury mafia style

3. Sheriff Blue

* blue/cyan police investigation style

4. Yakuza Neon

* red/gold/dark cyberpunk style

5. Cult Ritual

* purple/red mystical dark style

6. Minimal Dark

* clean, simple, premium

Templates should match Void Mafia aesthetic.

⸻

C. Profile Page Integration

On full profile page, add button:

“Share Profile”

When clicked:

* open Share Card modal
* show live preview
* allow template selection
* allow copy profile link
* allow download image if implemented
* allow share via Web Share API if supported

For mobile:

* large buttons
* clean modal
* preview fits screen

⸻

D. Share Card Modal

Modal should include:

* card preview
* template selector
* copy profile link
* download image / save image
* share button

Button labels:

* Copy Link
* Download Card
* Share

If image generation is not ready:

* implement link sharing first
* add “Download Card coming soon”

⸻

E. Public Profile Links

Add public profile URL.

Example:

https://voidmafia.one/profile/1

or

https://voidmafia.one/u/1

Use publicId, not internal database id.

Rules:

* public profile should not expose private information
* show only public-safe stats
* do not expose private messages, private admin notes, hidden active game roles, OAuth emails, or secret IDs

⸻

F. Image Generation

Preferred:
Generate profile card image client-side using HTML/CSS capture if already supported.

Options:

* html-to-image
* dom-to-image
* canvas rendering

If adding a new package is too risky:

* first implement live preview and copy link
* add image download later

Image requirements:

* 1080x1080 square
* mobile-friendly
* high contrast
* includes Void Mafia branding
* no broken external images
* avatar loads correctly
* fallback initials if no avatar

⸻

G. Privacy / Safety

Do not include:

* email
* internal userId
* private messages
* moderation notes
* hidden current role
* OAuth provider data
* sensitive report/ban details

Only public-safe fields.

Admin/mod badge may be shown if already public.

⸻

H. Social Growth UI

Add small call-to-action:

“Join me on Void Mafia”
“Play at voidmafia.one”

Optionally add QR code later.

Do not add QR code unless easy and safe.

⸻

I. Profile Card Data API

Add or reuse endpoint:

* profile:getPublicCardData
    or
* GET /api/profile/:publicId/card

Returned data:

* displayName
* publicId
* avatarUrl
* title
* clan
* rank
* stats
* gifts summary
* achievements summary
* selected cosmetics
* profile URL

Server must only return public-safe data.

⸻

J. Testing Checklist

Test:

1. Open own profile
    Expected:

* Share Profile button appears

2. Open another player profile
    Expected:

* Share Profile button appears or public share link works

3. Open share modal
    Expected:

* profile card preview loads

4. Copy link
    Expected:

* profile link copied

5. Download image, if implemented
    Expected:

* image saves correctly

6. Missing avatar
    Expected:

* initials fallback works

7. Privacy
    Expected:

* no private data exposed

8. Mobile
    Expected:

* modal works on phone

9. Redeploy
    Expected:

* share links still work

⸻

K. Final Verification

After implementation:

* run server typecheck
* run client build/typecheck
* deploy green on Railway
* test production
* summarize changed files
* summarize privacy rules
* summarize limitations

⸻

L. Branch / Merge / Deploy

Work on branch:

feature/shareable-profile-cards

After build/typecheck pass:

1. commit and push
2. create PR into main
3. do not merge if build fails
4. do not merge if migration is destructive
5. merge only after confirmation
6. deploy main to Railway
7. verify production on https://voidmafia.one
