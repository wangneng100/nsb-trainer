const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/expr.js');
const T = require('../js/textmath.js');
const I = require('../js/importer.js');

// An original practice round laid out the way DOE NSB round PDFs are.
const ROUND = `
Sample Practice Round 3
TOSS-UP
1) MATH Short Answer What is the value of 3x^2 – 2x + 1 when x = 2?
ANSWER: 9
BONUS
1) MATH Short Answer If f(x) = x^2 + 1, what is f(x + 1) – f(x) when x = 5?
ANSWER: 11
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TOSS-UP
2) BIOLOGY Short Answer What organelle is the site of aerobic
respiration in eukaryotic cells?
ANSWER: MITOCHONDRION (ACCEPT: MITOCHONDRIA)
BONUS
2) BIOLOGY Multiple Choice Which of the following is a
prokaryote?
W) Yeast
X) Amoeba
Y) E. coli
Z) Paramecium
ANSWER: Y) E. COLI
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
TOSS-UP
3) Math – Multiple Choice Which of the following is equal to –2^4?
W) –16
X) 16
Y) –8
Z) 8
ANSWER: W) –16
BONUS
3) MATH Short Answer Solve for x: 2^(x + 1) = 32.
ANSWER: 4 (ACCEPT: x = 4)
TOSS-UP
4) PHYSICS Short Answer What is the SI unit of force?
ANSWER: NEWTON
BONUS
4) MATH Short Answer What is the area, in square units, of the triangle with vertices (0, 0), (6, 0), and (0, 4)?
ANSWER: 12
`;

test('parseNSB finds every question and keeps subjects apart', () => {
  const r = I.parseNSB(ROUND, { file: 'sample.pdf' });
  assert.equal(r.found, 8);
  assert.deepEqual(r.counts, { Math: 5, Biology: 2, Physics: 1 });
  assert.deepEqual(r.warnings, []);
  const math = r.questions.filter(q => q.subject === 'math');
  assert.deepEqual(math.map(q => `${q.type}${q.num}`), ['tossup1', 'bonus1', 'tossup3', 'bonus3', 'bonus4']);
  const mc = math.find(q => q.format === 'mc');
  assert.equal(mc.letter, 'W');
  assert.equal(mc.choices.X, '16');
  assert.equal(mc.stem, 'Which of the following is equal to –2^4?');
  const bio = r.questions.find(q => q.subject === 'bio' && q.format === 'mc');
  assert.equal(bio.stem, 'Which of the following is a prokaryote?');
  assert.equal(bio.letter, 'Y');
  assert.equal(r.questions[0].answer, '9');
});

