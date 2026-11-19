// Joins translated parts of a book into ml/<book>.json and checks them against the English.
// Usage: node tools/merge_ml.mjs mat            (run from the commentary folder)
// Checks: every chapter and section present with the same verse ranges, no empty text, no leftover
// English sentences, every Bible reference carried over with its Malayalam book name, approved samples
// used verbatim, and unusually short or long sections (possible omissions or additions) flagged.
import fs from 'fs';
import path from 'path';

const book = process.argv[2];
if (!book) throw new Error('usage: node tools/merge_ml.mjs <bookId>');
const work = path.join('work', book);
const en = JSON.parse(fs.readFileSync(`en/${book}.json`, 'utf8'));
const names = JSON.parse(fs.readFileSync('work/book-names-ml.json', 'utf8'));
const approved = fs.existsSync(path.join(work, 'approved.json'))
  ? JSON.parse(fs.readFileSync(path.join(work, 'approved.json'), 'utf8'))
  : {};

const chapters = {};
for (const f of fs.readdirSync(work).filter(f => /^part-.*\.json$/.test(f)).sort()) {
  const part = JSON.parse(fs.readFileSync(path.join(work, f), 'utf8'));
  for (const [c, ch] of Object.entries(part.chapters)) {
    if (chapters[c]) throw new Error(`chapter ${c} appears twice (${f})`);
    chapters[c] = ch;
  }
}

const problems = [];
const warnings = [];
const ratios = [];
const refPattern = /\(([^()]*\d+:\d+[^()]*)\)/g;
const bookNames = Object.keys(names).sort((a, b) => b.length - a.length);

for (const [c, enCh] of Object.entries(en.chapters)) {
  const ml = chapters[c];
  if (!ml) { problems.push(`chapter ${c} missing`); continue; }
  if (!ml.outline?.trim()) problems.push(`${c}: outline empty`);
  const enMarks = (enCh.outline.match(/\([\d,\s-]+\)/g) || []).join('');
  const mlMarks = (ml.outline.match(/\([\d,\s-]+\)/g) || []).join('');
  if (enMarks !== mlMarks) problems.push(`${c}: outline verse markers differ`);
  if (ml.sections.length !== enCh.sections.length) {
    problems.push(`${c}: ${ml.sections.length} sections, English has ${enCh.sections.length}`);
    continue;
  }
  enCh.sections.forEach((es, i) => {
    const ms = ml.sections[i];
    const id = `${c}:${es.wholeChapter ? 'all' : `${es.verseStart}-${es.verseEnd}`}`;
    if (es.verseStart !== ms.verseStart || es.verseEnd !== ms.verseEnd || !!es.wholeChapter !== !!ms.wholeChapter) {
      problems.push(`${id}: verse range differs`);
    }
    const text = ms.text || '';
    if (!text.trim()) { problems.push(`${id}: empty`); return; }
    if (approved[`${c}:${es.verseStart}-${es.verseEnd}`] && approved[`${c}:${es.verseStart}-${es.verseEnd}`] !== text) {
      problems.push(`${id}: approved sample not used verbatim`);
    }
    // leftover English: runs of 4+ Latin words
    const latin = text.match(/\b[A-Za-z]{2,}(?:[\s,;']+[A-Za-z]{2,}){3,}/g);
    if (latin) problems.push(`${id}: English left in text: "${latin[0].slice(0, 60)}"`);
    // references: each English reference must appear with the Malayalam book name and same numbers
    for (const m of es.text.matchAll(refPattern)) {
      for (const part of m[1].split(/[;,]\s*(?=[1-3]?\s?[A-Z])/)) {
        const nm = bookNames.find(n => part.trim().startsWith(n));
        if (!nm) continue;
        const nums = part.trim().slice(nm.length).trim();
        const expected = `${names[nm]} ${nums}`.replace(/\s+/g, ' ').trim();
        if (!text.includes(expected)) problems.push(`${id}: reference "${part.trim()}" not found as "${expected}"`);
      }
    }
    const enWords = es.text.split(/\s+/).length;
    if (enWords >= 25) ratios.push({ id, r: text.length / enWords });
  });
}
for (const c of Object.keys(chapters)) if (!en.chapters[c]) problems.push(`unexpected chapter ${c}`);

// sections much shorter or longer than typical for this book (Malayalam characters per English word)
if (ratios.length) {
  const sorted = ratios.map(x => x.r).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  for (const x of ratios) {
    if (x.r < median * 0.7) warnings.push(`${x.id}: unusually short (${(x.r / median * 100).toFixed(0)}% of typical) — check for omissions`);
    if (x.r > median * 1.45) warnings.push(`${x.id}: unusually long (${(x.r / median * 100).toFixed(0)}% of typical) — check for additions`);
  }
  console.log(`median ${median.toFixed(2)} Malayalam characters per English word`);
}

console.log(`chapters ${Object.keys(chapters).length}/${Object.keys(en.chapters).length}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n  ` + problems.join('\n  ') : 'no problems');
if (warnings.length) console.log(`WARNINGS (${warnings.length}):\n  ` + warnings.join('\n  '));

if (!problems.length && Object.keys(chapters).length === Object.keys(en.chapters).length) {
  const out = {
    bookId: en.bookId,
    nameEn: en.nameEn,
    language: 'ml',
    source: "Matthew Henry's Concise Commentary on the Whole Bible (1706), public domain. Malayalam translation.",
    intro: approved.intro || '',
    chapters: Object.fromEntries(Object.keys(en.chapters).map(c => [c, chapters[c]]))
  };
  if (!out.intro && en.intro) console.log('note: book introduction not translated yet');
  fs.writeFileSync(`ml/${book}.json`, JSON.stringify(out));
  console.log(`written ml/${book}.json`);
}
