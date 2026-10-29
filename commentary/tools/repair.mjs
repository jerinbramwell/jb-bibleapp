// Repairs our English text (out2/, from biblestudytools) using the two other copies of the Concise Commentary:
// christianity.com (html_cc/) and biblehub.com (html_bh/).
// biblestudytools sometimes lost words around Bible-reference links; the other copies have their own omissions
// (and biblehub sometimes files a note under the wrong chapter). For each of our sections and each other copy:
//   - only their sections for the same verses that are clearly the same passage (>= 50% shared phrases) are used
//   - word-level diff; where ours has nothing or only a reference and theirs has words -> take theirs
//   - words only in ours -> keep ours;  both differ and ours isn't just a reference -> keep ours, log for review
// Writes out3/ and repair_report.txt.   Usage: node repair.mjs [bookId ...]
import fs from 'fs';
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
const only = process.argv.slice(2);
fs.mkdirSync('out3', { recursive: true });
const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m);
const tidy = s => s.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+([,.;:?!])/g, '$1').replace(/\(\(([^()]*)\)\)/g, '($1)').trim();
// christianity.com reference links: use the link target (some labels there are wrong)
const ccText = h => tidy(decode(h.replace(/<a href="\/bible\/search\/\?q=([^"]+)">[^<]*<\/a>/g, (_, q) => `(${decodeURIComponent(q.replace(/\+/g, ' '))})`).replace(/<[^>]*>/g, ' ')));

function ccSections(id, name, c) {
  const f = `html_cc/${id}_${c}.html`;
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const label = id === 'psa' ? 'Psalm' : name;
  const re = new RegExp(`<h4[^>]*>Commentary on ${label.replace(/ /g, '\\s+')}\\s+${c}:(\\d+)(?:-(\\d+))?\\.?</h4>`, 'g');
  const heads = [...html.matchAll(re)];
  if (!heads.length) {
    const i = html.indexOf('Chapter Contents'), j = html.indexOf('&lt;&lt;', i);
    if (i < 0 || j < 0) return null;
    const paras = [...html.slice(i, j).matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)].map(x => ccText(x[2]));
    return [{ verseStart: 0, verseEnd: 999, text: paras.slice(1).join(' ') }];
  }
  return heads.map((m, k) => {
    const body = html.slice(m.index + m[0].length, k + 1 < heads.length ? heads[k + 1].index : html.indexOf('&lt;&lt;', m.index));
    const paras = [...body.matchAll(/<p(?: class="([^"]*)")?>([\s\S]*?)<\/p>/g)].filter(x => x[1] !== 'read-this-passage').map(x => ccText(x[2]));
    return { verseStart: +m[1], verseEnd: m[2] ? +m[2] : +m[1], text: paras.join(' ') };
  });
}

function bhSections(id, c) {
  const f = `html_bh/${id}_${c}.htm`;
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, 'utf8');
  const blocks = [...html.matchAll(/<div class="comm">([\s\S]*?)<\/div>/g)].map(m => tidy(decode(m[1].replace(/<[^>]*>/g, ' ')))).filter(Boolean);
  const start = new RegExp(`(?:^|\\s)(?=${c}:\\d+(?:[-–,]\\d+)?\\s+[A-Z(“"'])`);
  const head = new RegExp(`^${c}:(\\d+)(?:[-–,](\\d+))?\\s+([\\s\\S]+)$`);
  const out = [];
  for (const b of blocks) for (const p of b.split(start)) {
    const m = p.trim().match(head);
    if (m) out.push({ verseStart: +m[1], verseEnd: m[2] ? +m[2] : +m[1], text: m[3].trim() });
    else if (out.length) out.at(-1).text += ' ' + p.trim();
    else out.push({ verseStart: 0, verseEnd: 999, text: p.trim() });
  }
  // biblehub starts whole-chapter notes with the chapter title: "The making of the tabernacle. ... - The ..."
  for (const o of out) o.text = expandAbbr(o.text.replace(/^.{1,250}?\.\s-\s+/, ''));
  return out;
}

// share of a text's 5-word phrases found in our text (same-passage check)
const words = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
function overlap(t, ours) {
  const w = words(t), O = ' ' + words(ours).join(' ') + ' ';
  let h = 0, n = 0;
  for (let i = 0; i + 5 <= w.length; i++) { n++; if (O.includes(' ' + w.slice(i, i + 5).join(' ') + ' ')) h++; }
  return n ? h / n : 0;
}

