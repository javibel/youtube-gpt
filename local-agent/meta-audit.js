// Auditoría A4 de meta tags sobre el HTML del build (temporal, no commitear)
const fs = require('fs'), path = require('path');
const PUBLIC = ['index', 'blog', 'extension', 'gear', 'launch', 'trends', 'seo-score', 'embed', 'tools', 'pricing', 'signup', 'terms', 'privacy', 'legal'];

function findHtml(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out.push(...findHtml(p));
    else if (f.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const norm = (p) => p.split(path.sep).join('/');
const all = findHtml('.next/server/app');
const pub = all.filter((p) => {
  const rel = norm(p).replace('.next/server/app/', '').replace('.html', '');
  if (PUBLIC.includes(rel)) return true;
  return ['blog/', 'features/', 'gear/'].some((d) => rel.startsWith(d));
});

const ex = (html, re) => { const m = html.match(re); return m ? m[1] : null; };
const rows = [];
for (const p of pub) {
  const h = fs.readFileSync(p, 'utf8');
  let rel = '/' + norm(p).replace('.next/server/app/', '').replace('.html', '');
  if (rel === '/index') rel = '/';
  rows.push({
    page: rel,
    title: ex(h, /<title>([^<]*)<\/title>/),
    desc: ex(h, /<meta name="description" content="([^"]*)"/),
    ogTitle: ex(h, /<meta property="og:title" content="([^"]*)"/),
    ogDesc: ex(h, /<meta property="og:description" content="([^"]*)"/),
    ogImage: ex(h, /<meta property="og:image" content="([^"]*)"/),
    twCard: ex(h, /<meta name="twitter:card" content="([^"]*)"/),
  });
}
fs.writeFileSync('meta-audit.json', JSON.stringify(rows, null, 1));
console.log('Páginas auditadas:', rows.length);

const issues = [];
const titles = {}, descs = {};
for (const r of rows) {
  if (!r.title) issues.push([r.page, 'SIN title']);
  else {
    (titles[r.title] = titles[r.title] || []).push(r.page);
    if (r.title.length > 65) issues.push([r.page, `title largo (${r.title.length}): se trunca en Google`]);
    if (r.title.length < 25) issues.push([r.page, `title corto (${r.title.length})`]);
  }
  if (!r.desc) issues.push([r.page, 'SIN meta description']);
  else {
    (descs[r.desc] = descs[r.desc] || []).push(r.page);
    if (r.desc.length > 165) issues.push([r.page, `description larga (${r.desc.length})`]);
    if (r.desc.length < 70) issues.push([r.page, `description corta (${r.desc.length})`]);
  }
  if (!r.ogTitle) issues.push([r.page, 'sin og:title']);
  if (!r.ogImage) issues.push([r.page, 'sin og:image']);
  if (!r.twCard) issues.push([r.page, 'sin twitter:card']);
}
for (const [t, pages] of Object.entries(titles)) if (pages.length > 1) issues.push([pages.join(' + '), 'TITLE DUPLICADO: ' + t.slice(0, 60)]);
for (const [d, pages] of Object.entries(descs)) if (pages.length > 1) issues.push([pages.join(' + '), 'DESC DUPLICADA: ' + d.slice(0, 50)]);
console.log(`\n=== ISSUES (${issues.length}) ===`);
for (const [p, i] of issues) console.log(p, '→', i);
