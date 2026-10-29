// Combines section boundaries from both copies for chapters where they differ.
// Our wording is kept; the chapter's text is re-divided at every boundary found in either copy:
//   - our own section starts (known offsets), and
//   - christianity.com section starts, located in our text by their opening words.
// If both copies start a section at the same place but label it differently, christianity.com's label wins
// (it fixes heading typos on biblestudytools such as "1-1" for "1-11").
// Writes patched books to out2/ and a report to reconcile_report.txt.
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
fs.mkdirSync('out2', { recursive: true });
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
const text = h => decode(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const toks = s => [...s.matchAll(/[A-Za-z0-9]+/g)].map(m => ({ w: m[0].toLowerCase(), i: m.index }));

function theirSections(id, name, c) {
  const f = `html_cc/${id}_${c}.html`;
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const label = id === 'psa' ? 'Psalm' : name;
  const re = new RegExp(`<h4[^>]*>Commentary on ${label.replace(/ /g, '\\s+')}\\s+${c}:(\\d+)(?:-(\\d+))?\\.?</h4>`, 'g');
  const heads = [...html.matchAll(re)];
  return heads.map((m, k) => {
    const body = html.slice(m.index + m[0].length, k + 1 < heads.length ? heads[k + 1].index : html.indexOf('&lt;&lt;', m.index));
    const paras = [...body.matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)].filter(x => x[1] !== 'read-this-passage').map(x => text(x[2]));
    return { verseStart: +m[1], verseEnd: m[2] ? +m[2] : +m[1], text: paras.join(' ') };
  });
}

// Char offset in `hay` where `needle` (another copy of a section) begins; searches from `from`. -1 if not found.
function locate(hay, needle, from) {
  const H = toks(hay), N = toks(needle);
  for (let off = 0; off + 8 <= Math.min(N.length, 60); off += 4) {
    const seq = N.slice(off, off + 8).map(t => t.w);
    for (let i = 0; i + 8 <= H.length; i++) {
      if (H[i].i < from) continue;
      if (seq.every((w, k) => H[i + k].w === w)) {
        if (off === 0) return H[i].i;
        const before = hay.slice(0, H[i].i); // matched later words: back up to that sentence's start
        const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('; '));
        return cut + 2 > from ? cut + 2 : -1;
      }
    }
  }
  return -1;
}

const report = [];
let same = 0, merged = 0, noSource = 0;
for (const [id, name, n] of books) {
  const book = JSON.parse(fs.readFileSync(`out/${id}.json`, 'utf8'));
  if (id !== 'sng') for (let c = 1; c <= n; c++) {
    const ours = book.chapters[c];
    const theirs = theirSections(id, name, c);
    if (!theirs || !theirs.length || ours.sections.some(s => s.wholeChapter)) { noSource++; continue; }
    const key = a => a.map(s => `${s.verseStart}-${s.verseEnd}`).join(',');
    if (key(ours.sections) === key(theirs)) { same++; continue; }

    // Proverbs 10-30: Henry comments verse by verse and both copies drop different words, so keep our text
    // and headings, and widen each range to reach the next heading (a note often runs on to the next verse).
    if (id === 'pro' && c >= 10 && c <= 30) {
      const before = key(ours.sections);
      const lastEnd = Math.max(theirs.at(-1).verseEnd, ours.sections.at(-1).verseEnd);
      ours.sections.forEach((s, k) => {
        const next = ours.sections[k + 1];
        s.verseEnd = next ? Math.max(s.verseEnd, next.verseStart - 1) : lastEnd;
      });
      report.push(`RANGES ${id} ${c}: kept our text; [${before}] -> [${key(ours.sections)}]`);
      merged++;
      continue;
    }

    // Concatenate our text, remembering where each of our sections starts
    let full = '';
    const bounds = ours.sections.map(s => {
      const b = { at: full.length, verseStart: s.verseStart, verseEnd: s.verseEnd, from: 'ours' };
      full += (full ? ' ' : '') + s.text;
      if (b.at) b.at += 1;
      return b;
    });
    const unlocated = [];
    let from = 0;
    for (const t of theirs) {
      const at = locate(full, t.text, from);
      if (at < 0) { unlocated.push(`${t.verseStart}-${t.verseEnd}`); continue; }
      from = at;
      const near = bounds.find(b => Math.abs(b.at - at) <= 60);
      if (near) { near.verseStart = t.verseStart; near.verseEnd = t.verseEnd; near.from = 'both'; }
      else bounds.push({ at, verseStart: t.verseStart, verseEnd: t.verseEnd, from: 'theirs' });
    }
    bounds.sort((a, b) => a.at - b.at);
    const sections = bounds.map((b, k) => ({ verseStart: b.verseStart, verseEnd: b.verseEnd, text: full.slice(b.at, k + 1 < bounds.length ? bounds[k + 1].at : full.length).trim() }));
    const issues = [];
    sections.forEach((s, k) => {
      if (k && s.verseStart <= sections[k - 1].verseStart) issues.push(`order ${s.verseStart} after ${sections[k - 1].verseStart}`);
      if (s.text.length < 40) issues.push(`short ${s.verseStart}-${s.verseEnd}`);
    });
    if (issues.length) { report.push(`KEPT   ${id} ${c}: could not combine (${issues.join('; ')}); ours [${key(ours.sections)}] theirs [${key(theirs)}]`); continue; }
    report.push(`MERGED ${id} ${c}: ours [${key(ours.sections)}] + theirs [${key(theirs)}] -> [${key(sections)}]${unlocated.length ? `  (their ${unlocated.join(',')} not found in our text)` : ''}`);
    ours.sections = sections;
    merged++;
  }
  fs.writeFileSync(`out2/${id}.json`, JSON.stringify(book));
}
fs.writeFileSync('reconcile_report.txt', report.join('\n'));
console.log(`same: ${same}, combined: ${merged}, kept as is: ${report.filter(r => r.startsWith('KEPT')).length}, whole-chapter or no second copy: ${noSource}`);