// Tokens keep punctuation attached so the rebuilt text reads naturally; compare on a normalised key
const tokens = s => s.split(' ').filter(Boolean);
const keyOf = t => t.toLowerCase().replace(/[^a-z0-9]/g, '');
// A run that is only (part of) a Bible reference: "(2 Thessalonians. 1:8)", "(1 John.", "Ro. 8:5-9" ...
// Words must be capitalised book names; it must contain a chapter:verse or a "1/2/3 + Book." form.
// (Several references in a row, e.g. "(Proverbs 24:17-18) (Proverbs 24:19-20)", where a whole note was lost.)
const isRefish = run => run.length > 0 && run.length <= 20 &&
  run.every(t => /^[(\[]?([1-3]|[A-Z][a-z]{1,13}\.?|\d+:\d+(?:[-–,]\d+)*|\d+[-–,]\d+)[)\].,;:]*$/.test(t) || /^[()\-–,.;:]+$/.test(t)) &&
  (run.some(t => /\d+:\d+/.test(t)) || run.some((t, i) => /^[(\[]?[1-3]$/.test(t) && /^[A-Z][a-z]+\./.test(run[i + 1] || '')));

function diff(a, b) {
  const A = a.map(keyOf), B = b.map(keyOf), n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] && A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] && A[i] === B[j]) { ops.push(['=', a[i], b[j]]); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push(['+', null, b[j]]); j++; }
    else { ops.push(['-', a[i], null]); i++; }
  }
  return ops;
}

