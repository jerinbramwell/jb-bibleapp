// Downloads Matthew Henry's Concise Commentary pages (one per chapter) from biblestudytools.com.
// Saves raw HTML to ./html/<bookId>_<chapter>.html; skips files already downloaded.
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8')); // [id, nameEn, chapterCount]
fs.mkdirSync('html', { recursive: true });
const slug = name => name.toLowerCase().replace(/\s+/g, '-');
const jobs = books.flatMap(([id, name, n]) => Array.from({ length: n }, (_, i) => ({ id, url: `https://www.biblestudytools.com/commentaries/matthew-henry-concise/${slug(name)}/${i + 1}.html`, file: `html/${id}_${i + 1}.html` })));
const todo = jobs.filter(j => !fs.existsSync(j.file));
console.log(`${jobs.length} chapters, ${todo.length} to download`);
let done = 0, failed = [];
async function get(j) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(j.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const html = await r.text();
        if (html.includes('Verse')) { fs.writeFileSync(j.file, html); return; }
      }
      if (r.status === 404) break;
    } catch {}
    await new Promise(res => setTimeout(res, 2000 * attempt));
  }
  failed.push(j.url);
}
const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const j = queue.shift();
    await get(j);
    if (++done % 100 === 0) console.log(`${done}/${todo.length}`);
    await new Promise(res => setTimeout(res, 300));
  }
}));
console.log(`finished: ${done - failed.length} ok, ${failed.length} failed`);
if (failed.length) fs.writeFileSync('failed.txt', failed.join('\n'));
