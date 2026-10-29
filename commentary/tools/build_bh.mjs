// Rebuilds the English commentary with biblehub.com's text (the most complete copy) for Henry's notes,
// keeping outlines, book introductions and seeAlso links from out2/ (biblestudytools).
// Checks every chapter against the other two copies (biblestudytools html/, christianity.com html_cc/):
// 5-word phrases that BOTH other copies have but biblehub lacks are reported as possible gaps.
// Writes out_bh/ and build_bh_report.txt.   Usage: node build_bh.mjs [bookId ...]
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
const only = process.argv.slice(2);
fs.mkdirSync('out_bh', { recursive: true });
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
const clean = h => decode(h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+([,.;:?!])/g, '$1').trim();
const norm = s => ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const grams = (s, n = 5) => { const w = norm(s).trim().split(' '); const g = []; for (let i = 0; i + n <= w.length; i++) g.push(w.slice(i, i + n).join(' ')); return g; };

function bhSections(id, c) {
  const f = `html_bh/${id}_${c}.htm`;
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const blocks = [...html.matchAll(/<div class="comm">([\s\S]*?)<\/div>/g)].map(m => clean(m[1])).filter(Boolean);
  const sections = [];
  for (const b of blocks) {
    // a block starts "C:V-V text", "C:V,V text" or "C:V text"; a block may hold several such notes
    const parts = b.split(new RegExp(`(?:^|\\s)(?=${c}:\\d+(?:[-–,]\\d+)?\\s+[A-Z(“"'])`));
    for (const p of parts) {
      const m = p.trim().match(new RegExp(`^${c}:(\\d+)(?:[-–,](\\d+))?\\s+([\\s\\S]+)$`));
      if (m) sections.push({ verseStart: +m[1], verseEnd: m[2] ? +m[2] : +m[1], text: m[3].trim() });
      else if (sections.length) sections.at(-1).text += ' ' + p.trim();
      else sections.push({ wholeChapter: true, text: p.trim() });
    }
  }
  return sections;
}
const bstText = (id, c) => {
  const b = JSON.parse(fs.readFileSync(`out/${id}.json`, 'utf8')).chapters[c]; // original biblestudytools parse
  return b ? b.sections.map(s => s.text).join(' ') : '';
};
const ccText = (id, c) => {
  const f = `html_cc/${id}_${c}.html`;
  if (!fs.existsSync(f)) return '';
  const h = fs.readFileSync(f, 'utf8'); const i = h.indexOf('Chapter Contents'), j = h.indexOf('&lt;&lt;', i);
  return i < 0 ? '' : clean(h.slice(i, j).replace(/<p class="read-this-passage">[\s\S]*?<\/p>/g, ' ').replace(/<h4[^>]*>[\s\S]*?<\/h4>/g, ' '));
};

const report = [];
let chapters = 0, sections = 0, words = 0, gapChapters = 0, rangeDiff = 0;
for (const [id, , n] of books) {
  if (only.length && !only.includes(id)) continue;
  const base = JSON.parse(fs.readFileSync(`out2/${id}.json`, 'utf8'));
  for (let c = 1; c <= n; c++) {
    const bh = bhSections(id, c);
    const ch = base.chapters[c];
    if (!bh || !bh.length) { report.push(`NOBH   ${id} ${c}: biblehub page missing, kept previous text`); continue; }
    // gaps: phrases both other copies agree on that biblehub lacks
    const bhAll = norm(bh.map(s => s.text).join(' '));
    const bst = bstText(id, c), cc = ccText(id, c);
    const ccN = norm(cc);
    const gaps = grams(bst).filter(g => ccN.includes(' ' + g + ' ') && !bhAll.includes(' ' + g + ' '));
    if (gaps.length > 3) { gapChapters++; report.push(`GAP    ${id} ${c}: ${gaps.length} phrases in both other copies but not biblehub, e.g. "${gaps.slice(0, 3).join(' | ')}"`); }
    const key = a => a.map(s => (s.wholeChapter ? 'all' : `${s.verseStart}-${s.verseEnd}`)).join(',');
    if (key(bh) !== key(ch.sections)) { rangeDiff++; report.push(`RANGES ${id} ${c}: before [${key(ch.sections)}] biblehub [${key(bh)}]`); }
    ch.sections = bh;
    chapters++; sections += bh.length; words += bh.reduce((a, s) => a + s.text.split(' ').length, 0);
  }
  fs.writeFileSync(`out_bh/${id}.json`, JSON.stringify(base));
}
fs.writeFileSync('build_bh_report.txt', report.join('\n'));
console.log(`chapters rebuilt: ${chapters}, sections: ${sections}, words: ${words}, chapters with possible gaps: ${gapChapters}, chapters whose sections changed: ${rangeDiff}`);
