# Matthew Henry's Concise Commentary — data files

Matthew Henry's *Concise Commentary on the Whole Bible* (1706, public domain), one JSON file per book,
for the app's Study Center → Study Notes. These files are meant to be hosted (e.g. GitHub + jsDelivr) and
loaded by the app on demand; they are not part of the app's source code.

- `en/<bookId>.json` — English original. Book ids match the app (`gen`, `exo`, … `joh`, … `rev`).
- `en/index.json` — list of books with chapter/section counts and file sizes.
- `ml/<bookId>.json` — Malayalam translation, same layout as the English file, section for section.
  Added book by book; `ml/index.json` lists the books translated so far.
- `latest.json` — the current release tag and the list of translated books. The app reads this file
  straight from GitHub, then loads the book files from jsDelivr pinned to that tag.
- `tools/` — the scripts used to download, parse, repair and check the text.

## Format

```json
{
  "bookId": "gen",
  "nameEn": "Genesis",
  "source": "Matthew Henry's Concise Commentary on the Whole Bible (1706), public domain.",
  "intro": "Genesis is a name taken from the Greek, ...",
  "chapters": {
    "1": {
      "outline": "God creates heaven and earth. (1,2) The creation of light. (3-5) ...",
      "sections": [
        { "verseStart": 1, "verseEnd": 2, "text": "The first verse of the Bible gives us ..." }
      ]
    },
    "36": {
      "outline": "Esau and his descendants.",
      "sections": [ { "wholeChapter": true, "text": "The registers in this chapter show ..." } ]
    }
  }
}
```

- `intro` is Henry's introduction to the book (empty for a few books where the source has none).
- A section is either a verse range (`verseStart`–`verseEnd`) or `wholeChapter: true`.
- Isaiah 36, 37 and 39 repeat 2 Kings; Henry's note only points there, and the chapter has
  `seeAlso: { bookId: "2ki", chapter, verseStart?, verseEnd? }`.
- Henry's verse ranges occasionally overlap by one verse (e.g. 1 Samuel 25: 32-39, 39-44); this is as he wrote them.

## Source and checks

- Base text from biblestudytools.com (Song of Solomon from christianity.com, which uses the link targets for
  cross-references because some link labels there are wrong).
- All 1,189 chapters present: 3,992 sections, about 667,000 words.
- No single online copy is complete, so three copies were compared word by word (`tools/repair.mjs`):
  - biblestudytools.com lost words around many Bible-reference links (e.g. John 1: "This new birth is
    (1 Peter 1:23) Spirit of God as the Author" for "This new birth is through the word of God as the
    means, 1 Pe 1:23, and by the Spirit of God as the Author"); in Proverbs 24 whole notes were replaced
    by references;
  - christianity.com omits some sentences (e.g. Joshua 20, 2 Samuel 15);
  - biblehub.com sometimes cuts notes short or files a note under the wrong chapter.
  Wherever our text had nothing, or only a reference, where another copy has Henry's words, those words
  were restored (about 2,270 words in 270 places). Text from biblehub is only used when it is clearly the
  same passage. Words only in our copy are always kept. The full log of every change is in the repair
  report produced by `tools/repair.mjs`.
- References are written in one form throughout, e.g. "(2 Corinthians 5:1)" (Henry's abbreviations such as
  "2Co 5:1" are expanded).
- Where a heading is missing or mistyped in one copy, the other copy's heading was used to divide the
  text (e.g. Matthew 2:16-18, Matthew 13:24-30, John 15:26-27, Deuteronomy 3:1-11, Job 35:14-16).
- 1 Chronicles 18: "the same as 2 Samuel 19" corrected to 2 Samuel 8, as in both other copies.
- Proverbs 10–30: Henry comments verse by verse; each section's range runs to the next heading, so a note
  that also covers the following verse(s) shows the full range (e.g. Proverbs 10:1-3).
- John 3:1-21 is one long section: neither copy marks where verses 9-21 begin.
