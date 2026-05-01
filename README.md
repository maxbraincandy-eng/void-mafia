
# VOID MAFIA v12 Ultimate Engine

A modular, mobile-first Mafia platform with automated phase engine, room feed, Android WebView-friendly frontend and audio cues.

## Main flow

Waiting → Role Reveal → Night → Night Result → Common Discussion → Individual Speeches → Nomination → Vote → Vote Result → Last Words → Night.

## Start

```bash
npm install
npm start
```

Render start command:

```bash
npm start
```

## Entry point

`index.js`

## Environment

Copy `.env.example` and fill:

```env
MONGODB_URI=...
SESSION_SECRET=...
ADMIN_IDS=67
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

## Structure

- `src/engine` — game engine, rules, resolver, serializer
- `src/socket` — Socket.IO API
- `src/routes` — HTTP API/auth/diagnostics
- `src/services` — store/user/mail
- `public/js` — frontend modules
- `public/css` — UI
