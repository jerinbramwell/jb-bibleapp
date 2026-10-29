# Matthew Henry's Concise Commentary — data files

Matthew Henry's *Concise Commentary on the Whole Bible* (1706, public domain), one JSON file per book,
for the app's Study Center → Study Notes. These files are meant to be hosted (e.g. GitHub + jsDelivr) and
loaded by the app on demand; they are not part of the app's source code.

- `en/<bookId>.json` — English original. Book ids match the app (`gen`, `exo`, … `joh`, … `rev`).
- `en/index.json` — list of books with chapter/section counts and file sizes.
- `tools/` — the scripts used to download, parse and check the text.

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

- Text from biblestudytools.com (Song of Solomon from christianity.com, which uses the link targets for
  cross-references because some link labels there are wrong).
- All 1,189 chapters present: 3,569 sections, about 666,000 words.
- Cross-checked a random sample of chapters against christianity.com's copy: 97–100% identical wording and
  identical verse sections. Where they differ (e.g. Joshua 20, 2 Samuel 15), christianity.com omits
  sentences that this copy has.
