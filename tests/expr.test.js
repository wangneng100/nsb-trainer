const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/expr.js');
const C = require('../js/cats.js');

const read = s => E.transcript(E.speak(E.parse(s)));

test('NSB readings of the classic confusable pairs', () => {
  const cases = {
    '(xy)^2': 'the quantity x y, squared',
    'xy^2': 'x y squared',
    '(a+b)/c': 'the quantity a plus b, over c',
    'a+b/c': 'a plus b over c',
    'a/(b+c)': 'a over the quantity b plus c',
    'a/b+c': 'a over b, plus c',
    '(-3)^2': 'the quantity negative 3, squared',
    '-3^2': 'negative 3 squared',
    'sqrt(x+1)': 'the square root of the quantity x plus 1',
    'sqrt(x)+1': 'the square root of x, plus 1',
    '2^(x+1)': '2 to the x plus 1 power',
    '2^x+1': '2 to the x power plus 1',
    '(2^3)^2': 'the quantity 2 cubed, squared',
    '2^(3^2)': '2 to the 3 squared power',
    '1/2x': '1 over 2 x',
    '(1/2)x': 'one-half x',
    'sin^2 x': 'sine squared of x',
    'sin(x^2)': 'sine of x squared',
    '|x-3|': 'the absolute value of the quantity x minus 3',
    '|x|-3': 'the absolute value of x, minus 3',
    '(n+1)!': 'the quantity n plus 1, factorial',
    'a-(b+c)': 'a minus the quantity b plus c',
    'f(x+1)': 'f of the quantity x plus 1',
    'f(x)+1': 'f of x, plus 1',
    '8^(2/3)': '8 to the two-thirds power',
    'x^5': 'x to the 5th power',
    '3sqrt2': '3 root 2',
  };
  for (const [src, want] of Object.entries(cases)) assert.equal(read(src), want, src);
});

test('TTS chunks split at pauses', () => {
  assert.deepEqual(E.chunks(E.speak(E.parse('(xy)^2'))), ['the quantity X Y', 'squared']);
  assert.deepEqual(E.chunks(E.speak(E.parse('a/b+c'))), ['A over B', 'plus C']);
});

test('parser: precedence and notation', () => {
  const val = (s, env = {}) => E.ev(E.parse(s), env);
  assert.equal(val('-3^2'), -9);
  assert.equal(val('(-3)^2'), 9);
  assert.equal(val('2^3^2'), 512);
  assert.equal(val('1/2x', { x: 4 }), 1 / 8);
  assert.equal(val('2x^2', { x: 3 }), 18);
  assert.equal(val('3!'), 6);
  assert.equal(val('√16 + 1'), 5);
  assert.equal(val('√(9+16)'), 5);
  assert.equal(val('x² + 1', { x: 3 }), 10);
  assert.equal(val('|−5| − |2 − 7|'), 0);
  assert.equal(val('log_2 8'), 3);
  assert.equal(val('log_2(x+4)', { x: 28 }), 5);
  assert.equal(val('2 × 3 ÷ 4'), 1.5);
  assert.equal(val('(x+1)(x-1)', { x: 5 }), 24);
  assert.ok(Math.abs(val('sin x cos x', { x: 1 }) - Math.sin(1) * Math.cos(1)) < 1e-12);
  assert.ok(Math.abs(val('2pi r', { r: 1 }) - 2 * Math.PI) < 1e-12);
  assert.throws(() => E.parse('3 +'));
  assert.throws(() => E.parse('(x'));
});

test('equivalence check', () => {
  const eq = (a, b) => E.equiv(E.parse(a), E.parse(b));
  assert.ok(eq('(x+1)^2', 'x^2 + 2x + 1'));
  assert.ok(eq('(xy)^2', 'x^2y^2'));
  assert.ok(!eq('(xy)^2', 'xy^2'));
  assert.ok(eq('1/2x', '1/(2x)'));
  assert.ok(!eq('1/2x', 'x/2'));
  assert.ok(eq('(n+1)!', '(n+1)n!'));
});

test('str() round-trips through the parser', () => {
  for (const cat of C.CATS) for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 30; i++) {
    const f = C.family(cat.id, lv, false);
    for (const m of f.fam) {
      const back = E.parse(E.str(m));
      assert.equal(E.tex(back), E.tex(m), `${cat.id} L${lv}: ${E.str(m)}`);
      assert.equal(E.transcript(E.speak(back)), E.transcript(E.speak(m)), `${cat.id} L${lv}: ${E.str(m)}`);
    }
  }
});

test('every category/level yields unambiguous dictation items', () => {
  for (const cat of C.CATS) for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 60; i++) {
    const it = C.makeDict(cat.id, lv);
    assert.ok(it.options.includes(it.target));
    assert.ok(it.options.length >= 3, `${cat.id} L${lv} has ${it.options.length} options`);
    const reads = new Set(it.options.map(o => E.transcript(E.speak(o))));
    assert.equal(reads.size, it.options.length, `${cat.id} L${lv} duplicate readings`);
  }
});

test('every category yields hear-&-answer items with whole-number answers', () => {
  for (const cat of C.CATS) for (let lv = 1; lv <= 3; lv++) {
    let made = 0;
    for (let i = 0; i < 40; i++) {
      const it = C.makeCalc(cat.id, lv);
      if (!it) continue;
      made++;
      assert.ok(Number.isInteger(it.answer), `${cat.id}: ${it.answer}`);
      assert.ok(Math.abs(E.ev(it.target, it.env) - it.answer) < 1e-9);
      for (const s of it.sib) assert.ok(!(Math.abs(s.val - it.answer) < 1e-6), `${cat.id} sibling collides`);
      assert.ok(E.chunks(it.toks).length >= 1);
    }
    assert.ok(made >= 36, `${cat.id} L${lv}: only ${made}/40 calc items`);
  }
});

test('tagger finds structures in parsed text', () => {
  const tags = s => [...C.tagsOf(E.parse(s))].sort();
  assert.deepEqual(tags('(xy)^2 - xy^2'), ['pow-prod']);
  assert.deepEqual(tags('(x^2 - 9)/(x - 3)'), ['den-scope', 'num-scope']);
  assert.deepEqual(tags('-3^2 + (-3)^2'), ['neg-pow']);
  assert.deepEqual(tags('2^(x+1)'), ['exp-scope']);
});
