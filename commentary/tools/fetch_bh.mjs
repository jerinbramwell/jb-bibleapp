// Downloads biblehub.com's copy of Matthew Henry's Concise Commentary to ./html_bh/<bookId>_<chapter>.htm
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
fs.mkdirSync('html_bh', { recursive: true });
const slug = (id, name) => (id === 'sng' ? 'songs' : name.toLowerCase().replace(/\s+/g, '_'));
const jobs = books.flatMap(([id, name, n]) => Array.from({ length: n }, (_, i) => ({ url: `https://biblehub.com/commentaries/mhc/${slug(id, name)}/${i + 1}.htm`, file: `html_bh/${id}_${i + 1}.htm` })));
const todo = jobs.filter(j => !fs.existsSync(j.file));
console.log(`${todo.length} to download`);
const failed = []; let done = 0; const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const j = queue.shift(); let ok = false;
    for (let a = 1; a <= 4 && !ok; a++) {
      try { const r = await fetch(j.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (r.ok) { const h = await r.text(); if (h.includes('class="comm"')) { fs.writeFileSync(j.file, h); ok = true; } } } catch {}
      if (!ok) await new Promise(res => setTimeout(res, 2000 * a));
    }
    if (!ok) failed.push(j.url);
    if (++done % 200 === 0) console.log(`${done}/${todo.length}`);
    await new Promise(res => setTimeout(res, 300));
  }
}));
console.log(`finished: ${done - failed.length} ok, ${failed.length} failed`);
if (failed.length) fs.writeFileSync('failed_bh.txt', failed.join('\n'));
