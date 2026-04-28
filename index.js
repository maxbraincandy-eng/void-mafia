
<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VOID MAFIA</title>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Rajdhani:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
/* ═══════════════════════════════════════════
   VOID MAFIA — SYNTHWAVE CYBERPUNK RETRO
═══════════════════════════════════════════ */
:root {
  --bg:        #07020f;
  --bg2:       #0e0520;
  --bg3:       #130830;
  --magenta:   #ff00ff;
  --cyan:      #00ffff;
  --pink:      #ff2d9b;
  --purple:    #bf00ff;
  --yellow:    #ffe600;
  --orange:    #ff6e00;
  --green:     #00ff9f;
  --red:       #ff1744;
  --gold:      #ffd700;
  --text:      #f0e6ff;
  --dim:       #6a4a8a;
  --grid:      rgba(191,0,255,0.07);
}

/* ── RESET ── */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
html { scroll-behavior:smooth; }

body {
  font-family: 'Rajdhani', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
  cursor: crosshair;
}

/* ── SCANLINES ── */
body::after {
  content: '';
  position: fixed; inset: 0; z-index: 9999;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent 0px,
    transparent 3px,
    rgba(0,0,0,0.18) 3px,
    rgba(0,0,0,0.18) 4px
  );
}

/* ── CUSTOM CURSOR ── */
* { cursor: crosshair; }
a, button { cursor: pointer; }

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--magenta); box-shadow: 0 0 8px var(--magenta); }

/* ══════════════════════════
   PERSPECTIVE GRID BACKGROUND
══════════════════════════ */
.grid-bg {
  position: fixed; bottom: 0; left: 0; right: 0;
  height: 55vh; z-index: 0; pointer-events: none;
  overflow: hidden;
}
.grid-bg::before {
  content: '';
  position: absolute; inset: 0;
  background:
    linear-gradient(transparent 0%, var(--bg) 100%),
    repeating-linear-gradient(90deg,
      var(--grid) 0px, var(--grid) 1px,
      transparent 1px, transparent 60px),
    repeating-linear-gradient(0deg,
      var(--grid) 0px, var(--grid) 1px,
      transparent 1px, transparent 60px);
  transform: perspective(400px) rotateX(70deg) scaleX(1.8);
  transform-origin: bottom center;
  animation: gridScroll 6s linear infinite;
}
@keyframes gridScroll {
  from { background-position: 0 0; }
  to   { background-position: 0 60px; }
}

/* sun */
.retro-sun {
  position: fixed;
  bottom: 30vh; left: 50%; transform: translateX(-50%);
  width: 200px; height: 100px;
  border-radius: 50% 50% 0 0;
  overflow: hidden;
  z-index: 0; pointer-events: none;
}
.retro-sun::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    #ff6e00 0%, #ff2d9b 30%, #bf00ff 65%, var(--bg) 100%);
  border-radius: 50% 50% 0 0;
}
/* sun lines */
.retro-sun::after {
  content: '';
  position: absolute; bottom: 0; left: 0; right: 0; top: 40%;
  background: repeating-linear-gradient(
    0deg,
    var(--bg) 0px, var(--bg) 4px,
    transparent 4px, transparent 10px
  );
}

/* mountains silhouette */
.mountains {
  position: fixed;
  bottom: calc(30vh - 2px); left: 0; right: 0;
  height: 80px; z-index: 1; pointer-events: none;
  background:
    radial-gradient(ellipse 60px 80px at 8% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 100px 120px at 18% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 80px 100px at 28% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 120px 140px at 42% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 90px 110px at 55% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 110px 130px at 70% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 80px 95px at 82% 100%, var(--bg2) 98%, transparent 99%),
    radial-gradient(ellipse 60px 80px at 92% 100%, var(--bg2) 98%, transparent 99%);
}

/* stars */
.stars {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
}
.star {
  position: absolute;
  width: 2px; height: 2px;
  background: #fff;
  border-radius: 50%;
  animation: twinkle var(--d) ease-in-out infinite;
}
@keyframes twinkle {
  0%,100% { opacity: 0.2; transform: scale(1); }
  50%      { opacity: 1;   transform: scale(1.4); }
}

/* ══════════════════════════
   LAYOUT
══════════════════════════ */
.page { position: relative; z-index: 10; }

/* ══════════════════════════
   HEADER / NAV
══════════════════════════ */
header {
  position: sticky; top: 0; z-index: 200;
  background: linear-gradient(180deg, rgba(7,2,15,.97) 0%, rgba(7,2,15,.85) 100%);
  border-bottom: 1px solid var(--magenta);
  box-shadow: 0 0 30px rgba(255,0,255,.25), 0 2px 60px rgba(255,0,255,.1);
  backdrop-filter: blur(10px);
}
.header-inner {
  max-width: 1200px; margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 32px; height: 64px;
}

.logo-wrap {
  display: flex; align-items: baseline; gap: 10px;
}
.logo-void {
  font-family: 'Orbitron', sans-serif;
  font-size: 28px; font-weight: 900; letter-spacing: 6px;
  color: var(--cyan);
  text-shadow: 0 0 20px var(--cyan), 0 0 40px rgba(0,255,255,.4);
  animation: logoPulse 3s ease-in-out infinite;
}
@keyframes logoPulse {
  0%,100% { text-shadow: 0 0 20px var(--cyan), 0 0 40px rgba(0,255,255,.4); }
  50%     { text-shadow: 0 0 30px var(--cyan), 0 0 60px var(--cyan), 0 0 100px rgba(0,255,255,.3); }
}
.logo-mafia {
  font-family: 'Orbitron', sans-serif;
  font-size: 28px; font-weight: 900; letter-spacing: 6px;
  color: var(--magenta);
  text-shadow: 0 0 20px var(--magenta), 0 0 40px rgba(255,0,255,.4);
}
.logo-slash { color: var(--dim); font-size: 22px; margin: 0 2px; }

