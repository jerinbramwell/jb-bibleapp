// Parses downloaded Concise Commentary pages into one JSON file per book: ./out/<bookId>.json
// The commentary sits between the "Chapter&nbsp;N" marker and the next </div>:
//   [book intro (chapter 1 only)] <i>outline</i> <p>Verses x-y ... text</p> <p>...</p>
// Section headings are either a "Verses x-y" link or an inline "x-y." prefix.
// Usage: node parse.mjs [bookId ...]   (no args = all books)
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8')); // [id, nameEn, chapterCount]
const only = process.argv.slice(2);
fs.mkdirSync('out', { recursive: true });

const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => (n === '151' ? '—' : String.fromCodePoint(+n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
const text = html => decode(html.replace(/<[^>]*>/g, ' '))
  .replace(/\s+/g, ' ')
  .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
  .replace(/\s+([,.;:?!])/g, '$1')
  .trim();

const LINK_HEAD = /^Verses?\s+(\d+)(?:\s*[-–]\s*(\d+))?\b\s*/;
const INLINE_HEAD = /^(\d+)(?:\s*[-–]\s*(\d+))?\.\s+(?=\S)/;
const problems = [];
let words = 0, sectionsTotal = 0, inlineHeads = 0;

for (const [id, nameEn, count] of books) {
  if (only.length && !only.includes(id)) continue;
  if (id === 'sng') continue; // Song of Solomon comes from christianity.com via sng.mjs
  const book = { bookId: id, nameEn, source: "Matthew Henry's Concise Commentary on the Whole Bible (1706), public domain.", intro: '', chapters: {} };
  for (let ch = 1; ch <= count; ch++) {
    const f = `html/${id}_${ch}.html`;
    if (!fs.existsSync(f)) { problems.push(`${id} ${ch}: not downloaded`); continue; }
    const html = fs.readFileSync(f, 'utf8');
    // The commentary is the first inner <div> of #library-article-container
    const container = html.indexOf('id="library-article-container"');
    if (container < 0) { problems.push(`${id} ${ch}: article container not found`); continue; }
    const inner = html.indexOf('<div>', container);
    const region = html.slice(inner + 5, html.indexOf('</div>', inner + 5));
    if (!new RegExp(`Chapter&nbsp;${ch}\\s*<|name="[a-z0-9]+${ch}"`, 'i').test(region)) problems.push(`${id} ${ch}: chapter number not confirmed in page`);

    // Paragraphs: <p><b>book intro</b>, <p><i>outline</i>, then the notes
    // Section heading links can also appear mid-paragraph (e.g. Proverbs: "... <a>Verse 4</a> . Those who ...");
    // start a new paragraph at each one so every heading begins its own section
    // ...but only where the preceding text ends a sentence; "In verse <a>Verse 32</a>, ..." is a mention, not a heading
    const rawParas = region
      .replace(/(<a\s[^>]*>\s*Verses?\s+\d+(?:\s*[-–]\s*\d+)?\s*<\/a>)/g, (link, _l, offset, all) => {
        const before = text(all.slice(Math.max(0, offset - 300), offset));
        const isHeading = !before || /[.?!)"”’]$/.test(before) && !/\b(ver|verse|verses|see|in)\.?$/i.test(before);
        return isHeading ? '<p>' + link : link;
      })
      .split(/<p(?:\s[^>]*)?>/).slice(1);
    let outline = '';
    const paras = [];
    for (const raw of rawParas) {
      const lead = raw.replace(/^\s*(<a [^>]*>\s*<\/a>\s*)*/, '').trimStart();
      const t0 = text(raw);
      if (/^Chapter \d+$/.test(t0)) continue; // the page's own chapter heading
      if (/^<b[\s>]/.test(lead)) {
        if (ch === 1) book.intro = t0;
        else problems.push(`${id} ${ch}: unexpected bold paragraph: ${t0.slice(0, 60)}`);
      } else if (!outline && (/^<i[\s>]/.test(lead) || /^-\s.*\(\d+(?:[-–,]\d+)?\)/.test(t0))) {
        // outline, normally italic; some pages write it as "- Title. (1-3) ..."
        outline = t0.replace(/^-\s+/, '');
      } else if (!outline && ch === 1 && !paras.length) {
        // non-bold book introduction before the outline (e.g. Jonah)
        book.intro = (book.intro ? book.intro + ' ' : '') + t0;
      } else {
        const t = text(raw);
        if (t) paras.push(t);
      }
    }
    const sections = [];
    let pendingHead = null;
    for (let p of paras) {
      let m = p.match(LINK_HEAD);
      let head = null;
      if (m) { head = [+m[1], m[2] ? +m[2] : +m[1]]; p = p.slice(m[0].length).replace(/^[.,;:\s]+/, '').trim(); }
      else if ((m = p.match(new RegExp(`^((?:[1-3]?\\s?[a-z]+(?:\\s[a-z]+)*\\s${ch}:\\d+\\s*)+)\\.\\s+`, 'i')))) {
        // heading written as verse links, e.g. "ephesians 1:1 ephesians 1:2 . text"
        const vs = [...m[1].matchAll(new RegExp(`\\s${ch}:(\\d+)`, 'g'))].map(x => +x[1]);
        head = [Math.min(...vs), Math.max(...vs)]; p = p.slice(m[0].length).trim();
      }
      else if ((m = p.match(INLINE_HEAD))) {
        const s = +m[1], e = m[2] ? +m[2] : +m[1];
        const prevEnd = sections.length ? sections.at(-1).verseEnd : 0;
        if (s === prevEnd + 1 && e >= s) { head = [s, e]; p = p.slice(m[0].length).trim(); inlineHeads++; }
      }
      if (head) {
        if (!p) { pendingHead = head; continue; }
        sections.push({ verseStart: head[0], verseEnd: head[1], text: p });
      } else if (pendingHead) {
        sections.push({ verseStart: pendingHead[0], verseEnd: pendingHead[1], text: p });
        pendingHead = null;
      } else if (sections.length) {
        sections.at(-1).text += ' ' + p;
      } else {
        sections.push({ wholeChapter: true, text: p.replace(/^-\s+/, '') });
      }
    }
    // Whole-chapter notes are sometimes written "<title> - <text>" inside the outline itself
    if (!sections.length) {
      const m = outline.match(/^(.*?)\s+-\s+(.{40,})$/);
      if (m) { outline = m[1]; sections.push({ wholeChapter: true, text: m[2] }); }
    }
    if (!sections.length) { problems.push(`${id} ${ch}: no commentary text found`); continue; }

    // Checks
    sections.forEach((s, k) => {
      const ref = s.wholeChapter ? `${id} ${ch} (whole chapter)` : `${id} ${ch}:${s.verseStart}-${s.verseEnd}`;
      if (s.text.length < 40 && !(id === 'isa' && [36, 37].includes(ch))) problems.push(`${ref}: very short section (${s.text.length} chars): ${s.text}`);
      if (/function\s*\(|[{}<>]|https?:|window\.|BibleStudyTools|\bTweet\b/.test(s.text)) problems.push(`${ref}: possible page junk: ${s.text.slice(0, 80)}`);
      if (!s.wholeChapter && k && sections[k - 1].wholeChapter) problems.push(`${ref}: whole-chapter text before a verse section`);
      if (!s.wholeChapter && k && !sections[k - 1].wholeChapter && s.verseStart < sections[k - 1].verseEnd) problems.push(`${ref}: overlaps previous section`);
      if (/\b\d+[-–]\d+\.\s+[A-Z]/.test(s.text)) problems.push(`${ref}: possible missed inline heading: ${s.text.match(/.{0,30}\b\d+[-–]\d+\.\s+[A-Z].{0,30}/)[0]}`);
      words += s.text.split(' ').length;
    });
    if (!sections[0].wholeChapter && sections[0].verseStart !== 1) problems.push(`${id} ${ch}: first section starts at verse ${sections[0].verseStart}`);
    sectionsTotal += sections.length;
    book.chapters[ch] = { outline, sections };
  }
  // Isaiah 36, 37 and 39 repeat 2 Kings; Henry's note just points there
  if (id === 'isa') {
    const see = { 36: { bookId: '2ki', chapter: 18, verseStart: 17, verseEnd: 37 }, 37: { bookId: '2ki', chapter: 19 }, 39: { bookId: '2ki', chapter: 20, verseStart: 12, verseEnd: 19 } };
    for (const [c, ref] of Object.entries(see)) if (book.chapters[c]) book.chapters[c].seeAlso = ref;
  }
  fs.writeFileSync(`out/${id}.json`, JSON.stringify(book));
}
console.log(`sections: ${sectionsTotal}, words: ${words}, inline headings recognised: ${inlineHeads}`);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join('\n')}` : 'no problems');
