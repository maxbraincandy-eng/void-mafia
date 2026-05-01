async function apiGet(url) {
  const r = await fetch(url);
  return r.json();
}
async function apiPost(url, body) {
  const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body || {}) });
  return r.json();
}

async function refreshStatsPages() {
  try {
    const [health, clans, lb] = await Promise.all([apiGet("/api/health"), apiGet("/api/clans"), apiGet("/api/leaderboard")]);
    App.clans = clans.clans || [];
    App.leaderboard = lb.users || [];

    $("sRooms").textContent = App.rooms.length;
    $("sLive").textContent = App.rooms.filter(r => r.status === "live").length;
    $("sPlayers").textContent = App.rooms.reduce((s,r) => s + r.players, 0);
    $("sClans").textContent = App.clans.length;

    $("clansList").innerHTML = App.clans.length ? App.clans.map(c => `
      <article class="clan-card"><b>${escapeHtml(c.emblem || "◆")} ${escapeHtml(c.name)}</b><p>Leader: ${escapeHtml(c.leaderName)} · Members: ${c.members.length}</p></article>
    `).join("") : `<article class="clan-card">კლანები ჯერ არ არის.</article>`;

    $("leaderboard").innerHTML = App.leaderboard.length ? App.leaderboard.map((u,i) => `
      <div class="leader-row"><b>#${i+1} · ID ${u.userId}</b><br>${escapeHtml(u.nickname || "Player")} · XP ${u.xp || 0}</div>
    `).join("") : `<p>სტატისტიკა ჯერ არ არის.</p>`;
  } catch (e) {
    console.error(e);
  }
}
