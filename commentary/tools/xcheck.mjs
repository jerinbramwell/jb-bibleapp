// 1) Completeness: every book file has every chapter with at least one section.
// 2) Cross-check a random sample of chapters against christianity.com's copy of the Concise Commentary:
//    same verse sections, and share of 6-word sequences of our text found in theirs.
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
let missing = 0, chapters = 0, sections = 0, words = 0;
for (const [id, , n] of books) {
  const b = JSON.parse(fs.readFileSync(`out/${id}.json`, 'utf8'));
  for (let c = 1; c <= n; c++) {
    const ch = b.chapters[c];
    if (!ch || !ch.sections?.length) { console.log(`MISSING ${id} ${c}`); missing++; continue; }
    chapters++; sections += ch.sections.length;
    words += ch.sections.reduce((a, s) => a + s.text.split(' ').length, 0);
  }
}
console.log(`completeness: ${chapters} chapters, ${sections} sections, ${words} words, ${missing} missing`);

const norm = s => s.toLowerCase().replace(/&#\d+;|&[a-z]+;/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const pool = books.filter(b => b[0] !== 'sng').flatMap(([id, name, n]) => Array.from({ length: n }, (_, i) => [id, name, i + 1]));
let seed = 20261029; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = process.argv.slice(2).map(x => x.split(':')).map(([id, c]) => [id, books.find(b => b[0] === id)[1], +c]);
const sample = pick.length ? pick : Array.from({ length: 40 }, () => pool[Math.floor(rand() * pool.length)]);
const results = [];
for (const [id, name, c] of sample) {
  const slug = id === 'psa' ? 'psalm' : name.toLowerCase().replace(/\s+/g, '-');
  const label = id === 'psa' ? 'Psalm' : name;
  const r = await fetch(`https://www.christianity.com/bible/commentary/matthew-henry-concise/${slug}/${c}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  const theirHeads = [...html.matchAll(new RegExp(`Commentary on ${label} ${c}:(\\d+)(?:-(\\d+))?\\.?<`, 'g'))].map(m => `${m[1]}-${m[2] ?? m[1]}`);
  const start = html.indexOf('Chapter Contents'), stop = html.indexOf('Related Commentaries', start);
  const theirs = ' ' + norm(html.slice(start, stop).replace(/<[^>]*>/g, ' ')) + ' ';
  const ours = JSON.parse(fs.readFileSync(`out/${id}.json`, 'utf8')).chapters[c];
  const ourHeads = ours.sections.filter(s => !s.wholeChapter).map(s => `${s.verseStart}-${s.verseEnd}`);
  const w = norm(ours.sections.map(s => s.text).join(' ')).split(' ');
  let hit = 0, tot = 0;
  for (let i = 0; i + 6 <= w.length; i += 3) { tot++; if (theirs.includes(' ' + w.slice(i, i + 6).join(' ') + ' ')) hit++; }
  const pct = Math.round(100 * hit / Math.max(tot, 1));
  const headsMatch = theirHeads.join(',') === ourHeads.join(',');
  results.push({ ref: `${id} ${c}`, pct, headsMatch, ours: ourHeads.join(','), theirs: theirHeads.join(',') });
  await new Promise(res => setTimeout(res, 400));
}
for (const r of results) console.log(`${r.ref.padEnd(8)} text ${String(r.pct).padStart(3)}%  sections ${r.headsMatch ? 'same' : `DIFFER ours[${r.ours}] theirs[${r.theirs}]`}`);
const avg = Math.round(results.reduce((a, r) => a + r.pct, 0) / results.length);
console.log(`sample of ${results.length}: average text match ${avg}%, min ${Math.min(...results.map(r => r.pct))}%, sections identical in ${results.filter(r => r.headsMatch).length}`);
