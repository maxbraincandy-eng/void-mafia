# VOID MAFIA v20 Engine Edition

Glitchy neon/vaporwave Mafia web app with automated game engine, MongoDB persistence, clans, rankings, profile, lobby chat, room settings, role distribution, voting, night resolver, Socket.IO realtime sync and WebRTC signaling.

## Folder map

```txt
package.json
.env.example
src/index.js
src/db.js
src/gameEngine.js
src/socket.js
src/services/userService.js
src/services/clanService.js
src/routes/auth.js
src/routes/api.js
public/index.html
public/css/app.css
public/js/app.js
```

## Render settings

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Environment variables:

```txt
MONGODB_URI=your MongoDB connection string
SESSION_SECRET=long random secret
NODE_ENV=production
PORT=3000
ADMIN_IDS=1
```

## Important

For camera/microphone in browser, use HTTPS. Render gives HTTPS automatically.
