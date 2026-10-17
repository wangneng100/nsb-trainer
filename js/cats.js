/* NSB Math Trainer — confusable-structure categories and item generators.
 * Each category builds a "family": expressions that differ only in structure, so they read
 * almost the same aloud but have different values — (xy)² / xy² / x²y.  A dictation item asks
 * which member was read; a hear-&-answer item gives values and asks for the number, and a
 * wrong answer that matches a sibling tells us exactly which mis-parse happened. */
(function (G) {
  'use strict';
  const E = G.NSBE || require('./expr.js');
  const { N, V, add, sub, mul, div, pow, neg, root, fn, abs, fact, rel, W, PAUSE } = E;

  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const VARSETS = [['x', 'y', 'z'], ['a', 'b', 'c'], ['p', 'q', 'r'], ['x', 'y', 't']];
  const vs = () => pick(VARSETS).map(V);
  const k = (lo = 2, hi = 6) => N(ri(lo, hi));
  const e23 = () => N(pick([2, 3]));
  const coprimePair = () => pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [5, 6], [2, 7], [3, 8]]);
  const properPair = () => pick([[2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [5, 6], [2, 7], [3, 8]]);
  const twoDiff = () => shuffle([2, 3]); // (b^a)^c = b^(a^c) = b^a·b^c when a = c = 2
  const TRIG = ['sin', 'cos', 'tan'];
  const logVal = () => pick([2, 3, 4, 8, 9, 16, 27, 32, 81]);
  const small = () => ri(2, 4);

  // A template returns a family (array of AST).  calc:false = no integer answers (trig) → dictation only.
  // f: the family uses a function f(x) that gets defined in the question; neg: variables may be negative;
  // val: how to draw variable values when computing (default 1–9).
  const T = (build, o = {}) => ({ build, ...o });

  const CATS = [
    {
      id: 'pow-prod', name: 'Power of a Product', zh: 'Power of a Product', eg: '(xy)^2 vs xy^2',
      tip: "Only the entire term enclosed by 'the quantity...' is raised to the power; without 'quantity', 'squared' applies only to the immediately preceding letter.",
      L: [[
        T(() => { const [u, v] = vs(), e = e23(); return [pow(mul(u, v), e), mul(u, pow(v, e)), mul(pow(u, e), v)]; }),
        T(() => { const [u] = vs(), c = k(2, 5), e = e23(); return [pow(mul(c, u), e), mul(c, pow(u, e)), pow(add(c, u), e)]; }),
      ], [
        T(() => { const [u, v] = vs(), c = k(2, 5), e = N(2); return [pow(mul(c, u, v), e), mul(c, pow(mul(u, v), e)), mul(c, u, pow(v, e)), mul(v, pow(mul(c, u), e))]; }),
      ]],
    },
    {
      id: 'sum-pow', name: 'Power of a Sum', zh: 'Power of a Sum', eg: '(x+y)^2 vs x+y^2',
      tip: "'the quantity x plus y, squared' squares the whole sum; 'x plus y squared' only squares y.",
      L: [[
        T(() => { const [u, v] = vs(), e = e23(); return [pow(add(u, v), e), add(u, pow(v, e)), add(pow(u, e), pow(v, e)), add(pow(u, e), v)]; }),
      ], [
        T(() => { const [u] = vs(), c = k(2, 6); return [pow(sub(u, c), 2), sub(u, pow(c, 2)), sub(pow(u, 2), pow(c, 2)), sub(pow(u, 2), c)]; }, { neg: true }),
        T(() => { const [u, v] = vs(), c = k(2, 4); return [pow(add(mul(c, u), v), 2), add(mul(c, u), pow(v, 2)), mul(c, pow(add(u, v), 2)), add(pow(mul(c, u), 2), v)]; }),
      ]],
    },
    {
      id: 'num-scope', name: 'Numerator Scope', zh: 'Numerator Scope', eg: '(a+b)/c vs a+b/c',
      tip: "'the quantity a plus b, over c' makes the entire sum the numerator; 'a plus b over c' only divides b.",
      L: [[
        T(() => { const [u, v, w] = vs(); return [div(add(u, v), w), add(u, div(v, w)), add(div(u, w), v)]; }),
      ], [
        T(() => { const [u, v] = vs(), c = k(2, 5), m = k(1, 7); return [div(add(mul(c, u), m), v), add(mul(c, u), div(m, v)), add(div(mul(c, u), v), m), div(mul(c, add(u, m)), v)]; }),
      ]],
    },
    {
      id: 'den-scope', name: 'Denominator Scope', zh: 'Denominator Scope', eg: 'a/(b+c) vs a/b+c',
      tip: "'over the quantity b plus c' makes the sum the denominator; 'over b, plus c' adds c after a pause. 'over b c' makes the denominator a product.",
      L: [[
        T(() => { const [u, v, w] = vs(); return [div(u, add(v, w)), add(div(u, v), w), div(u, mul(v, w)), mul(div(u, v), w)]; }),
      ], [
        T(() => { const [u, v] = vs(), c = k(1, 6); return [div(u, sub(v, c)), sub(div(u, v), c), div(sub(u, c), v), sub(u, div(c, v))]; }),
      ]],
    },
    {
      id: 'neg-pow', name: 'Negative Sign and Power', zh: 'Negative Sign and Power', eg: '(-3)^2 vs -3^2',
      tip: "'negative 3 squared' = −9: square first, then negate. Only 'the quantity negative 3, squared' is 9.",
      L: [[
        T(() => { const [u] = vs(), c = k(2, 6); return [pow(neg(u), 2), neg(pow(u, 2)), pow(sub(c, u), 2), sub(c, pow(u, 2))]; }, { neg: true }),
        T(() => { const c = k(2, 9); return [pow(neg(c), 2), neg(pow(c, 2)), pow(neg(c), 3)]; }),
      ], [
        T(() => { const [u] = vs(), c = k(2, 5); return [pow(neg(mul(c, u)), 2), neg(mul(c, pow(u, 2))), neg(pow(mul(c, u), 2)), mul(u, pow(neg(c), 2))]; }, { neg: true }),
      ]],
    },
    {
      id: 'root-scope', name: 'Radical Scope', zh: 'Radical Scope', eg: '√(x+1) vs √x+1',
      tip: "'the square root of the quantity x plus 1' roots the whole sum; 'the square root of x, plus 1' adds 1 after a pause.",
      L: [[
        T(() => { const [u] = vs(), c = k(2, 9); return [root(add(u, c)), add(root(u), c), root(mul(c, u)), mul(c, root(u))]; }),
      ], [
        T(() => { const [u] = vs(), c = k(2, 5), m = k(1, 9); return [root(add(mul(c, u), m)), add(root(mul(c, u)), m), mul(c, root(add(u, m))), add(mul(u, root(c)), m)]; }),
      ]],
    },
    {
      id: 'exp-scope', name: 'Exponent Scope', zh: 'Exponent Scope', eg: '2^(x+1) vs 2^x+1',
      tip: "'to the x plus 1 power' — 'power' is at the end, so everything in between is the exponent; 'to the x power, plus 1' means the exponent is only x.",
      L: [[
        T(() => { const [u] = vs(), b = k(2, 5), m = k(1, 3); return [pow(b, add(u, m)), add(pow(b, u), m), pow(b, mul(m.v === 1 ? N(2) : m, u)), mul(m.v === 1 ? N(2) : m, pow(b, u))]; }),
      ], [
        T(() => { const [u, v] = vs(), c = k(2, 3); return [pow(u, add(v, c)), add(pow(u, v), c), pow(u, mul(c, v)), mul(pow(u, c), v)]; }),
      ]],
    },
    {
      id: 'pow-tower', name: 'Power of a Power', zh: 'Power of a Power', eg: '(2^3)^2 vs 2^(3^2)',
      tip: "'the quantity 2 cubed, squared' = 2⁶; '2 to the 3 squared power' = 2⁹.",
      L: [[
        T(() => { const b = k(2, 3), [a, c] = twoDiff().map(N); return [pow(pow(b, a), c), pow(b, pow(a, c)), mul(pow(b, a), pow(b, c)), mul(pow(b, a), c)]; }),
      ], [
        T(() => { const [u] = vs(), [a, c] = pick([[2, 3], [3, 2], [4, 2], [4, 3]]).map(N); return [pow(pow(u, a), c), pow(u, pow(a, c)), mul(pow(u, a), pow(u, c)), mul(c, pow(u, a))]; }),
      ]],
    },
    {
      id: 'frac-pow', name: 'Power of a Fraction', zh: 'Power of a Fraction', eg: '(x/y)^2 vs x^2/y vs x/y^2',
      tip: "'the quantity x over y, squared' squares both numerator and denominator; 'x squared over y' and 'x over y squared' only square one side.",
      L: [[
        T(() => { const [u, v] = vs(), e = e23(); return [pow(div(u, v), e), div(pow(u, e), v), div(u, pow(v, e))]; }),
        T(() => { const [a, b] = properPair(); return [pow(div(a, b), 2), div(pow(a, 2), b), div(a, pow(b, 2))]; }),
      ], [
        T(() => { const [u, v] = vs(), c = k(2, 4), e = N(2); return [pow(div(mul(c, u), v), e), div(mul(c, pow(u, e)), v), mul(c, pow(div(u, v), e)), div(pow(mul(c, u), e), v)]; }),
      ]],
    },
    {
      id: 'implied-div', name: 'Coefficient and Fraction', zh: 'Coefficient and Fraction', eg: '1/(2x) vs ½x',
      tip: "'1 over 2 x' has 2x as the denominator; 'one-half x' is half of x. NSB often reads fractions as one-half, two-thirds.",
      L: [[
        T(() => { const [u] = vs(), m = k(2, 9); return [div(1, mul(m, u)), mul(div(1, m), u), div(m, u), div(1, add(m, u))]; }),
      ], [
        T(() => { const [u] = vs(), [a, b] = coprimePair(); return [div(a, mul(b, u)), mul(div(a, b), u), div(a, add(b, u)), add(div(a, b), u)]; }),
      ]],
    },
    {
      id: 'fn-arg', name: 'Function Scope', zh: 'Function Scope', eg: 'f(x+1) vs f(x)+1',
      tip: "'f of the quantity x plus 1' has x+1 as the argument; 'f of x, plus 1' adds 1 after a pause. '2 sine of x' ≠ 'sine of 2x'.",
      L: [[
        T(() => { const c = k(1, 4), m = k(2, 3), x = V('x'); return [fn('f', add(x, c)), add(fn('f', x), c), fn('f', mul(m, x)), mul(m, fn('f', x))]; }, { f: true }),
      ], [
        T(() => { const [u] = vs(), b = pick([2, 3]), c = k(2, 4); return [fn('log', add(u, c), { base: b }), add(fn('log', u, { base: b }), c), fn('log', mul(c, u), { base: b }), mul(c, fn('log', u, { base: b }))]; }, { val: logVal }),
        T(() => { const [u] = vs(), f = pick(TRIG), c = k(2, 4); return [fn(f, mul(c, u)), mul(c, fn(f, u)), fn(f, add(u, c)), add(fn(f, u), c)]; }, { calc: false }),
      ]],
    },
    {
      id: 'fn-pow', name: 'Power of a Function', zh: 'Power of a Function', eg: 'sin²x vs sin(x²)',
      tip: "'sine squared of x' is (sin x)²; 'sine of x squared' is sin(x²). Same applies to log.",
      L: [[
        T(() => { const [u] = vs(), f = pick(TRIG); return [fn(f, u, { p: 2 }), fn(f, pow(u, 2)), fn(f, mul(2, u)), mul(2, fn(f, u))]; }, { calc: false }),
      ], [
        T(() => { const [u] = vs(), b = pick([2, 3]); return [fn('log', u, { base: b, p: 2 }), fn('log', pow(u, 2), { base: b }), fn('log', mul(b, u), { base: b })]; }, { val: logVal }),
      ]],
    },
    {
      id: 'abs-scope', name: 'Absolute Value Scope', zh: 'Absolute Value Scope', eg: '|x−3| vs |x|−3',
      tip: "'the absolute value of the quantity x minus 3' takes the absolute value of the whole; 'the absolute value of x, minus 3' subtracts after a pause.",
      L: [[
        T(() => { const [u] = vs(), c = k(2, 7); return [abs(sub(u, c)), sub(abs(u), c), abs(add(u, c)), add(abs(u), c)]; }, { neg: true }),
      ], [
        T(() => { const [u] = vs(), c = k(2, 4), m = k(1, 7); return [abs(add(mul(c, u), m)), add(mul(c, abs(u)), m), mul(c, abs(add(u, m)))]; }, { neg: true }), // |cx| = c|x|, so no 4th
      ]],
    },
    {
      id: 'fact-scope', name: 'Factorial Scope', zh: 'Factorial Scope', eg: '(n+1)! vs n+1!',
      tip: "'the quantity n plus 1, factorial' is (n+1)!; 'n plus 1 factorial' is n + 1!.",
      L: [[
        T(() => { const [u] = vs(), c = k(1, 3), m = k(2, 3); return [fact(add(u, c)), add(u, fact(c)), fact(mul(m, u)), mul(m, fact(u))]; }),
        T(() => { const a = k(2, 3), b = N(pick([2, 3, 4].filter(x => x !== a.v))); return [fact(add(a, b)), add(a, fact(b)), fact(mul(a, b)), mul(a, fact(b))]; }),
      ], [
        T(() => { const [u] = vs(); return [pow(fact(u), 2), fact(pow(u, 2)), fact(mul(2, u)), mul(2, fact(u))]; }),
      ]],
    },
    {
      id: 'minus-scope', name: 'Minus Sign Scope', zh: 'Minus Sign Scope', eg: 'a−(b+c) vs a−b+c',
      tip: "'minus the quantity b plus c' subtracts the whole b+c; without 'quantity', it only subtracts b.",
      L: [[
        T(() => { const [u, v, w] = vs(); return [sub(u, add(v, w)), add(sub(u, v), w), mul(sub(u, v), w), sub(u, mul(v, w))]; }),
      ], [
        T(() => { const [u] = vs(), c = k(2, 6), m = k(1, 9); return [mul(c, sub(u, m)), sub(mul(c, u), m), sub(c, sub(u, m)), sub(sub(c, u), m)]; }),
      ]],
    },
  ];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

  // Level 3: wrap every member of a level-2 family in the same outer context.
  const CONTEXTS = [
    (m, r) => add(m, N(r.c)),
    (m, r) => sub(N(r.c), m),
    (m, r) => div(m, V(r.w)),
  ];

  const texKey = n => E.tex(n);
  const readKey = n => E.transcript(E.speak(n));
  const F_DEFS = [
    () => { const a = ri(2, 4), b = ri(1, 5); return { body: add(mul(a, V('x')), b), fn: x => a * x + b }; },
    () => { const b = ri(1, 5); return { body: add(pow(V('x'), 2), b), fn: x => x * x + b }; },
    () => { const a = ri(2, 3); return { body: mul(a, pow(V('x'), 2)), fn: x => a * x * x }; },
    () => { const a = ri(1, 4); return { body: sub(pow(V('x'), 2), mul(a, V('x'))), fn: x => x * x - a * x }; },
  ];

  // Members must read differently and have different values (otherwise the item is ambiguous).
  function distinct(fam, env) {
    for (let i = 0; i < fam.length; i++) for (let j = i + 1; j < fam.length; j++) {
      if (texKey(fam[i]) === texKey(fam[j]) || readKey(fam[i]) === readKey(fam[j])) return false;
      if (E.equiv(fam[i], fam[j], env)) return false;
    }
    return true;
  }

  function family(catId, level, forCalc) {
    const cat = CAT[catId];
    const lv = Math.min(level, 3);
    const pool = cat.L[Math.min(lv, cat.L.length) - 1].filter(t => !forCalc || t.calc !== false);
    const alt = cat.L.flat().filter(t => !forCalc || t.calc !== false);
    for (let tries = 0; tries < 40; tries++) {
      const tpl = pick(pool.length ? pool : alt);
      let fam = tpl.build();
      let fdef = null;
      const env = {};
      if (tpl.f) { fdef = pick(F_DEFS)(); env.$f = { f: fdef.fn }; }
      if (lv >= 3 && tries < 30) {
        const r = { c: ri(2, 5), w: pick(['w', 'z', 'c'].filter(w => !fam.some(m => E.vars(m).has(w)))) || 'w' };
        const ctx = pick(CONTEXTS);
        fam = fam.map(m => ctx(m, r));
      }
      if (distinct(fam, env)) return { fam, tpl, fdef, env };
    }
    return null;
  }

  // ───────── dictation: hear it, pick (or type) the written form ─────────
  function makeDict(catId, level) {
    const f = family(catId, level, false);
    const target = pick(f.fam);
    const options = shuffle([target, ...shuffle(f.fam.filter(m => m !== target)).slice(0, 3)]);
    return {
      mode: 'dict', cat: catId, lvl: level, target, options, env: f.env,
      toks: E.speak(target),
    };
  }

  // ───────── hear & answer: values + expression → one number ─────────
  const isWhole = v => isFinite(v) && Math.abs(v - Math.round(v)) < 1e-9;
  function valueToks(env, names) {
    const parts = names.map(n => [...E.speak(V(n)), W('equals'), ...E.speak(E.lift(env[n]))]);
    const out = [];
    parts.forEach((p, i) => {
      if (i > 0) out.push(...(i === parts.length - 1 ? (parts.length > 2 ? [PAUSE, W('and')] : [W('and')]) : [PAUSE]));
      out.push(...p);
    });
    return out;
  }
  function makeCalc(catId, level) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const lv = attempt > 6 ? Math.max(1, level - 1) : level;
      const f = family(catId, lv, true);
      if (!f) continue;
      const names = [...new Set(f.fam.flatMap(m => [...E.vars(m)]))].sort();
      const big = catId === 'pow-tower' || catId === 'fact-scope' ? 50000 : 2000;
      // some members never come out whole (1/(2x)), so try each member as the target
      for (const target of shuffle(f.fam)) for (let t = 0; t < 150; t++) {
        const env = { ...f.env };
        const draw = f.tpl.val || (catId === 'fact-scope' || catId === 'pow-tower' ? small : f.tpl.neg ? () => pick([-1, 1]) * ri(2, 9) : () => ri(2, 9));
        names.forEach(n => { env[n] = draw(); });
        if (t < 120 && new Set(names.map(n => env[n])).size < names.length) continue; // x = y = 3 hides structure
        const val = E.ev(target, env);
        if (!isWhole(val) || Math.abs(val) > big) continue;
        const sib = f.fam.filter(m => m !== target).map(m => ({ node: m, val: E.ev(m, env) }));
        if (sib.some(s => isFinite(s.val) && Math.abs(s.val - val) < 1e-6)) continue;
        return {
          mode: 'calc', cat: catId, lvl: lv, target, sib, env, names, answer: Math.round(val), fdef: f.fdef,
          toks: calcToks(target, env, names, f.fdef),
        };
      }
    }
    return null;
  }
  function calcToks(target, env, names, fdef) {
    const expr = E.speak(target);
    const vals = valueToks(env, names);
    const def = fdef ? [W('If'), ...E.speak(rel('=', fn('f', V('x')), fdef.body)), PAUSE] : [];
    if (!names.length) return Math.random() < 0.5 ? [W('What is'), ...expr, W('?', '')] : [W('Evaluate'), ...expr];
    if (fdef || Math.random() < 0.5) {
      return [...def, W(fdef ? 'what is' : 'What is the value of'), ...expr, PAUSE, W('when'), ...vals, W('?', '')];
    }
    return [W('If'), ...vals, PAUSE, W('what is the value of'), ...expr, W('?', '')];
  }

  // ───────── tagging (imported questions → categories) ─────────
  function tagsOf(n, out = new Set()) {
    if (!n || typeof n !== 'object') return out;
    const nonAtom = x => !E.isAtom(x);
    switch (n.k) {
      case 'pow':
        if (n.a.k === 'mul') out.add('pow-prod');
        if (n.a.k === 'add') out.add('sum-pow');
        if (n.a.k === 'neg') out.add('neg-pow');
        if (n.a.k === 'pow' || n.b.k === 'pow') out.add('pow-tower');
        if (n.a.k === 'div' && !E.isWordFrac(n.a)) out.add('frac-pow');
        if (['add', 'mul', 'div'].includes(n.b.k) && !E.isWordFrac(n.b)) out.add('exp-scope');
        if (n.a.k === 'fn') out.add('fn-pow');
        break;
      case 'neg': if (n.x.k === 'pow') out.add('neg-pow'); break;
      case 'div':
        if (n.a.k === 'add') out.add('num-scope');
        if (n.b.k === 'add') out.add('den-scope');
        if (n.b.k === 'mul') out.add('implied-div');
        if (n.a.k === 'pow' || n.b.k === 'pow') out.add('frac-pow');
        break;
      case 'mul': if (n.fs.some(E.isWordFrac)) out.add('implied-div'); break;
      case 'root': if (n.x.k === 'add') out.add('root-scope'); break;
      case 'fn':
        if (n.p || (n.x.k === 'pow')) out.add('fn-pow');
        if (['add', 'mul'].includes(n.x.k)) out.add('fn-arg');
        break;
      case 'abs': if (n.x.k === 'add') out.add('abs-scope'); break;
      case 'fact': if (nonAtom(n.x)) out.add('fact-scope'); break;
      case 'add': if (n.terms.some((t, i) => i > 0 && t.s < 0 && t.x.k === 'add')) out.add('minus-scope'); break;
    }
    for (const key of ['a', 'b', 'x', 'p', 'base']) if (n[key]) tagsOf(n[key], out);
    (n.terms || []).forEach(t => tagsOf(t.x, out));
    (n.fs || n.xs || []).forEach(f => tagsOf(f, out));
    return out;
  }
  const C = { CATS, CAT, family, makeDict, makeCalc, tagsOf, distinct, shuffle, pick, ri };
  G.NSBC = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