nav { display: flex; gap: 8px; }
.nav-link {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px; letter-spacing: 2px; text-transform: uppercase;
  color: var(--dim); text-decoration: none;
  padding: 8px 16px; border-radius: 3px;
  border: 1px solid transparent;
  transition: all .2s;
  position: relative;
}
.nav-link:hover, .nav-link.active {
  color: var(--cyan); border-color: var(--cyan);
  background: rgba(0,255,255,.06);
  box-shadow: 0 0 15px rgba(0,255,255,.15);
}
.nav-coins {
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px; color: var(--gold);
  background: rgba(255,215,0,.07);
  border: 1px solid rgba(255,215,0,.3);
  border-radius: 3px; padding: 6px 14px;
  display: flex; align-items: center; gap: 6px;
  text-shadow: 0 0 8px var(--gold);
  cursor: pointer; transition: all .2s;
}
.nav-coins:hover { border-color: var(--gold); box-shadow: 0 0 15px rgba(255,215,0,.2); }

/* ══════════════════════════
   HERO
══════════════════════════ */
.hero {
  min-height: calc(100vh - 64px);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 60px 20px 200px;
  position: relative;
}

.hero-eyebrow {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; letter-spacing: 6px; text-transform: uppercase;
  color: var(--pink);
  text-shadow: 0 0 10px var(--pink);
  margin-bottom: 20px;
  animation: fadeSlide .8s .2s both;
}

.hero-title {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(52px, 10vw, 110px);
  font-weight: 900; line-height: .95;
  letter-spacing: 8px;
  margin-bottom: 10px;
  animation: fadeSlide .8s .4s both;
}
.ht-void {
  display: block;
  color: transparent;
  -webkit-text-stroke: 2px var(--cyan);
  text-shadow: none;
  filter: drop-shadow(0 0 20px var(--cyan));
}
.ht-mafia {
  display: block;
  color: var(--magenta);
  text-shadow: 0 0 30px var(--magenta), 0 0 60px rgba(255,0,255,.4),
               0 0 100px rgba(255,0,255,.2);
}

.hero-year {
  font-family: 'VT323', monospace;
  font-size: 22px; color: var(--dim);
  letter-spacing: 4px; margin-bottom: 36px;
  animation: fadeSlide .8s .5s both;
}

.hero-desc {
  font-size: 18px; font-weight: 300; color: rgba(240,230,255,.6);
  max-width: 560px; line-height: 1.7; margin-bottom: 48px;
  animation: fadeSlide .8s .6s both;
}

.hero-btns {
  display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;
  animation: fadeSlide .8s .7s both;
}

@keyframes fadeSlide {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ══════════════════════════
   BUTTONS
══════════════════════════ */
.btn {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px; font-weight: 700; letter-spacing: 3px;
  text-transform: uppercase; text-decoration: none;
  padding: 16px 36px; border-radius: 3px;
  border: none; cursor: pointer;
  transition: all .25s; position: relative; overflow: hidden;
  display: inline-flex; align-items: center; gap: 10px;
}
.btn::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.1), transparent);
  transform: translateX(-100%); transition: transform .5s;
}
.btn:hover::before { transform: translateX(100%); }

.btn-primary {
  background: linear-gradient(135deg, #ff00ff, #bf00ff);
  color: #fff;
  box-shadow: 0 0 25px rgba(255,0,255,.4), 0 4px 30px rgba(255,0,255,.2);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(255,0,255,.6), 0 8px 40px rgba(255,0,255,.3);
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--cyan);
  color: var(--cyan);
  box-shadow: 0 0 15px rgba(0,255,255,.2), inset 0 0 15px rgba(0,255,255,.04);
}
.btn-outline:hover {
  background: rgba(0,255,255,.08);
  transform: translateY(-2px);
  box-shadow: 0 0 30px rgba(0,255,255,.4), inset 0 0 30px rgba(0,255,255,.08);
}

.btn-gold {
  background: linear-gradient(135deg, #ffd700, #ff9500);
  color: #000;
  box-shadow: 0 0 25px rgba(255,215,0,.35);
  font-weight: 900;
}
.btn-gold:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(255,215,0,.55);
}

.btn-danger {
  background: transparent;
  border: 1px solid var(--red);
  color: var(--red);
  box-shadow: 0 0 12px rgba(255,23,68,.2);
}
.btn-danger:hover {
  background: rgba(255,23,68,.08);
  box-shadow: 0 0 25px rgba(255,23,68,.4);
}

.btn-sm {
  padding: 9px 18px; font-size: 10px; letter-spacing: 2px;
}

/* ══════════════════════════
   SECTION WRAPPER
══════════════════════════ */
.section {
  max-width: 1200px; margin: 0 auto;
  padding: 80px 32px;
}
.section-header {
  text-align: center; margin-bottom: 60px;
}
.sec-tag {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; letter-spacing: 5px; color: var(--pink);
  text-shadow: 0 0 10px var(--pink);
  text-transform: uppercase; margin-bottom: 12px;
  display: block;
}
.sec-title {
  font-family: 'Orbitron', sans-serif;
  font-size: clamp(26px, 4vw, 42px);
  font-weight: 900; letter-spacing: 4px;
  color: var(--text);
  text-shadow: 0 0 30px rgba(240,230,255,.15);
}
.sec-title span { color: var(--magenta); text-shadow: 0 0 20px var(--magenta); }
.sec-sub {
  font-size: 16px; color: rgba(240,230,255,.45);
  margin-top: 12px; letter-spacing: 1px;
}

/* ══════════════════════════
   DIVIDER
══════════════════════════ */
.neon-divider {
  height: 1px; border: none;
  background: linear-gradient(90deg,
    transparent, var(--magenta), var(--cyan), var(--magenta), transparent);
  box-shadow: 0 0 10px var(--magenta);
  margin: 0;
}

/* ══════════════════════════
   ROLES SECTION
══════════════════════════ */
.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}
.role-card {
  background: linear-gradient(135deg, rgba(14,5,32,.9), rgba(19,8,48,.9));
  border: 1px solid rgba(191,0,255,.2);
  border-radius: 6px; padding: 28px 22px;
  text-align: center;
  transition: all .3s;
  position: relative; overflow: hidden;
}
.role-card::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, var(--glow) 0%, transparent 70%);
  opacity: 0; transition: opacity .3s;
}
.role-card:hover { transform: translateY(-6px); }
.role-card:hover::before { opacity: 1; }
.role-card:hover { border-color: var(--color); box-shadow: 0 0 30px var(--glow); }

