Void Mafia — Mobile / PWA Polish
Goal
Make Void Mafia feel more like a real mobile app, not just a website.
Improve:
* mobile UX
* PWA install support
* app icon
* splash screen
* standalone mode
* safe-area spacing
* refresh/reconnect protection
* loading states
* touch interactions
* Android/iPhone browser behavior
Important: Do not break gameplay, rooms, roles, voice/WebRTC, spectators, profiles, clans, gifts/coins, cosmetics, achievements, ranked, admin/mod, reports, Google/Facebook login, or Railway deployment.
Do not reset database. Do not use destructive migrations. Do not use prisma migrate reset.
 
⸻
 
A. PWA Manifest
Add or improve manifest.json.
Required:
* app name: Void Mafia
* short name: Void Mafia
* start_url: /
* display: standalone
* background_color: dark/black
* theme_color: dark purple/black
* orientation: portrait
* icons:  
    * 192x192
    * 512x512
    * maskable icon if possible
Goal: When user adds to Home Screen, app opens like a mobile app.
 
⸻
 
B. Install Prompt
Add “Install App” prompt/card.
Show on:
* home screen
* login/start screen
* profile/settings if appropriate
Text: “Install Void Mafia” “Play like an app from your home screen.”
Buttons:
* Install
* Later
Rules:
* do not annoy user
* remember dismissed state
* show only if browser supports install prompt
 
⸻
 
C. Splash Screen / App Launch Feel
When app opens:
* show polished loading screen
* Void Mafia logo
* neon animation
* short loading text: “Connecting to the Void…”
Avoid endless spinner. If loading fails, show retry.
 
⸻
 
D. Mobile Layout Polish
Improve mobile layout everywhere:
* no important button hidden behind browser bottom bar
* use safe-area padding for iPhone
* bottom nav should not cover inputs
* profile/messages/gift/admin panels should scroll properly
* room/game screen should fit comfortably
* timer and phase always visible
* main action always reachable
* large tap targets
* no tiny buttons
Use:
* env(safe-area-inset-bottom)
* env(safe-area-inset-top)
 
⸻
 
E. Pull-to-Refresh Protection
Reduce accidental page refresh on mobile.
Add CSS where safe:
* overscroll-behavior: none
* overscroll-behavior-y: contain or none
Apply to:
* active game screen
* room screen
* root app container
Do not break internal scrolling in:
* messages
* profile
* admin panel
* gift catalog
* spectator chat
 
⸻
 
F. Refresh / Reconnect Safety
If user refreshes accidentally:
* preserve room/session state
* reconnect socket
* restore user as:  
    * active player
    * waiting player
    * spectator
    * dead player
* do not duplicate user
* do not create ghost player
* do not reset room/game state
Show: “Reconnecting…” “Reconnected.”
If room closed: “Room was closed.”
 
⸻
 
G. Host Disconnect Grace Period
If host accidentally refreshes/disconnects:
* do not instantly close room
* start 20–30 second grace period
* if host reconnects, keep room alive
* if host does not return, close room or transfer host according to current rules
Manual Leave Room should still close room immediately if current rule says host leave closes room.
 
⸻
 
H. Voice Recovery
Improve voice/WebRTC recovery on mobile.
Add:
* clear voice status
* reconnect voice button
* reset connection button
* microphone permission error help
* camera permission error help
After refresh:
* clean old peer connections
* prevent duplicate audio streams
* restore voice state safely
* if mic permission is required, ask user to rejoin voice
 
⸻
 
I. Better Loading States
Replace generic loading with meaningful text:
* “Connecting to server…”
* “Loading profile…”
* “Loading room…”
* “Reconnecting to game…”
* “Syncing voice…”
* “Loading gifts…”
* “Loading admin panel…”
Every loading state should have:
* timeout
* error message
* retry button if failed
 
⸻
 
J. Offline / Server Down State
If server unreachable:
* show clean offline/server down screen
* do not show broken blank app
Message: “Cannot connect to Void Mafia.” “Check your connection or try again.”
Button:
* Retry
 
⸻
 
K. Mobile Keyboard Fixes
Improve input screens:
* messages
* chat
* report modal
* gift message
* profile edit
* login nickname
Requirements:
* input remains visible above keyboard
* send button remains tappable
* no white default input style
* no text invisible on white background
* safe-area bottom padding
 
⸻
 
L. App Icons / Branding
Use Void Mafia app icons.
If icons are missing:
* create placeholder paths and document required image sizes
* do not use copyrighted assets
Icons:
* /icons/icon-192.png
* /icons/icon-512.png
* /icons/maskable-512.png
 
⸻
 
M. Mobile Testing Checklist
Test on:
* Android Chrome
* iPhone Safari if possible
* desktop Chrome responsive mode
Test:
1. Add to Home Screen Expected:
* opens standalone
2. Refresh during room Expected:
* reconnects without duplicate player
3. Pull-to-refresh Expected:
* reduced/prevented in game screen
4. Messages input Expected:
* keyboard does not hide send button
5. Game screen Expected:
* timer/phase/action visible
6. Voice Expected:
* permissions clear
* reset connection works
7. Offline Expected:
* clean error screen
8. Deployment Expected:
* Railway deploy green
 
⸻
 
N. Final Verification
After implementation:
* run client build/typecheck
* run server typecheck if backend changed
* deploy green on Railway
* test production on mobile
* summarize changed files
* summarize PWA features
* summarize remaining mobile limitations
 
⸻
 
O. Branch / Merge / Deploy
Work on branch:
feature/mobile-pwa-polish
After build/typecheck pass:
1. commit and push
2. create PR into main
3. do not merge if build fails
4. do not merge if migration is destructive
5. merge only after confirmation
6. deploy main to Railway
7. verify production on https://voidmafia.one
