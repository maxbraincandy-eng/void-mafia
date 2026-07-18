// განაბ სიმულატორი — share card renderer. Draws a compact card to a canvas
// and returns a JPEG data URL small enough for a community post (<680KB).

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function renderGanabCard(opts: { nickname: string; won: boolean; rankLabel: string; line: string }): string {
  const W = 640, H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const amber = '#d9a24a';

  // Background
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (opts.won) { g.addColorStop(0, '#241a06'); g.addColorStop(1, '#0a0805'); }
  else { g.addColorStop(0, '#1a0608'); g.addColorStop(1, '#0a0505'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // Border + faint grid
  ctx.strokeStyle = opts.won ? 'rgba(217,162,74,0.55)' : 'rgba(255,45,85,0.4)';
  ctx.lineWidth = 3; ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = 40; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }

  ctx.textAlign = 'center';

  // Emoji
  ctx.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.fillText(opts.won ? '👑' : '💀', W / 2, 96);

  // Title
  ctx.fillStyle = opts.won ? amber : '#ff6b6b';
  ctx.font = '700 34px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(opts.won ? 'კანონიერი ქურდი' : 'გაფუჭდა', W / 2, 150);

  // Nickname
  ctx.fillStyle = '#e8dcc8';
  ctx.font = '600 24px "Space Grotesk", system-ui, sans-serif';
  ctx.fillText(opts.nickname + '  ·  ' + opts.rankLabel, W / 2, 190);

  // Line (epitaph / achievement)
  ctx.fillStyle = 'rgba(217,162,74,0.72)';
  ctx.font = '17px "Space Grotesk", system-ui, sans-serif';
  const lines = wrap(ctx, opts.line, W - 80).slice(0, 3);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, 228 + i * 26));

  // Footer
  ctx.fillStyle = 'rgba(217,162,74,0.4)';
  ctx.font = '600 14px "Share Tech Mono", monospace';
  ctx.fillText('🃏 განაბ სიმულატორი · voidmafia.one', W / 2, H - 28);

  return canvas.toDataURL('image/jpeg', 0.72);
}