.role-icon { font-size: 42px; margin-bottom: 12px; display: block; }
.role-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 14px; font-weight: 700; letter-spacing: 3px;
  color: var(--color); text-shadow: 0 0 12px var(--color);
  margin-bottom: 8px;
}
.role-team {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px; letter-spacing: 2px;
  padding: 3px 10px; border-radius: 2px;
  margin-bottom: 14px; display: inline-block;
}
.team-evil  { background: rgba(255,23,68,.15); color: var(--red);   border: 1px solid rgba(255,23,68,.3); }
.team-good  { background: rgba(0,255,159,.1);  color: var(--green); border: 1px solid rgba(0,255,159,.3); }
.role-desc { font-size: 13px; color: rgba(240,230,255,.5); line-height: 1.6; }

/* ══════════════════════════
   HOW TO PLAY
══════════════════════════ */
.phases-timeline {
  position: relative;
  display: flex; flex-direction: column; gap: 0;
}
.phases-timeline::before {
  content: ''; position: absolute; left: 32px; top: 0; bottom: 0; width: 1px;
  background: linear-gradient(180deg, var(--magenta), var(--cyan), var(--purple));
  box-shadow: 0 0 8px var(--magenta);
}
.phase-item {
  display: flex; gap: 28px; padding: 24px 0;
  position: relative;
  opacity: 0; transform: translateX(-20px);
  transition: opacity .5s, transform .5s;
}
.phase-item.visible { opacity: 1; transform: translateX(0); }
.phase-dot {
  width: 64px; height: 64px; border-radius: 50%;
  flex-shrink: 0; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px;
  border: 2px solid var(--c);
  background: var(--bg2);
  box-shadow: 0 0 20px var(--c), inset 0 0 15px rgba(255,255,255,.03);
}
.phase-content { padding-top: 12px; }
.phase-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 16px; font-weight: 700; letter-spacing: 3px;
  color: var(--c); text-shadow: 0 0 12px var(--c);
  margin-bottom: 6px;
}
.phase-dur {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; color: var(--dim); letter-spacing: 2px;
  margin-bottom: 8px;
}
.phase-desc { font-size: 14px; color: rgba(240,230,255,.5); line-height: 1.6; max-width: 480px; }

/* ══════════════════════════
   SHOP / MONETIZATION
══════════════════════════ */
.shop-wrap {
  background: linear-gradient(135deg, rgba(14,5,32,.8), rgba(7,2,15,.9));
  border: 1px solid rgba(255,214,0,.2);
  border-radius: 8px; overflow: hidden;
}

/* VIP hero */
.vip-hero {
  background: linear-gradient(135deg, #1a0d00, #0a0600);
  border-bottom: 1px solid rgba(255,165,0,.3);
  padding: 40px;
  display: grid; grid-template-columns: 1fr auto;
  gap: 32px; align-items: center;
  position: relative; overflow: hidden;
}
.vip-hero::before {
  content: '';
  position: absolute; top: -60px; right: -60px;
  width: 250px; height: 250px;
  background: radial-gradient(circle, rgba(255,165,0,.12) 0%, transparent 70%);
  pointer-events: none;
}
.vip-badge-big {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px; letter-spacing: 4px; color: var(--gold);
  text-shadow: 0 0 10px var(--gold); margin-bottom: 10px;
}
.vip-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 32px; font-weight: 900; letter-spacing: 4px;
  background: linear-gradient(135deg, var(--gold), var(--orange));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  text-shadow: none; margin-bottom: 8px;
}
.vip-subtitle { font-size: 15px; color: rgba(255,215,0,.5); margin-bottom: 20px; }
.vip-perks { list-style: none; display: flex; flex-direction: column; gap: 8px; }
.vip-perks li {
  font-family: 'Share Tech Mono', monospace;
  font-size: 12px; color: rgba(255,200,0,.7);
  display: flex; align-items: center; gap: 10px;
}
.vip-perks li span { color: var(--gold); font-size: 14px; }
.vip-price-box { text-align: center; flex-shrink: 0; }
.vip-price {
  font-family: 'Orbitron', sans-serif;
  font-size: 44px; font-weight: 900;
  color: var(--gold); text-shadow: 0 0 20px var(--gold);
  line-height: 1;
}
.vip-price-period {
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px; color: var(--dim);
  letter-spacing: 2px; margin-bottom: 16px;
}

/* coin grid */
.shop-lower { padding: 40px; }
.coins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px; margin-bottom: 32px;
}
.coin-pack {
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 6px; padding: 22px 16px;
  text-align: center; cursor: pointer;
  transition: all .25s; position: relative;
}
.coin-pack:hover {
  border-color: var(--cyan);
  box-shadow: 0 0 20px rgba(0,255,255,.15);
  transform: translateY(-4px);
}
.coin-pack.hot {
  border-color: var(--cyan);
  box-shadow: 0 0 15px rgba(0,255,255,.12);
}
.hot-label {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: var(--cyan); color: var(--bg);
  font-family: 'Orbitron', monospace; font-size: 8px; font-weight: 700;
  letter-spacing: 1px; padding: 2px 10px; border-radius: 2px;
}
.cp-icon { font-size: 28px; margin-bottom: 8px; }
.cp-amount {
  font-family: 'Orbitron', monospace; font-size: 20px;
  color: var(--gold); letter-spacing: 1px; margin-bottom: 4px;
}
.cp-bonus { font-size: 11px; color: var(--green); font-family: 'Share Tech Mono', monospace; margin-bottom: 10px; }
.cp-price {
  font-family: 'Share Tech Mono', monospace;
  font-size: 15px; font-weight: 700; color: var(--text);
}

/* cosm */
.cosm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.cosm-item {
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 6px; padding: 16px;
  display: flex; align-items: center; gap: 14px;
  cursor: pointer; transition: all .2s;
}
.cosm-item:hover {
  border-color: var(--purple);
  box-shadow: 0 0 15px rgba(191,0,255,.15);
}
.cosm-icon-w { font-size: 26px; }
.cosm-info { flex: 1; }
.cosm-name { font-size: 14px; font-weight: 700; color: var(--text); }
.cosm-desc { font-family: 'Share Tech Mono', monospace; font-size: 10px; color: var(--dim); margin-top: 2px; }
.cosm-price { font-family: 'Share Tech Mono', monospace; font-size: 13px; color: var(--gold); }

