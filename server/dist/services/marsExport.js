/** Escape for HTML text nodes and attribute values. */
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/** Escape a string for safe inclusion inside a <script> block. */
function escScript(s) {
    return s
        // "</script>" inside the JSON would close the block early; escaping "<" is
        // enough and cannot corrupt the JSON, since \u003c parses back as "<".
        .replace(/</g, '\\u003c')
        // U+2028/U+2029 are valid in JSON strings but are line terminators in older
        // JS parsers, which would break the embedded block.
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
function dateText(ms) {
    try {
        return new Date(ms).toISOString().slice(0, 10);
    }
    catch {
        return '';
    }
}
export function buildExportHtml({ subject: s, memories, includePrivate }) {
    const name = s.kind === 'memorial' && s.personFirst
        ? `${s.personFirst} ${s.personLast}`.trim()
        : s.designation;
    const years = s.lifeStatus === 'deceased'
        ? [s.bornYear, s.diedYear].filter(Boolean).join(' — ')
        : (s.bornYear ? `დაბ. ${s.bornYear}` : '');
    // The JSON copy. Private fields are stripped here too, not just in the HTML,
    // so an export handed to someone else cannot leak them from the data block.
    const data = {
        format: 'mars.record.v1',
        exportedAt: Date.now(),
        code: s.code,
        name,
        kind: s.kind,
        lifeStatus: s.lifeStatus,
        bornYear: s.bornYear,
        diedYear: s.diedYear,
        sector: s.sector,
        integrity: s.integrity,
        traits: s.traits,
        manifest: s.manifest,
        portrait: s.portrait,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        memories: memories.map(m => ({
            author: m.authorName, relation: m.relation, text: m.text,
            photo: m.photo, createdAt: m.createdAt,
        })),
        ...(includePrivate ? {
            letter: s.letter,
            restoreNote: s.restoreNote,
            kin: s.kin,
            sample: {
                status: s.sampleStatus, kind: s.sampleKind,
                custodian: s.sampleCustodian, note: s.sampleNote, takenAt: s.sampleTakenAt,
            },
            documents: s.docs.map(d => ({ name: d.name, type: d.type, size: d.size, data: d.data })),
        } : {}),
    };
    const memoryHtml = memories.map(m => `
      <article class="memory">
        <p class="who">${esc(m.authorName)}${m.relation ? ` <span class="rel">${esc(m.relation)}</span>` : ''}
          <time>${esc(dateText(m.createdAt))}</time></p>
        <p class="text">${esc(m.text).replace(/\n/g, '<br>')}</p>
        ${m.photo ? `<img class="memphoto" src="${esc(m.photo)}" alt="">` : ''}
      </article>`).join('');
    const privateHtml = includePrivate ? `
      <section class="private">
        <h2>პირადი ნაწილი</h2>
        <p class="note">ეს განყოფილება მხოლოდ ჩანაწერის მფლობელს ეკუთვნის. თუ ამ ფაილს სხვას გადასცემ, ჯერ წაშალე.</p>
        ${s.letter ? `<h3>წერილი მომავალს</h3><p class="text">${esc(s.letter).replace(/\n/g, '<br>')}</p>` : ''}
        ${s.restoreNote ? `<h3>რა უნდა იცოდნენ</h3><p class="text">${esc(s.restoreNote).replace(/\n/g, '<br>')}</p>` : ''}
        ${s.kin ? `<h3>საკონტაქტო პირი</h3><p class="text">${esc(s.kin)}</p>` : ''}
        ${s.sampleStatus !== 'none' ? `<h3>ბიოლოგიური ნიმუში</h3><p class="text">
          სტატუსი: ${esc(s.sampleStatus)}${s.sampleKind ? ` · ${esc(s.sampleKind)}` : ''}<br>
          ${s.sampleCustodian ? `ინახავს: ${esc(s.sampleCustodian)}<br>` : ''}
          ${s.sampleNote ? `სად: ${esc(s.sampleNote)}<br>` : ''}
          ${s.sampleTakenAt ? `აღებულია: ${esc(s.sampleTakenAt)}` : ''}</p>` : ''}
        ${s.docs.length ? `<h3>დოკუმენტები</h3><ul class="docs">${s.docs.map(d => `<li><a href="${esc(d.data)}" download="${esc(d.name)}">${esc(d.name)}</a></li>`).join('')}</ul>
          <p class="note">ფაილები ამ დოკუმენტშივეა ჩაშენებული — ინტერნეტი არ სჭირდება.</p>` : ''}
      </section>` : '';
    return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} — M.A.R.S. #${esc(s.code)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#01060a; color:#d9ffe4;
         font-family: ui-monospace, "SF Mono", Menlo, monospace; line-height:1.6; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  header { text-align:center; padding-bottom: 20px; border-bottom:1px solid rgba(57,255,106,.2); }
  .portrait { width:120px; height:120px; border-radius:16px; object-fit:cover;
              border:1px solid rgba(57,255,106,.35); }
  h1 { font-size: 26px; margin: 14px 0 4px; color:#fff; }
  .years { color: rgba(255,255,255,.55); margin:0; }
  .code { color: rgba(57,255,106,.65); font-size: 12px; margin-top:6px; }
  .badge { display:inline-block; margin-top:8px; padding:3px 10px; border-radius:999px; font-size:12px;
           border:1px solid rgba(57,255,106,.4); color:#39ff6a; }
  h2 { font-size:15px; color:#39ff6a; margin:28px 0 8px; letter-spacing:.08em; }
  h3 { font-size:13px; color:rgba(57,255,106,.8); margin:16px 0 4px; }
  .text { white-space:pre-wrap; margin:0 0 10px; }
  .memory { border:1px solid rgba(255,255,255,.10); border-radius:12px; padding:12px; margin-bottom:10px;
            background:rgba(255,255,255,.02); }
  .who { color:#7df9ff; font-size:13px; margin:0 0 6px; }
  .rel { color:rgba(255,255,255,.35); }
  time { float:right; color:rgba(255,255,255,.28); font-size:12px; }
  .memphoto { max-width:100%; border-radius:10px; margin-top:8px; }
  .private { border:1px solid rgba(255,212,90,.32); background:rgba(255,212,90,.05);
             border-radius:14px; padding:14px; margin-top:28px; }
  .private h2 { color:#ffd45a; margin-top:0; }
  .note { color:rgba(255,255,255,.4); font-size:12px; }
  .traits { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-top:8px; }
  .traits div { border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:8px 10px; font-size:13px; }
  footer { margin-top:36px; padding-top:14px; border-top:1px solid rgba(255,255,255,.08);
           color:rgba(255,255,255,.3); font-size:12px; text-align:center; }
  a { color:#7df9ff; }
  @media print { body { background:#fff; color:#000; } .memory,.private,.traits div { border-color:#ccc; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    ${s.portrait ? `<img class="portrait" src="${esc(s.portrait)}" alt="">` : ''}
    <h1>${esc(name)}</h1>
    ${years ? `<p class="years">${esc(years)}</p>` : ''}
    <p class="code">M.A.R.S. #${esc(s.code)}</p>
    <span class="badge">${s.lifeStatus === 'deceased' ? 'გარდაცვლილი' : 'ცოცხალია'}</span>
  </header>

  ${s.manifest ? `<h2>${s.lifeStatus === 'deceased' ? 'ვინ იყო' : 'ვინ არის'}</h2>
  <p class="text">${esc(s.manifest).replace(/\n/g, '<br>')}</p>` : ''}

  <h2>წაკითხვა</h2>
  <div class="traits">
    <div>ლოგიკა — ${s.traits.logic}</div>
    <div>ემპათია — ${s.traits.empathy}</div>
    <div>წინააღმდეგობა — ${s.traits.defiance}</div>
    <div>ენტროპია — ${s.traits.entropy}</div>
  </div>
  <p class="note">სექტორი ${esc(s.sector)} · მთლიანობა ${s.integrity}%</p>

  ${memories.length ? `<h2>მოგონებები (${memories.length})</h2>${memoryHtml}` : ''}
  ${privateHtml}

  <footer>
    ეს ფაილი სრულია — ყველა სურათი და დოკუმენტი მასშივეა ჩაშენებული.<br>
    გახსნა ნებისმიერ ბრაუზერში შეიძლება, ინტერნეტის გარეშე.<br>
    ექსპორტი: ${esc(dateText(Date.now()))} · M.A.R.S.
  </footer>
</div>
<script type="application/json" id="mars-record">${escScript(JSON.stringify(data))}</script>
</body>
</html>`;
}
//# sourceMappingURL=marsExport.js.map