// Clean words taken from another copy:
//  - a heading for a verse inside our section ("20:32." / "14,15") is removed, keeping the text
//  - a heading for a verse outside our section means the rest belongs to another section: cut there
//  - biblehub's chapter title at the start of a whole-chapter note ("Genealogies. -") is dropped
function cleanInsert(ins, lo, hi, atStart, ref, log) {
  let s = ins.join(' ');
  if (atStart) s = s.replace(/^[^.]{1,120}\.\s-\s*/, '');
  const headRe = /(?:^|\s)(?:\d+:)?(\d+)(?:[-–,](\d+))?\.?\s+(?=[A-Z(“"])/g;
  let m;
  while ((m = headRe.exec(s))) {
    const v = +m[1];
    const looksLikeHeading = m.index === 0 || /[.?!;:)]$/.test(s.slice(0, m.index).trim());
    if (!looksLikeHeading) continue;
    if (v >= lo && v <= hi) { s = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).trim(); headRe.lastIndex = Math.max(0, m.index - 1); }
    else { log.push(`CUT    ${ref}: dropped text from another section starting "${s.slice(m.index, m.index + 60).trim()}"`); s = s.slice(0, m.index).trim(); break; }
  }
  return tokens(s);
}

function repair(ours, theirs, ref, log, lo = 0, hi = 999) {
  const a = tokens(ours), b = tokens(theirs);
  if (a.length * b.length > 8e6) { log.push(`SKIP   ${ref}: too long to compare`); return { text: ours, changed: 0 }; }
  const ops = diff(a, b);
  const out = []; let changed = 0, k = 0;
  while (k < ops.length) {
    if (ops[k][0] === '=') { out.push(ops[k][1]); k++; continue; }
    const del = [];
    let ins = [];
    while (k < ops.length && ops[k][0] !== '=') { if (ops[k][0] === '-') del.push(ops[k][1]); else ins.push(ops[k][2]); k++; }
    if (ins.length) ins = cleanInsert(ins, lo, hi, out.length === 0, ref, log);
    // real words only: not references, verse numbers or "ver." / "verse" markers
    const insWords = ins.filter(t => /[a-z]{3,}/i.test(t) && !/\d+:\d+/.test(t) && !/^\(?(ver|vers|verse|verses|ch|chap)\.?[),.;:]*$/i.test(t)).length;
    if (!ins.length || insWords === 0) { out.push(...del); continue; }
    // ours lost words here: nothing, or only a reference, where the other copy has text
    if (!del.length || isRefish(del)) {
      // keep our reference if theirs has none at this spot
      // keep our reference if theirs has none here; words that finish the previous sentence go before it
      let merged = ins;
      if (del.length && !ins.some(t => /\d+:\d+/.test(t))) {
        const end = /^[a-z]/.test(ins[0]) ? ins.findIndex(t => /[.?!;]$/.test(t)) : -1;
        merged = end >= 0 ? [...ins.slice(0, end + 1), ...del, ...ins.slice(end + 1)] : [...del, ...ins];
      }
      out.push(...merged); changed++;
      log.push(`FIX    ${ref}: "${del.join(' ')}" -> "${merged.join(' ')}"`);
      continue;
    }
    // ours has just the start of a reference ("(Psalms") where theirs has words then the same reference ("(Psalm")
    const last = ins[ins.length - 1] || '';
    if (del.length === 1 && /^\(?[A-Z][a-z]+/.test(del[0]) && keyOf(last).slice(0, 5) === keyOf(del[0]).slice(0, 5) && keyOf(del[0]).length >= 4) {
      const merged = [...ins.slice(0, -1), ...del];
      out.push(...merged); changed++;
      log.push(`FIX    ${ref}: "${del.join(' ')}" -> "${merged.join(' ')}"`);
      continue;
    }
    out.push(...del);
    if (insWords >= 3) log.push(`REVIEW ${ref}: ours "${del.join(' ')}" theirs "${ins.join(' ')}"`);
  }
  // "ver. (Ezekiel 18:26-27) 26,27 speaks" -> "(Ezekiel 18:26-27) speaks" (two copies' ways of citing the same verses)
  const text = tidy(out.join(' ')).replace(/\bver\.\s+(\([^()]*?(\d+):(\d+)(?:[-–,]\d+)?\))\s+\3(?:[,-]\s?\d+)*\.?(?=\s)/g, '$1');
  return { text, changed };
}

// Henry's standard abbreviations (as used by biblehub and in places by biblestudytools): "2Pe 1:14" -> "(2 Peter 1:14)"
const ABBR = {
  Ge: 'Genesis', Ex: 'Exodus', Le: 'Leviticus', Nu: 'Numbers', De: 'Deuteronomy', Jos: 'Joshua', Jud: 'Judges', Ru: 'Ruth',
  '1Sa': '1 Samuel', '2Sa': '2 Samuel', '1Ki': '1 Kings', '2Ki': '2 Kings', '1Ch': '1 Chronicles', '2Ch': '2 Chronicles',
  Ezr: 'Ezra', Ne: 'Nehemiah', Es: 'Esther', Job: 'Job', Ps: 'Psalms', Pr: 'Proverbs', Ec: 'Ecclesiastes', So: 'Song of Solomon',
  Isa: 'Isaiah', Jer: 'Jeremiah', La: 'Lamentations', Eze: 'Ezekiel', Da: 'Daniel', Ho: 'Hosea', Joe: 'Joel', Am: 'Amos',
  Ob: 'Obadiah', Jon: 'Jonah', Mic: 'Micah', Na: 'Nahum', Hab: 'Habakkuk', Zep: 'Zephaniah', Hag: 'Haggai', Zec: 'Zechariah',
  Mal: 'Malachi', Mt: 'Matthew', Mr: 'Mark', Lu: 'Luke', Joh: 'John', Ac: 'Acts', Ro: 'Romans', '1Co': '1 Corinthians',
  '2Co': '2 Corinthians', Ga: 'Galatians', Eph: 'Ephesians', Php: 'Philippians', Col: 'Colossians', '1Th': '1 Thessalonians',
  '2Th': '2 Thessalonians', '1Ti': '1 Timothy', '2Ti': '2 Timothy', Tit: 'Titus', Phm: 'Philemon', Heb: 'Hebrews', Jas: 'James',
  '1Pe': '1 Peter', '2Pe': '2 Peter', '1Jo': '1 John', '2Jo': '2 John', '3Jo': '3 John', Jude: 'Jude', Re: 'Revelation'
};
const abbrRe = new RegExp(`\\(?\\b(${Object.keys(ABBR).sort((a, b) => b.length - a.length).join('|')})\\.?\\s?(\\d+:\\d+(?:[-–,]\\s?\\d+)*)\\)?`, 'g');
const expandAbbr = s => s.replace(abbrRe, (_, a, r) => `(${ABBR[a]} ${r.replace(/,\s/g, ',')})`);

// biblestudytools writes references as "(2 Corinthians. 5:1)" or "(romans 15:1 romans 15:2)"; use
// "(2 Corinthians 5:1)" so they line up with christianity.com's copy and read cleanly
const titleCase = b => b.replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase()).replace(/\bOf\b/g, 'of');
const normRefs = s => expandAbbr(s)
  .replace(/\(\s*((?:[1-3]\s)?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)?)\.\s+(\d+:\d+(?:[-–,]\s?\d+)*)\s*\)/g, (_, b, r) => `(${titleCase(b)} ${r})`)
  .replace(/\(((?:[1-3]\s)?[a-z]+(?:\s[a-z]+)?) (\d+):(\d+)((?:\s\1 \2:\d+)+)\)/g, (_, b, c, v, rest) => `(${titleCase(b)} ${c}:${[v, ...[...rest.matchAll(/:(\d+)/g)].map(x => x[1])].join(',')})`)
  .replace(/\(((?:[1-3]\s)?[a-z]+(?:\s(?:of\s)?[a-z]+)?) (\d+:\d+(?:[-–,]\d+)*)\)/g, (_, b, r) => `(${titleCase(b)} ${r})`);

