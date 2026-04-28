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
  background: linear-gradi