/* ══════════════════════════
   SCREENS / GAME UI PREVIEW
══════════════════════════ */
.screens-showcase {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
}
.mockup {
  background: linear-gradient(180deg, rgba(14,5,32,.95), rgba(7,2,15,1));
  border: 1px solid rgba(191,0,255,.25);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 0 30px rgba(191,0,255,.1);
  transition: transform .3s, box-shadow .3s;
}
.mockup:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 20px 60px rgba(191,0,255,.25);
}
.mockup-bar {
  height: 32px; background: rgba(255,0,255,.08);
  border-bottom: 1px solid rgba(255,0,255,.15);
  display: flex; align-items: center; padding: 0 14px; gap: 6px;
}
.mb-dot { width: 8px; height: 8px; border-radius: 50%; }
.mockup-content { padding: 20px; }
.mock-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 11px; font-weight: 700; letter-spacing: 3px;
  color: var(--magenta); text-shadow: 0 0 8px var(--magenta);
  margin-bottom: 14px;
}
.mock-player {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 4px; padding: 10px 12px;
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 6px;
  font-family: 'Share Tech Mono', monospace; font-size: 12px;
}
.mp-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.mock-code {
  font-family: 'VT323', monospace; font-size: 40px;
  color: var(--cyan); letter-spacing: 10px; text-align: center;
  text-shadow: 0 0 15px var(--cyan); margin: 12px 0;
}
.mock-role-card {
  background: linear-gradient(135deg, rgba(255,0,255,.08), rgba(191,0,255,.06));
  border: 1px solid rgba(255,0,255,.25);
  border-radius: 6px; padding: 18px; text-align: center;
}
.mock-role-icon { font-size: 36px; margin-bottom: 8px; }
.mock-role-name {
  font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700;
  color: var(--magenta); letter-spacing: 2px;
}

/* vote bars */
.vote-bar-row { margin-bottom: 8px; }
.vb-label {
  display: flex; justify-content: space-between;
  font-family: 'Share Tech Mono', monospace; font-size: 11px;
  margin-bottom: 4px;
}
.vb-track { background: rgba(255,255,255,.06); border-radius: 2px; height: 8px; overflow: hidden; }
.vb-fill { height: 100%; border-radius: 2px; box-shadow: 0 0 6px currentColor; }

/* ══════════════════════════
   BOTTOM CTA
══════════════════════════ */
.cta-section {
  text-align: center;
  padding: 100px 20px 120px;
  background: radial-gradient(ellipse at 50% 50%, rgba(255,0,255,.06) 0%, transparent 65%);
  position: relative;
}
.cta-title {
  font-family: 'VT323', monospace;
  font-size: clamp(40px, 8vw, 80px);
  color: var(--cyan);
  text-shadow: 0 0 30px var(--cyan);
  letter-spacing: 6px; margin-bottom: 12px;
}
.cta-sub { font-size: 16px; color: rgba(240,230,255,.4); margin-bottom: 36px; letter-spacing: 2px; }
.blinking { animation: blink .9s step-end infinite; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* ══════════════════════════
   FOOTER
══════════════════════════ */
footer {
  background: rgba(7,2,15,.98);
  border-top: 1px solid rgba(255,0,255,.2);
  padding: 32px;
  text-align: center;
}
.footer-logo {
  font-family: 'Orbitron', sans-serif;
  font-size: 18px; font-weight: 900; letter-spacing: 5px;
  margin-bottom: 8px;
}
.footer-logo .v { color: var(--cyan); text-shadow: 0 0 10px var(--cyan); }
.footer-logo .m { color: var(--magenta); text-shadow: 0 0 10px var(--magenta); }
.footer-links { display: flex; gap: 20px; justify-content: center; margin-top: 16px; }
.footer-link {
  font-family: 'Share Tech Mono', monospace; font-size: 11px; letter-spacing: 2px;
  color: var(--dim); text-decoration: none; transition: color .2s;
}
.footer-link:hover { color: var(--cyan); }
.footer-copy {
  font-family: 'Share Tech Mono', monospace; font-size: 10px; color: var(--dim);
  margin-top: 16px; letter-spacing: 2px;
}

/* ══════════════════════════
   MODAL
══════════════════════════ */
.modal-ov {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(7,2,15,.9); backdrop-filter: blur(8px);
  justify-content: center; align-items: center;
  padding: 20px;
}
.modal-ov.open { display: flex; }
.modal-box {
  background: linear-gradient(135deg, var(--bg2), var(--bg3));
  border: 1px solid var(--magenta);
  box-shadow: 0 0 60px rgba(255,0,255,.2), 0 0 120px rgba(255,0,255,.08);
  border-radius: 8px; padding: 40px;
  width: 100%; max-width: 560px;
  animation: modalIn .3s ease;
  position: relative;
}
@keyframes modalIn {
  from { opacity:0; transform: scale(.92) translateY(20px); }
  to   { opacity:1; transform: scale(1)  translateY(0); }
}
.modal-close {
  position: absolute; top: 16px; right: 20px;
  background: none; border: none; color: var(--dim);
  font-family: 'Share Tech Mono', monospace; font-size: 18px;
  cursor: pointer; transition: color .2s;
}
.modal-close:hover { color: var(--red); }
.modal-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 22px; font-weight: 900; letter-spacing: 4px;
  color: var(--cyan); text-shadow: 0 0 20px var(--cyan);
  margin-bottom: 24px; text-align: center;
}

/* form inside modal */
.f-group { margin-bottom: 18px; }
.f-label {
  font-family: 'Share Tech Mono', monospace;
  font-size: 10px; letter-spacing: 3px; color: var(--dim);
  text-transform: uppercase; display: block; margin-bottom: 6px;
}
.f-input {
  width: 100%; background: rgba(0,0,0,.4);
  border: 1px solid rgba(255,0,255,.2);
  border-radius: 4px; padding: 13px 16px;
  color: var(--text); font-family: 'Share Tech Mono', monospace; font-size: 14px;
  outline: none; transition: border-color .2s, box-shadow .2s;
}
.f-input:focus {
  border-color: var(--cyan);
  box-shadow: 0 0 15px rgba(0,255,255,.15);
}
.code-input-big {
  font-family: 'VT323', monospace; font-size: 36px; letter-spacing: 12px;
  text-align: center; color: var(--cyan);
  text-shadow: 0 0 12px rgba(0,255,255,.4);
  text-transform: uppercase;
}

