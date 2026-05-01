# VOID MAFIA v9.7 Auto Engine

Render entry file is `index.js`.

## Structure

```txt
package.json
index.js
.env.example
.gitignore
public/
  index.html
  style.css
  client.js
```

## Render

Start command:

```bash
npm start
```

Environment variables:

```env
MONGODB_URI=...
SESSION_SECRET=...
APP_BASE_URL=https://void-mafia.onrender.com
ADMIN_IDS=67
MONITOR_IDS=
USER_ID_START=1
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM=VOID MAFIA <...>
EMAIL_CODE_TTL_MIN=10
```

## Auto Engine Flow

Waiting → Role Reveal → Night → Night Result → Day Discussion → Nomination → Vote → Vote Result → Last Words → Night.

Host is player seat #1, or any userId listed in `ADMIN_IDS`.
