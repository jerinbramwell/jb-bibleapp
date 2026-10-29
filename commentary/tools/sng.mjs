// Song of Solomon is missing from biblestudytools, so take it from christianity.com (same Concise Commentary).
// Page layout: <h4>Chapter Contents</h4><p>outline</p>, then per section
//   <h4>Commentary on Song of Solomon C:V-V</h4><p class="read-this-passage">…</p><p>text</p>…
import fs from 'fs';
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
// Cross-reference links: use the link target (the displayed label is sometimes wrong on this site)
const refs = h => h.replace(/<a href="\/bible\/search\/\?q=([^"]+)">[^<]*<\/a>/g, (_, q) => `(${decodeURIComponent(q.replace(/\+/g, ' '))})`);
const text = h => decode(refs(h).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+([,.;:?!])/g, '$1').trim();

const book = { bookId: 'sng', nameEn: 'Song of Solomon', source: "Matthew Henry's Concise Commentary on the Whole Bible (1706), public domain.", intro: '', chapters: {} };
for (let ch = 1; ch <= 8; ch++) {
  const f = `html/sng_${ch}.html`;
  if (!fs.existsSync(f)) {
    const r = await fetch(`https://www.christianity.com/bible/commentary/matthew-henry-concise/song-of-solomon/${ch}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    fs.writeFileSync(f, await r.text());
    await new Promise(res => setTimeout(res, 500));
  }
  const html = fs.readFileSync(f, 'utf8');
  const start = html.indexOf('<h4>Chapter Contents</h4>');
  const stop = html.indexOf('&lt;&lt; Song of Solomon', start);
  if (start < 0 || stop < 0) { console.log(`sng ${ch}: layout not recognised`); continue; }
  const body = html.slice(start, stop);
  const parts = body.split(/<h4[^>]*>/).slice(1);
  const outline = text((parts[0].match(/<p>([\s\S]*?)<\/p>/) || ['', ''])[1]);
  const sections = parts.slice(1).map(p => {
    const m = p.match(/^Commentary on Song of Solomon (\d+):(\d+)(?:-(\d+))?<\/h4>/);
    if (!m || +m[1] !== ch) throw new Error(`sng ${ch}: bad section heading ${p.slice(0, 80)}`);
    const paras = [...p.matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)].filter(x => x[1] !== 'read-this-passage').map(x => text(x[2])).filter(Boolean);
    return { verseStart: +m[2], verseEnd: m[3] ? +m[3] : +m[2], text: paras.join(' ') };
  });
  book.chapters[ch] = { outline, sections };
  console.log(`sng ${ch}: ${sections.length} sections, ${sections.reduce((a, s) => a + s.text.split(' ').length, 0)} words`);
}
fs.writeFileSync('out/sng.json', JSON.stringify(book));