/* ══════════════════════════
   TOAST
══════════════════════════ */
.toast {
  position: fixed; top: 80px; left: 50%;
  transform: translateX(-50%) translateY(-20px);
  background: var(--bg2); border: 1px solid var(--cyan);
  box-shadow: 0 0 25px rgba(0,255,255,.2);
  border-radius: 4px; padding: 12px 28px;
  font-family: 'Share Tech Mono', monospace; font-size: 13px; color: var(--cyan);
  z-index: 9000; opacity: 0;
  transition: all .3s; white-space: nowrap;
  text-shadow: 0 0 8px rgba(0,255,255,.4);
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast.e { border-color: var(--red); color: var(--red); box-shadow: 0 0 25px rgba(255,23,68,.2); text-shadow: none; }

/* ══════════════════════════
   RESPONSIVE
══════════════════════════ */
@media (max-width: 768px) {
  .header-inner { padding: 0 16px; }
  nav { display: none; }
  .vip-hero { grid-template-columns: 1fr; }
  .screens-showcase { grid-template-columns: 1fr; }
  .hero-title { font-size: 52px; }
  .section { padding: 60px 16px; }
}
</style>
</head>
<body>

<!-- ══ BACKGROUND ══ -->
<div class="stars" id="stars"></div>
<div class="retro-sun"></div>
<div class="mountains"></div>
<div class="grid-bg"></div>

<!-- ══ TOAST ══ -->
<div class="toast" id="toast"></div>

<!-- ══════════════════════════════════════════
     HEADER
══════════════════════════════════════════ -->
<header>
  <div class="header-inner">
    <div class="logo-wrap">
      <span class="logo-void">VOID</span>
      <span class="logo-slash">//</span>
      <span class="logo-mafia">MAFIA</span>
    </div>
    <nav>
      <a href="#roles"  class="nav-link">ROLES</a>
      <a href="#how"    class="nav-link">HOW TO PLAY</a>
      <a href="#shop"   class="nav-link">SHOP</a>
      <a href="#screens" class="nav-link">PREVIEW</a>
    </nav>
    <div class="nav-coins" onclick="openModal('m-join')">
      ⬡ <span id="hdr-coins">1,250</span>
    </div>
  </div>
</header>

<div class="page">

<!-- ══════════════════════════════════════════
     HERO
══════════════════════════════════════════ -->
<section class="hero">
  <div class="hero-eyebrow">⬡ &nbsp; multiplayer deception system &nbsp; v2.0 &nbsp; ⬡</div>

  <h1 class="hero-title">
    <span class="ht-void">VOID</span>
    <span class="ht-mafia">MAFIA</span>
  </h1>

  <div class="hero-year">[ 2 0 8 4 ]</div>

  <p class="hero-desc">
    ციფრული ქვესკნელის ქუჩებში ვინ არის მაფია? <br>
    Real-time video · AI ნარატორი · ნეონ ღამე
  </p>

  <div class="hero-btns">
    <button class="btn btn-primary" onclick="openModal('m-create')">
      ＋ &nbsp; ოთახის შექმნა
    </button>
    <button class="btn btn-outline" onclick="openModal('m-join')">
      → &nbsp; შეერთება
    </button>
    <button class="btn btn-gold" onclick="openModal('m-shop')">
      👑 &nbsp; VIP
    </button>
  </div>
</section>

<hr class="neon-divider">

<!-- ══════════════════════════════════════════
     ROLES
══════════════════════════════════════════ -->
<section class="section" id="roles">
  <div class="section-header">
    <span class="sec-tag">// role system</span>
    <h2 class="sec-title">ვინ ხარ <span>შენ?</span></h2>
    <p class="sec-sub">ყოველი მოთამაშე იღებს საიდუმლო როლს</p>
  </div>

  <div class="roles-grid">
    <div class="role-card" style="--color:var(--red);--glow:rgba(255,23,68,.1)">
      <span class="role-icon">🗡️</span>
      <div class="role-name">MAFIA</div>
      <span class="role-team team-evil">EVIL</span>
      <p class="role-desc">ღამით ჰკლავ. დღით ატყუებ. გუნდი: ბოროტება.</p>
    </div>
    <div class="role-card" style="--color:var(--purple);--glow:rgba(191,0,255,.1)">
      <span class="role-icon">😈</span>
      <div class="role-name">GODFATHER</div>
      <span class="role-team team-evil">EVIL</span>
      <p class="role-desc">Detective-ს შენი ნამდვილი სახე არ ჩანს. იმუნიტეტი.</p>
    </div>
    <div class="role-card" style="--color:var(--cyan);--glow:rgba(0,255,255,.08)">
      <span class="role-icon">🔍</span>
      <div class="role-name">DETECTIVE</div>
      <span class="role-team team-good">TOWN</span>
      <p class="role-desc">ღამით ამოწმებ. ნახავ ვინ არის მაფია.</p>
    </div>
    <div class="role-card" style="--color:var(--green);--glow:rgba(0,255,159,.08)">
      <span class="role-icon">💊</span>
      <div class="role-name">DOCTOR</div>
      <span class="role-team team-good">TOWN</span>
      <p class="role-desc">ღამით გადაარჩენ. ერთ მოთამაშეს სიკვდილისგან.</p>
    </div>
    <div class="role-card" style="--color:var(--magenta);--glow:rgba(255,0,255,.08)">
      <span class="role-icon">👁️</span>
      <div class="role-name">CIVILIAN</div>
      <span class="role-team team-good">TOWN</span>
      <p class="role-desc">შენი ერთადერთი იარაღი — ლოგიკა და სიტყვა.</p>
    </div>
  </div>
</section>

<hr class="neon-divider">

<!-- ══════════════════════════════════════════
     HOW TO PLAY
══════════════════════════════════════════ -->
<section class="section" id="how">
  <div class="section-header">
    <span class="sec-tag">// game loop</span>
    <h2 class="sec-title">როგორ <span>ვთამაშობ?</span></h2>
  </div>

  <div class="phases-timeline" id="timeline">
    <div class="phase-item" style="--c:var(--purple)">
      <div class="phase-dot" style="--c:var(--purple)">🎭</div>
      <div class="phase-content">
        <div class="phase-name">ROLE REVEAL</div>
        <div class="phase-dur">// 10 seconds</div>
        <div class="phase-desc">ყოველი მოთამაშე ხედავს საკუთარ როლს. დამახსოვრება და დამალვა.</div>
      </div>
    </div>
    <div class="phase-item" style="--c:var(--yellow)">
      <div class="phase-dot" style="--c:var(--yellow)">☀️</div>
      <div class="phase-content">
        <div class="phase-name">DAY PHASE</div>
        <div class="phase-dur">// 3 minutes · video + chat</div>
        <div class="phase-desc">ყველა ერთად საუბრობს. ვიდეო ჩართულია. ვინ ჩანს საეჭვოდ?</div>
      </div>
    </div>
    <div class="phase-item" style="--c:var(--orange)">
      <div class="phase-dot" style="--c:var(--orange)">🗳️</div>
      <div class="phase-content">
        <div class="phase-name">VOTING</div>
        <div class="phase-dur">// 60 seconds</div>
        <div class="phase-desc">ხმა მიეცი. ყველაზე მეტი ხმა — ამოვარდება. ტოლი ხმა — გადარჩება.</div>
      </div>
    </div>
    <div class="phase-item" style="--c:var(--magenta)">
      <div class="phase-dot" style="--c:var(--magenta)">🌙</div>
      <div class="phase-content">
        <div class="phase-name">NIGHT PHASE</div>
        <div class="phase-dur">// 90 seconds · secret actions</div>
        <div class="phase-desc">Mafia ჰკლავს. Doctor გადაარჩენს. Detective ამოწმებს. Civilian დაელოდება.</div>
      </div>
    </div>
    <div class="phase-item" style="--c:var(--red)">
      <div class="phase-dot" style="--c:var(--red)">💀</div>
      <div class="phase-content">
        <div class="phase-name">RESULTS</div>
        <div class="phase-dur">// 10 seconds</div>
        <div class="phase-desc">AI ნარატორი გამოაცხადებს ვინ მოკვდა. შემდეგ ახალი დღე იწყება.</div>
      </div>
    </div>
  </div>
</section>

<hr class="neon-divider">

<!-- ══════════════════════════════════════════
     SHOP
══════════════════════════════════════════ -->
<section class="section" id="shop">
  <div class="section-header">
    <span class="sec-tag">// marketplace</span>
    <h2 class="sec-title">VOID <span>STORE</span></h2>
    <p class="sec-sub">ქოინები · VIP სააბონემენტო · კოსმეტიკა</p>
  </div>

  <div class="shop-wrap">

    <!-- VIP -->
    <div class="vip-hero">
      <div>
        <div class="vip-badge-big">⬡ &nbsp; PREMIUM SUBSCRIPTION &nbsp; ⬡</div>
        <div class="vip-title">GOLD VIP</div>
        <div class="vip-subtitle">ციფრული სამყაროს ელიტა</div>
        <ul class="vip-perks">
          <li><span>⚡</span> ენერგია არ იხარჯება ოთახებში</li>
          <li><span>🎙️</span> ექსკლუზიური AI ნარატორის ხმა</li>
          <li><span>✦</span> ოქროს ანიმაციური ჩარჩო ვიდეოზე</li>
          <li><span>🗡️</span> პრიორიტეტული ოთახის შექმნა</li>
          <li><span>📊</span> სრული სტატისტიკა + game replay</li>
          <li><span>🎁</span> ყოველდღიური +50⬡ ბონუსი</li>
        </ul>
      </div>
      <div class="vip-price-box">
        <div class="vip-price">⬡900</div>
        <div class="vip-price-period">PER MONTH</div>
        <button class="btn btn-gold" onclick="buyVip()">👑 ACTIVATE</button>
      </div>
    </div>

    <div class="shop-lower">
      <!-- COINS -->
      <h3 style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:4px;color:var(--dim);margin-bottom:20px">
        // COIN PACKAGES
      </h3>
      <div class="coins-grid">
        <div class="coin-pack" onclick="buy(100,'$0.99')">
          <div class="cp-icon">⬡</div>
          <div class="cp-amount">100</div>
          <div class="cp-bonus">&nbsp;</div>
          <div class="cp-price">$0.99</div>
        </div>
        <div class="coin-pack" onclick="buy(350,'$1.99')">
          <div class="cp-icon">⬡⬡</div>
          <div class="cp-amount">350</div>
          <div class="cp-bonus">+50 bonus</div>
          <div class="cp-price">$1.99</div>
        </div>
        <div class="coin-pack hot" onclick="buy(900,'$3.99')">
          <div class="hot-label">BEST</div>
          <div class="cp-icon">⬡⬡⬡</div>
          <div class="cp-amount">900</div>
          <div class="cp-bonus">+200 bonus</div>
          <div class="cp-price">$3.99</div>
        </div>
        <div class="coin-pack" onclick="buy(2500,'$9.99')">
          <div class="cp-icon">◈</div>
          <div class="cp-amount">2,500</div>
          <div class="cp-bonus">+500 bonus</div>
          <div class="cp-price">$9.99</div>
        </div>
      </div>

      <!-- COSMETICS -->
      <h3 style="font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:4px;color:var(--dim);margin-bottom:16px">
        // COSMETICS
      </h3>
      <div class="cosm-grid">
        <div class="cosm-item" onclick="buyC('Vampire Mask',200)">
          <div class="cosm-icon-w">🧛</div>
          <div class="cosm-info"><div class="cosm-name">Vampire Mask</div><div class="cosm-desc">blood splatter kill fx</div></div>
          <div class="cosm-price">⬡200</div>
        </div>
        <div class="cosm-item" onclick="buyC('Neon Detective',350)">
          <div class="cosm-icon-w">🔍</div>
          <div class="cosm-info"><div class="cosm-name">Neon Detective</div><div class="cosm-desc">cyan glow on investigate</div></div>
          <div class="cosm-price">⬡350</div>
        </div>
        <div class="cosm-item" onclick="buyC('Gold Frame',500)">
          <div class="cosm-icon-w">✦</div>
          <div class="cosm-info"><div class="cosm-name">Gold Frame</div><div class="cosm-desc">animated border on video</div></div>
          <div class="cosm-price">⬡500</div>
        </div>
        <div class="cosm-item" onclick="buyC('Glitch Avatar',150)">
          <div class="cosm-icon-w">👾</div>
          <div class="cosm-info"><div class="cosm-name">Glitch Avatar</div><div class="cosm-desc">RGB glitch effect</div></div>
          <div class="cosm-price">⬡150</div>
        </div>
      </div>
    </div>

  </div>
</section>

<hr class="neon-divider">

<!-- ══════════════════════════════════════════
     UI PREVIEW
══════════════════════════════════════════ -->
<section class="section" id="screens">
  <div class="section-header">
    <span class="sec-tag">// interface preview</span>
    <h2 class="sec-title">თამაშის <span>UI</span></h2>
  </div>

  <div class="screens-showcase">

    <!-- Waiting Room -->
    <div class="mockup">
      <div class="mockup-bar">
        <div class="mb-dot" style="background:var(--red)"></div>
        <div class="mb-dot" style="background:var(--yellow)"></div>
        <div class="mb-dot" style="background:var(--green)"></div>
        <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);margin-left:6px">waiting_room.tsx</span>
      </div>
      <div class="mockup-content">
        <div class="mock-title">// WAITING ROOM</div>
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-family:'Share Tech Mono',monospace;font-size:9px;color:var(--dim);letter-spacing:2px;margin-bottom:6px">ROOM CODE</div>
          <div class="mock-code">XK9V2M</div>
        </div>
        <div class="mock-player">
          <div class="mp-dot" style="background:var(--green);box-shadow:0 0 5px var(--green)"></div>
          <span style="flex:1;color:var(--text)">გია_ოსტატი</span>
          <span style="font-size:9px;color:var(--purple);border:1px solid rgba(191,0,255,.3);padding:1px 6px;border-radius:2px">HOST</span>
        </div>
        <div class="mock-player">
          <div class="mp-dot" style="background:var(--green);box-shadow:0 0 5px var(--green)"></div>
          <span style="flex:1;color:var(--text)">NikaFox99</span>
          <span style="font-size:9px;color:var(--gold);border:1px solid rgba(255,215,0,.3);padding:1px 6px;border-radius:2px">VIP</span>
        </div>
        <div class="mock-player">
          <div class="mp-dot" style="background:var(--green);box-shadow:0 0 5px var(--green)"></div>
          <span style="color:rgba(240,230,255,.5)">TamarDark</span>
        </div>
        <div style="background:rgba(0,255,255,.04);border:1px dashed rgba(0,255,255,.15);border-radius:4px;padding:10px;text-align:center;margin-top:10px;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim)">
          _ _ _ _ _ awaiting 5 more
        </div>
      </div>
    </div>

    <!-- Role Reveal -->
    <div class="mockup">
      <div class="mockup-bar">
        <div class="mb-dot" style="background:var(--red)"></div>
        <div class="mb-dot" style="background:var(--yellow)"></div>
        <div class="mb-dot" style="background:var(--green)"></div>
        <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);margin-left:6px">role_reveal.tsx</span>
      </div>
      <div class="mockup-content">
        <div class="mock-title">// YOUR ROLE</div>
        <div class="mock-role-card">
          <div class="mock-role-icon">🗡️</div>
          <div class="mock-role-name">MAFIA</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(240,230,255,.4);margin-top:6px">ღამით ჰკლავ.<br>დღით ატყუებ.</div>
        </div>
        <div style="margin-top:14px;background:rgba(255,23,68,.06);border:1px solid rgba(255,23,68,.2);border-radius:4px;padding:10px">
          <div style="font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(255,23,68,.7);margin-bottom:6px">// TEAMMATES</div>
          <div style="display:flex;gap:8px">
            <div style="background:rgba(255,0,0,.1);border:1px solid rgba(255,0,0,.2);border-radius:4px;padding:6px 10px;font-size:11px;color:var(--red)">LashaKill</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Voting -->
    <div class="mockup">
      <div class="mockup-bar">
        <div class="mb-dot" style="background:var(--red)"></div>
        <div class="mb-dot" style="background:var(--yellow)"></div>
        <div class="mb-dot" style="background:var(--green)"></div>
        <span style="font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);margin-left:6px">voting.tsx</span>
      </div>
      <div class="mockup-content">
        <div class="mock-title">// VOTING PHASE</div>
        <div style="font-family:'Share Tech Mono',monospace;font-size:26px;color:var(--orange);text-shadow:0 0 12px var(--orange);text-align:center;margin-bottom:14px">00:34</div>
        <div class="vote-bar-row">
          <div class="vb-label">
            <span>NikaFox99</span><span style="color:var(--orange)">3 ხმა</span>
          </div>
          <div class="vb-track"><div class="vb-fill" style="width:75%;background:var(--orange);color:var(--orange)"></div></div>
        </div>
        <div class="vote-bar-row">
          <div class="vb-label">
            <span>TamarDark</span><span style="color:var(--cyan)">1 ხმა</span>
          </div>
          <div class="vb-track"><div class="vb-fill" style="width:25%;background:var(--cyan);color:var(--cyan)"></div></div>
        </div>
        <div class="vote-bar-row" style="margin-bottom:14px">
          <div class="vb-label">
            <span>AnaDragon</span><span style="color:var(--dim)">0</span>
          </div>
          <div class="vb-track"><div class="vb-fill" style="width:0%;background:var(--dim)"></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="background:rgba(255,150,0,.08);border:1px solid rgba(255,150,0,.25);border-radius:4px;padding:8px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--orange);cursor:pointer">VOTE</div>
          <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:8px;text-align:center;font-family:'Share Tech Mono',monospace;font-size:10px;color:var(--dim);cursor:pointer">SKIP</div>
        </div>
      </div>
    </div>

  </div>
