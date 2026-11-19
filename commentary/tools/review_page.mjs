// Builds a browser page to review a translated book: Henry's English beside the Malayalam, section by section.
// Usage: node tools/review_page.mjs mat "5:3-12,13:1-23,26:26-30"   (run from the commentary folder)
import fs from 'fs';

const book = process.argv[2];
const picks = (process.argv[3] || '').split(',').filter(Boolean);
const en = JSON.parse(fs.readFileSync(`en/${book}.json`, 'utf8'));
const ml = JSON.parse(fs.readFileSync(`ml/${book}.json`, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const label = (c, s) => (s.wholeChapter ? `${c}` : `${c}:${s.verseStart}-${s.verseEnd}`);
const anchor = (c, s) => `s-${c}-${s.wholeChapter ? 'all' : `${s.verseStart}-${s.verseEnd}`}`;

let body = '';
if (en.intro) {
  body += `<section id="intro"><h3>Introduction</h3><div class="pair"><p class="en">${esc(en.intro)}</p><p class="ml">${esc(ml.intro)}</p></div></section>`;
}
for (const [c, ch] of Object.entries(en.chapters)) {
  body += `<h2 id="c-${c}">Chapter ${c}</h2>`;
  body += `<div class="pair outline"><p class="en">${esc(ch.outline)}</p><p class="ml">${esc(ml.chapters[c].outline)}</p></div>`;
  ch.sections.forEach((s, i) => {
    body += `<section id="${anchor(c, s)}"><h3>${en.nameEn} ${label(c, s)}</h3><div class="pair"><p class="en">${esc(s.text)}</p><p class="ml">${esc(ml.chapters[c].sections[i].text)}</p></div></section>`;
  });
}
const pickLinks = picks.map(p => {
  const [c, r] = p.split(':');
  return `<a href="#s-${c}-${r}">${en.nameEn} ${p}</a>`;
}).join(' · ');
const chapterLinks = Object.keys(en.chapters).map(c => `<a href="#c-${c}">${c}</a>`).join(' ');

const html = `<!doctype html><html lang="ml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review: Henry on ${en.nameEn} (Malayalam)</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Malayalam:wght@400;700&family=Lora:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#f4f1ea;color:#1f2a17;font-family:'Lora',Georgia,serif}
main{max-width:1200px;margin:0 auto;padding:28px 20px 80px}
h1{font-size:26px;margin:0 0 6px} h2{margin:40px 0 12px;color:#284815;border-bottom:2px solid #d8d0bd;padding-bottom:6px}
h3{font-size:15px;margin:0 0 10px;color:#8a6d1d;letter-spacing:.03em}
.nav{background:#fff;border:1px solid #dfd8c8;border-radius:12px;padding:14px 16px;margin:16px 0;line-height:2}
.nav a{color:#284815;margin-right:6px}
section{background:#fff;border:1px solid #dfd8c8;border-radius:14px;padding:18px 20px;margin:0 0 18px}
.pair{display:grid;grid-template-columns:1fr 1.25fr;gap:24px}
.outline{margin-bottom:18px;background:#fbf8f0;border:1px dashed #d8d0bd;border-radius:12px;padding:12px 16px}
.en{font-style:italic;color:#4a4a40;line-height:1.75;font-size:15px;margin:0}
.ml{font-family:'Noto Serif Malayalam',serif;font-size:19px;line-height:2.05;margin:0}
@media (max-width:820px){.pair{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Matthew Henry's Commentary — ${en.nameEn}: English and Malayalam</h1>
<p>Each section shows Henry's English (left) and the Malayalam translation (right).</p>
${pickLinks ? `<div class="nav"><b>Suggested spot-checks:</b> ${pickLinks}</div>` : ''}
<div class="nav"><b>Chapters:</b> <a href="#intro">Intro</a> ${chapterLinks}</div>
${body}
</main></body></html>`;
fs.mkdirSync('../review', { recursive: true });
const out = `../review/${book}-ml-review.html`;
fs.writeFileSync(out, html);
console.log('written', out);
