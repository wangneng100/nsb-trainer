# NSB 听题训练

Jason's National Science Bowl math listening trainer. It reads expressions and whole questions aloud the way an NSB moderator does ("the quantity x plus 1, squared"), so he can practice parsing structure by ear. Listening and computing are trained separately.

Open `index.html` in Chrome or Safari. Nothing needs to be installed. Speech uses the browser's built-in voices (Samantha on a Mac). KaTeX and pdf.js load from a CDN, so the page needs an internet connection. To serve it locally instead:

```bash
python3 -m http.server 8791
```

## Modes
- **听写 (dictation)**: hear one expression, then pick its written form (W/X/Y/Z) or type it. The options appear only after the reading ends. Replays are allowed but recorded. A wrong answer shows both readings side by side and can play them back to back.
- **听算 (hear & answer)**: toss-up rules. Buzz with the space bar within 5 s of the reading ending, or interrupt while it is still being read. A wrong number that equals the value of a sibling structure is reported as a specific mis-parse, e.g. "you heard (5−x)² as (−x)²".
- **题库真题 (question bank)**: real or imported questions, read with the "Toss-up. Math, short answer." preface. Toss-ups use the buzz window and bonuses get 20 s. When the answer can't be auto-checked, Jason judges it himself, as a moderator would.
- **智能训练 (smart session)**: a mix of the above, with weak categories picked more often.

In every generated session, a missed item comes back 3 questions later as a fresh item of the same category.
- **读法 (reading guide)**: the reading rules, an example pair for every category, and a playground that reads any typed expression aloud.

## Categories
There are 15 confusable-structure categories (`js/cats.js`), for example (xy)² vs xy², (a+b)/c vs a+b/c, −3² vs (−3)², √(x+1) vs √x+1, 2^(x+1) vs 2^x+1, and 1/(2x) vs ½x. Each generator builds a family of expressions that sound alike but have different values and distinct readings; the tests check this for every category and level. Each category has three levels:
- L1 uses plain letters.
- L2 adds coefficients and constants.
- L3 wraps the whole family in a context such as "…, over w".

A category moves up a level when its last 6–8 answers at that level have at most one miss or replay and a median reaction time within target. It drops a level when at least half of its last 5–8 answers are wrong.

Stats (`#stats`) track per-category accuracy and median reaction time (measured from the end of the reading), plus daily volume and accuracy for the last 14 days.

## Importing questions
Use 题库 → 导入 PDF / 文本 and pick one or more NSB round PDFs. The parser follows the DOE layout: `TOSS-UP` / `1) MATH Short Answer …` / `W) X) Y) Z)` / `ANSWER: …`.
- Only Math questions are kept. Other subjects are counted and skipped.
- Superscripts and subscripts are rebuilt from their position in the PDF, so x² does not come out as "x2".
- Page headers are removed, and questions already in the bank are unchecked by default.
- Math in the question text is wrapped in `$…$`. Wrong readings can be fixed in the editor, which previews exactly what will be read aloud.
- Scanned PDFs (no text layer) won't work. Paste the text instead.

`js/seed.js` holds 42 original starter questions written in NSB style. They are not taken from real rounds.

## Data
All progress and imported questions live in the browser's localStorage. 题库 → 导出备份 / 导入备份 moves them between browsers or devices.

## Code
| File | What it does |
|---|---|
| `js/expr.js` | Expression AST: parser, LaTeX, NSB spoken reading, evaluation, equivalence |
| `js/cats.js` | The 15 categories, dictation and hear-&-answer item generators, structure tagging |
| `js/textmath.js` | Question text with `$…$` math: rendering, reading aloud, finding math in plain text, answer checking |
| `js/importer.js` | pdf.js text extraction and the NSB round parser |
| `js/speech.js` | Chunked TTS with real pauses (falls back to timed captions) |
| `js/app.js` | UI, sessions, stats, adaptive selection |

Run the tests with:

```bash
node --test tests/*.test.js
```

`tests/fixtures/sample-round.pdf` is built from `sample-round.html` with headless Chrome. The command is in that file.