</section>

<hr class="neon-divider">

<!-- ══════════════════════════════════════════
     CTA
══════════════════════════════════════════ -->
<section class="cta-section">
  <div class="cta-title">READY TO PLAY<span class="blinking">_</span></div>
  <p class="cta-sub">minimum 4 players · maximum 12 players</p>
  <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
    <button class="btn btn-primary" onclick="openModal('m-create')">
      ＋ &nbsp; CREATE ROOM
    </button>
    <button class="btn btn-outline" onclick="openModal('m-join')">
      → &nbsp; JOIN ROOM
    </button>
  </div>
</section>

<!-- ══════════════════════════════════════════
     FOOTER
══════════════════════════════════════════ -->
<footer>
  <div class="footer-logo">
    <span class="v">VOID</span>//
    <span class="m">MAFIA</span>
  </div>
  <div class="footer-links">
    <a href="#" class="footer-link">GITHUB</a>
    <a href="#" class="footer-link">DOCS</a>
    <a href="#" class="footer-link">DISCORD</a>
    <a href="#" class="footer-link">PRIVACY</a>
  </div>
  <div class="footer-copy">© 2084 VOID MAFIA · MIT LICENSE · BUILT WITH SUPABASE + LIVEKIT</div>
</footer>

</div><!-- /page -->