const log = [];
let fixedSections = 0, fixes = 0, compared = 0;
for (const [id, name, n] of books) {
  if (only.length && !only.includes(id)) continue;
  const book = JSON.parse(fs.readFileSync(`out2/${id}.json`, 'utf8'));
  const sources = [['cc', c => (id === 'sng' ? null : ccSections(id, name, c))], ['bh', c => bhSections(id, c)]];
  book.intro = normRefs(book.intro);
  for (let c = 1; c <= n; c++) {
    book.chapters[c].outline = normRefs(book.chapters[c].outline);
    for (const s of book.chapters[c].sections) s.text = normRefs(s.text);
    for (const [src, get] of sources) {
      const theirs = get(c);
      if (!theirs) continue;
      for (const s of book.chapters[c].sections) {
        const lo = s.wholeChapter ? 0 : s.verseStart, hi = s.wholeChapter ? 999 : s.verseEnd;
        // the same-passage check guards against biblehub filing notes under the wrong chapter; christianity.com
        // doesn't do that, and its short per-verse notes (Proverbs) can't pass the check when ours is damaged
        const match = theirs.filter(t => t.verseStart <= hi && t.verseEnd >= lo && (src === 'cc' || overlap(t.text, s.text) >= 0.5));
        if (!match.length) continue;
        compared++;
        const ref = `${id} ${c}:${s.wholeChapter ? 'all' : `${s.verseStart}-${s.verseEnd}`} [${src}]`;
        const r = repair(s.text, match.map(t => t.text).join(' '), ref, log, lo, hi);
        if (r.changed) { s.text = r.text; fixedSections++; fixes += r.changed; }
      }
    }
    // leftover heading of the next section at the end of a note, e.g. "... 26,27." before section 26-27
    const secs = book.chapters[c].sections;
    secs.forEach((s, k) => {
      const next = secs[k + 1];
      const m = s.text.match(/\s(\d+)(?:[,-]\s?\d+)*[.,]$/);
      if (next && m && +m[1] === next.verseStart) { log.push(`STRAY  ${id} ${c}: removed "${m[0].trim()}" before section ${next.verseStart}`); s.text = s.text.slice(0, m.index).trim(); }
    });
  }
  // Hand corrections where both other copies agree against ours and the automatic repair can't apply
  const MANUAL = {
    '1ch 18': [['This chapter is the same as (2 Samuel 19) under the Captain', 'This chapter is the same as (2 Samuel 8). Our good fight of faith, under the Captain']]
  };
  for (let c = 1; c <= n; c++) for (const [from, to] of MANUAL[`${id} ${c}`] || []) {
    const s = book.chapters[c].sections.find(x => x.text.includes(from));
    if (s) { s.text = s.text.replace(from, to); log.push(`MANUAL ${id} ${c}: "${from}" -> "${to}"`); }
    else log.push(`MANUAL ${id} ${c}: NOT FOUND "${from}"`);
  }
  fs.writeFileSync(`out3/${id}.json`, JSON.stringify(book));
}
fs.writeFileSync('repair_report.txt', log.join('\n'));
console.log(`section comparisons: ${compared}, sections repaired: ${fixedSections}, repairs: ${fixes}, review notes: ${log.filter(l => l.startsWith('REVIEW')).length}`);