test('autoMath marks math spans and leaves prose alone', () => {
  const cases = {
    'What is the value of 3x^2 – 2x + 1 when x = 2?': 'What is the value of $3x^2 - 2x + 1$ when $x = 2$?',
    'Solve for x: 2^(x + 1) = 32.': 'Solve for $x$: $2^(x + 1) = 32$.',
    'the triangle with vertices (0, 0), (6, 0), and (0, 4)?': 'the triangle with vertices $(0, 0)$, $(6, 0)$, and $(0, 4)$?',
    'If f(x) = x^2 + 1, what is f(x + 1) – f(x) when x = 5?': 'If $f(x) = x^2 + 1$, what is $f(x + 1) - f(x)$ when $x = 5$?',
    'A triangle has sides of length 3, 4, and 5.': 'A triangle has sides of length 3, 4, and 5.',
    'How many positive integers less than 100 are multiples of 7?': 'How many positive integers less than 100 are multiples of 7?',
    'In triangle ABC, AB = 5 and the x-axis is a line of symmetry.': 'In triangle ABC, $AB = 5$ and the x-axis is a line of symmetry.',
    'What is sin 30° plus √(49)?': 'What is $sin 30$° plus $√(49)$?',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(T.autoMath(src), want, src);
});

test('speakText reads questions with NSB conventions', () => {
  const say = s => E.transcript(T.speakText(T.autoMath(s)));
  assert.equal(say('What is the value of (2x + 1)^2 when x = 3?'), 'What is the value of the quantity 2 x plus 1, squared when x equals 3?');
  assert.equal(say('Which of the following is NOT prime?'), 'Which of the following is not prime?');
  assert.equal(say('Solve for x: 2^(x + 1) = 32.'), 'Solve for x: 2 to the x plus 1 power equals 32.');
});

test('judge compares answers numerically and by text', () => {
  assert.deepEqual(T.judge('21/2', '21/2 (ACCEPT: 10.5)'), { ok: true, sure: true });
  assert.deepEqual(T.judge('10.5', '21/2'), { ok: true, sure: true });
  assert.deepEqual(T.judge('10 1/2', '21/2'), { ok: true, sure: true });
  assert.deepEqual(T.judge('4', '$x = 4$'), { ok: true, sure: true });
  assert.deepEqual(T.judge('x=4', '4'), { ok: true, sure: true });
  assert.deepEqual(T.judge('8x', '$8x$'), { ok: true, sure: true });
  assert.deepEqual(T.judge('2x^2+5x-12', '$2x^2 + 5x - 12$'), { ok: true, sure: true });
  assert.deepEqual(T.judge('1,000', '1000'), { ok: true, sure: true });
  assert.deepEqual(T.judge('12', '12 square units'), { ok: true, sure: true });
  assert.deepEqual(T.judge('7', '9'), { ok: false, sure: true });
  assert.deepEqual(T.judge('eleven', '11'), { ok: true, sure: true });
  assert.deepEqual(T.judge('negative two', '$-2$'), { ok: true, sure: true });
  assert.deepEqual(T.judge('mitochondria', 'MITOCHONDRION (ACCEPT: MITOCHONDRIA)'), { ok: true, sure: true });
  assert.equal(T.judge('isosceles right', 'RIGHT ISOSCELES').sure, false);
});

test('linesFromItems rebuilds superscripts and subscripts', () => {
  // "x² + 3x = log₂ 8" at 12pt with the 2s set small and raised/lowered
  const it = (str, x, y, h, w) => ({ str, transform: [h, 0, 0, h, x, y], height: h, width: w });
  const items = [
    it('What is x', 72, 700, 12, 50), it('2', 122, 704, 8, 4), it(' + 3x = log', 126, 700, 12, 60),
    it('2', 186, 697, 8, 4), it(' 8?', 190, 700, 12, 14),
    it('ANSWER: 1', 72, 680, 12, 50), it('st', 122, 684, 8, 6),
  ];
  assert.deepEqual(I.linesFromItems(items), ['What is x^2 + 3x = log_2 8?', 'ANSWER: 1st']);
  // Chrome's PDFs put the space after </sub> inside the lowered run: "log", "2 ", "64"
  const tight = [it('log', 72, 700, 12, 18), it('2 ', 90, 697, 8, 7), it('64 – log', 97, 700, 12, 40), it('2', 137, 697, 8, 4), it(' 8', 141, 700, 12, 9)];
  assert.deepEqual(I.linesFromItems(tight), ['log_2 64 – log_2 8']);
});

test('stripRepeated removes page headers but not question markers', () => {
  const pages = [1, 2, 3, 4].map(p => [`2026 Practice Set – Round 3 – Page ${p}`, 'TOSS-UP', `${p}) MATH Short Answer …`, 'ANSWER: 1']);
  const out = I.stripRepeated(pages);
  assert.ok(out.every(p => !p.some(l => /Page/.test(l))));
  assert.ok(out.every(p => p.includes('TOSS-UP') && p.includes('ANSWER: 1')));
});

test('toBankItem marks math and tags structures', () => {
  const r = I.parseNSB(ROUND);
  const q = I.toBankItem(r.questions[0]);
  assert.equal(q.text, 'What is the value of $3x^2 - 2x + 1$ when $x = 2$?');
  const b = I.toBankItem(r.questions.find(x => x.num === 3 && x.type === 'bonus'));
  assert.deepEqual(b.tags, ['exp-scope']);
  const mc = I.toBankItem(r.questions.find(x => x.format === 'mc' && x.subject === 'math'));
  assert.deepEqual(mc.tags, ['neg-pow']);
});