<!-- ══════════════════════════════════════════
     MODALS
══════════════════════════════════════════ -->

<!-- CREATE ROOM -->
<div class="modal-ov" id="m-create" onclick="closeOv(event,'m-create')">
  <div class="modal-box">
    <button class="modal-close" onclick="closeModal('m-create')">[ X ]</button>
    <div class="modal-title">// CREATE ROOM</div>
    <div class="f-group">
      <label class="f-label">room name</label>
      <input class="f-input" type="text" placeholder="VOID_ROOM_01">
    </div>
    <div class="f-group">
      <label class="f-label">max players</label>
      <input class="f-input" type="range" min="4" max="12" value="8"
        oninput="document.getElementById('p-disp').textContent=this.value"
        style="background:transparent;border:none;padding:8px 0;cursor:pointer">
      <div style="text-align:right;font-family:'Share Tech Mono',monospace;color:var(--cyan);font-size:18px"><span id="p-disp">8</span> players</div>
    </div>
    <div class="f-group">
      <label class="f-label">visibility</label>
      <select class="f-input" style="color:var(--text)">
        <option>🔒 PRIVATE (code only)</option>
        <option>🌐 PUBLIC</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px">
      <button class="btn btn-primary" onclick="createRoom()">⚡ DEPLOY</button>
      <button class="btn btn-outline" onclick="closeModal('m-create')">CANCEL</button>
    </div>
  </div>
</div>

<!-- JOIN ROOM -->
<div class="modal-ov" id="m-join" onclick="closeOv(event,'m-join')">
  <div class="modal-box">
    <button class="modal-close" onclick="closeModal('m-join')">[ X ]</button>
    <div class="modal-title">// JOIN ROOM</div>
    <div class="f-group">
      <label class="f-label">enter access code</label>
      <input class="f-input code-input-big" id="join-code" type="text"
        placeholder="______" maxlength="6"
        oninput="this.value=this.value.toUpperCase()">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <button class="btn btn-outline" onclick="joinRoom()">→ CONNECT</button>
      <button class="btn btn-danger" onclick="closeModal('m-join')">ABORT</button>
    </div>
  </div>
</div>

<!-- SHOP MODAL (mini) -->
<div class="modal-ov" id="m-shop" onclick="closeOv(event,'m-shop')">
  <div class="modal-box">
    <button class="modal-close" onclick="closeModal('m-shop')">[ X ]</button>
    <div class="modal-title" style="color:var(--gold);text-shadow:0 0 20px var(--gold)">// GOLD VIP</div>
    <div style="text-align:center;margin:20px 0">
      <div style="font-size:48px;margin-bottom:10px">👑</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:36px;color:var(--gold);text-shadow:0 0 20px var(--gold)">⬡ 900</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:11px;color:var(--dim);letter-spacing:2px;margin-bottom:20px">PER MONTH</div>
    </div>
    <button class="btn btn-gold" onclick="buyVip()" style="margin-bottom:10px">👑 ACTIVATE VIP</button>
    <button class="btn btn-danger" onclick="closeModal('m-shop')">CANCEL</button>
  </div>
</div>

<script>
/* ═══ STARS ═══ */
(function() {
  const c = document.getElementById('stars');
  for (let i = 0; i < 120; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    s.style.left = Math.random()*100 + '%';
    s.style.top  = Math.random()*60 + '%';
    s.style.setProperty('--d', (2 + Math.random()*4) + 's');
    s.style.animationDelay = (Math.random()*4) + 's';
    s.style.opacity = Math.random()*0.6 + 0.1;
    if (Math.random() > .85) {
      s.style.width = s.style.height = '3px';
      s.style.boxShadow = '0 0 4px #fff';
    }
    c.appendChild(s);
  }
})();

/* ═══ SCROLL REVEAL FOR TIMELINE ═══ */
const obs = new IntersectionObserver(entries => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('visible'), i * 120);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.phase-item').forEach(el => obs.observe(el));

/* ═══ TOAST ═══ */
let coins = 1250;
function toast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' e' : '');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ═══ COINS ═══ */
function updCoins() {
  document.getElementById('hdr-coins').textContent = coins.toLocaleString();
}

/* ═══ MODALS ═══ */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeOv(e, id) { if (e.target.classList.contains('modal-ov')) closeModal(id); }

/* ═══ ACTIONS ═══ */
function createRoom() {
  closeModal('m-create');
  const code = Math.random().toString(36).slice(2,8).toUpperCase();
  toast('⚡ ROOM DEPLOYED // CODE: ' + code);
}
function joinRoom() {
  const v = document.getElementById('join-code').value;
  if (v.length < 6) { toast('6-char code required', true); return; }
  closeModal('m-join');
  toast('→ CONNECTED TO: ' + v);
}
function buyVip() {
  if (coins < 900) { toast('⚠ INSUFFICIENT COINS', true); return; }
  coins -= 900; updCoins();
  closeModal('m-shop');
  toast('👑 GOLD VIP ACTIVATED');
}
function buy(amt, price) {
  coins += amt; updCoins();
  toast(`⬡ +${amt} COINS ADDED (${price})`);
}
function buyC(name, price) {
  if (coins < price) { toast('⚠ INSUFFICIENT COINS', true); return; }
  coins -= price; updCoins();
  toast(`✦ "${name.toUpperCase()}" ACQUIRED`);
}

/* ═══ NAV ACTIVE ON SCROLL ═══ */
const navLinks = document.querySelectorAll('.nav-link');
window.addEventListener('scroll', () => {
  const pos = window.scrollY + 100;
  navLinks.forEach(l => {
    const sec = document.querySelector(l.getAttribute('href'));
    if (!sec) return;
    const top = sec.offsetTop, bot = top + sec.offsetHeight;
    l.classList.toggle('active', pos >= top && pos < bot);
  });
});
</script>
</body>
</html>
