/* NSB 听题训练 — expression engine.
 * One AST, four views: LaTeX (for KaTeX), the spoken NSB reading ("the quantity", pauses),
 * a numeric value, and a parser-compatible plain-text form. The parser turns typed answers
 * and question text back into the same AST. */
(function (G) {
  'use strict';

  // ───────── AST builders ─────────
  // num {v} · var {n} · add {terms:[{s:±1,x}]} · mul {fs} · div {a,b} · pow {a,b} · neg {x}
  // root {x,n} · fn {f,x,p?,base?} · abs {x} · fact {x} · rel {op,a,b} · tuple {xs}
  // `g: true` marks a node that came from explicit parentheses, so sums/products don't flatten into it.
  const N = v => ({ k: 'num', v });
  const V = n => ({ k: 'var', n });
  const lift = x => typeof x === 'number' ? (x < 0 ? neg(N(-x)) : N(x)) : typeof x === 'string' ? V(x) : x;
  function add(...xs) {
    const terms = [];
    for (let x of xs) {
      let s = 1;
      if (Array.isArray(x)) { s = x[0] === '-' ? -1 : 1; x = x[1]; }
      x = lift(x);
      if (x.k === 'add' && s === 1 && !x.g) terms.push(...x.terms);
      else terms.push({ s, x });
    }
    return terms.length === 1 && terms[0].s === 1 ? terms[0].x : { k: 'add', terms };
  }
  const sub = (a, b) => add(a, ['-', b]);
  function mul(...xs) {
    const fs = [];
    for (let x of xs) { x = lift(x); if (x.k === 'mul' && !x.g) fs.push(...x.fs); else fs.push(x); }
    return fs.length === 1 ? fs[0] : { k: 'mul', fs };
  }
  const div = (a, b) => ({ k: 'div', a: lift(a), b: lift(b) });
  const pow = (a, b) => ({ k: 'pow', a: lift(a), b: lift(b) });
  const neg = x => ({ k: 'neg', x: lift(x) });
  const root = (x, n = 2) => ({ k: 'root', x: lift(x), n });
  const fn = (f, x, o = {}) => { const r = { k: 'fn', f, x: lift(x) }; if (o.p != null) r.p = lift(o.p); if (o.base != null) r.base = lift(o.base); return r; };
  const abs = x => ({ k: 'abs', x: lift(x) });
  const fact = x => ({ k: 'fact', x: lift(x) });
  const rel = (op, a, b) => ({ k: 'rel', op, a: lift(a), b: lift(b) });
  const grouped = x => ({ ...x, g: true });

  const isAtom = n => n.k === 'num' || n.k === 'var';
  const isInt = v => Number.isInteger(v);
  const fmtNum = v => isInt(v) ? String(v) : String(+v.toFixed(6));

  // ───────── number words (fractions are read the NSB way: "three-fourths") ─────────
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const DEN = { 2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['fourth', 'fourths'], 5: ['fifth', 'fifths'], 6: ['sixth', 'sixths'], 7: ['seventh', 'sevenths'], 8: ['eighth', 'eighths'], 9: ['ninth', 'ninths'], 10: ['tenth', 'tenths'], 11: ['eleventh', 'elevenths'], 12: ['twelfth', 'twelfths'] };
  const isWordFrac = n => n.k === 'div' && n.a.k === 'num' && n.b.k === 'num' && isInt(n.a.v) && isInt(n.b.v)
    && n.a.v > 0 && n.a.v < 20 && DEN[n.b.v] && n.a.v % n.b.v !== 0;
  const fracWords = (a, b) => `${ONES[a]}-${DEN[b][a === 1 ? 0 : 1]}`;
  function ordinal(v) {
    const sp = { 1: 'first', 2: 'second', 3: 'third', 0: 'zeroth' };
    if (sp[v]) return sp[v];
    const t = v % 100;
    return v + (t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th'));
  }

  // ───────── LaTeX ─────────
  const TEXFN = { sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot', log: '\\log', ln: '\\ln' };
  const TEXREL = { '=': '=', '<': '<', '>': '>', '≤': '\\le', '≥': '\\ge', '≠': '\\ne' };
  const TEXVAR = { 'π': '\\pi', 'θ': '\\theta', 'α': '\\alpha', 'β': '\\beta' };
  const par = s => `\\left(${s}\\right)`;
  const leadsWithDigit = n => n.k === 'num' || (n.k === 'pow' && leadsWithDigit(n.a)) || (n.k === 'fact' && n.x.k === 'num')
    || (n.k === 'mul' && leadsWithDigit(n.fs[0]));
  function tex(n) {
    switch (n.k) {
      case 'num': return fmtNum(n.v);
      case 'var': return TEXVAR[n.n] || n.n;
      case 'add': return n.terms.map((t, i) => {
        let b = tex(t.x);
        if (t.x.k === 'add' || t.x.k === 'rel' || (t.x.k === 'neg' && (i > 0 || t.s < 0))) b = par(b);
        return i === 0 ? (t.s < 0 ? '-' : '') + b : (t.s < 0 ? ' - ' : ' + ') + b;
      }).join('');
      case 'mul': return n.fs.map((f, i) => {
        const last = i === n.fs.length - 1;
        let b = f.k === 'fn' ? texFn(f, !last) : tex(f);
        if (f.k === 'add' || f.k === 'rel' || (f.k === 'neg' && i > 0)) b = par(b);
        if (i === 0) return b;
        const prev = n.fs[i - 1];
        const dot = leadsWithDigit(f) || f.k === 'div' || prev.k === 'fact' || f.k === 'fact' && !isAtom(f.x);
        return (dot ? ' \\cdot ' : ' ') + b;
      }).join('');
      case 'div': return `\\frac{${tex(n.a)}}{${tex(n.b)}}`;
      case 'pow': return `${isAtom(n.a) ? tex(n.a) : par(tex(n.a))}^{${tex(n.b)}}`;
      case 'neg': return '-' + (n.x.k === 'add' || n.x.k === 'neg' ? par(tex(n.x)) : tex(n.x));
      case 'root': return n.n === 2 ? `\\sqrt{${tex(n.x)}}` : `\\sqrt[${n.n}]{${tex(n.x)}}`;
      case 'fn': return texFn(n, false);
      case 'abs': return `\\left|${tex(n.x)}\\right|`;
      case 'fact': return (isAtom(n.x) ? tex(n.x) : par(tex(n.x))) + '!';
      case 'rel': return `${tex(n.a)} ${TEXREL[n.op] || n.op} ${tex(n.b)}`;
      case 'tuple': return par(n.xs.map(tex).join(', '));
    }
    return '?';
  }
  function texFn(n, forceParen) {
    let h = TEXFN[n.f] || n.f;
    if (n.p) h += `^{${tex(n.p)}}`;
    if (n.base) h += `_{${tex(n.base)}}`;
    const bare = isAtom(n.x) && !forceParen && TEXFN[n.f];
    return bare ? `${h} ${tex(n.x)}` : `${h}${par(tex(n.x))}`;
  }

  // ───────── plain text (parser-compatible) ─────────
  function str(n) {
    const wrap = (x, ok) => ok ? str(x) : `(${str(x)})`;
    switch (n.k) {
      case 'num': return fmtNum(n.v);
      case 'var': return n.n === 'π' ? 'pi' : n.n === 'θ' ? 'theta' : n.n;
      case 'add': return n.terms.map((t, i) => {
        const b = wrap(t.x, t.x.k !== 'add' && t.x.k !== 'rel' && !(t.x.k === 'neg' && (i > 0 || t.s < 0)));
        return i === 0 ? (t.s < 0 ? '-' : '') + b : (t.s < 0 ? ' - ' : ' + ') + b;
      }).join('');
      case 'mul': return n.fs.map((f, i) => {
        const b = wrap(f, !['add', 'rel', 'div'].includes(f.k) && !(f.k === 'neg' && i > 0));
        if (i === 0) return b;
        const prev = n.fs[i - 1];
        return (leadsWithDigit(f) || f.k === 'neg' || prev.k === 'fact' || prev.k === 'fn' ? '*' : '') + b;
      }).join('');
      case 'div': {
        const ok = x => isAtom(x) || ['pow', 'fn', 'root', 'abs', 'fact'].includes(x.k);
        return `${wrap(n.a, ok(n.a))}/${wrap(n.b, ok(n.b))}`;
      }
      case 'pow': return `${wrap(n.a, isAtom(n.a))}^${wrap(n.b, isAtom(n.b))}`;
      case 'neg': return '-' + wrap(n.x, !['add', 'neg', 'div'].includes(n.x.k));
      case 'root': return `${n.n === 3 ? 'cbrt' : 'sqrt'}(${str(n.x)})`;
      case 'fn': return `${n.f}${n.p ? '^' + wrap(n.p, isAtom(n.p)) : ''}${n.base ? '_' + wrap(n.base, isAtom(n.base)) : ''}(${str(n.x)})`;
      case 'abs': return `|${str(n.x)}|`;
      case 'fact': return `${wrap(n.x, isAtom(n.x))}!`;
      case 'rel': return `${str(n.a)} ${n.op} ${str(n.b)}`;
      case 'tuple': return `(${n.xs.map(str).join(', ')})`;
    }
    return '?';
  }

  // ───────── spoken NSB reading ─────────
  // Tokens: {w: shown, s: spoken, c: cue} or PAUSE. A pause marks the end of a grouped piece
  // ("the quantity x plus 1, squared"); the TTS layer turns it into a real silence.
  const PAUSE = { p: 1 };
  const W = (w, s = w, c = 0) => ({ w, s, c });
  const SAYVAR = { 'π': 'pi', 'θ': 'theta', 'α': 'alpha', 'β': 'beta' };
  const FNSAY = { sin: 'sine', cos: 'cosine', tan: 'tangent', sec: 'secant', csc: 'cosecant', cot: 'cotangent', log: 'log' };
  const RELSAY = { '=': 'equals', '<': 'is less than', '>': 'is greater than', '≤': 'is less than or equal to', '≥': 'is greater than or equal to', '≠': 'is not equal to' };
  const varTok = n => W(n, SAYVAR[n] || (/^[a-z]$/i.test(n) ? n.toUpperCase() : n));

  // Things that can follow "the square root of", "over", "sine of" … without "the quantity":
  // a symbol, a symbol with a simple power (x², 2⁵), or a monomial (3xy²).
  const simplePow = n => n.k === 'pow' && isAtom(n.a) && isAtom(n.b);
  function isTight(n) {
    if (isAtom(n) || simplePow(n)) return true;
    if (n.k === 'mul') return n.fs.every((f, i) => (f.k === 'num' && i === 0) || f.k === 'var' || (simplePow(f) && f.a.k === 'var'));
    return false;
  }
  const selfScoped = n => ['root', 'fn', 'abs'].includes(n.k) || (n.k === 'fact' && isAtom(n.x));
  // readings that end in a pause (so a following factor needs "times")
  const endsScoped = n => ['root', 'fn', 'abs', 'add', 'rel'].includes(n.k) || (n.k === 'div' && !isWordFrac(n))
    || (n.k === 'pow' && !isAtom(n.b) && n.b.k !== 'neg' && !isWordFrac(n.b));
  const quantity = x => [W('the quantity', 'the quantity', 1), ...rd(x), PAUSE];
  // Argument of a root / function / absolute value. A power of a quantity is allowed as-is, so
  // √((x+1)²) is "the square root of the quantity x plus 1, squared" rather than a double quantity.
  const arg = x => isTight(x) || selfScoped(x) || x.k === 'pow' ? rd(x) : quantity(x);
  const trimP = t => { while (t.length && t[t.length - 1].p) t = t.slice(0, -1); return t; };

  function expPhrase(e) {
    if (e.k === 'num' && isInt(e.v)) {
      if (e.v === 2) return [W('squared')];
      if (e.v === 3) return [W('cubed')];
      return [W('to the'), W(ordinal(e.v)), W('power')];
    }
    if (e.k === 'neg' && e.x.k === 'num') return [W('to the'), W('negative'), ...rd(e.x), W('power')];
    if (e.k === 'var' || isWordFrac(e)) return [W('to the'), ...rd(e), W('power')];
    return [W('to the'), ...trimP(rd(e)), W('power'), PAUSE];
  }

  function rd(n) {
    switch (n.k) {
      case 'num': return [W(fmtNum(n.v))];
      case 'var': return [varTok(n.n)];
      case 'add': {
        const out = [];
        n.terms.forEach((t, i) => {
          const body = t.x.k === 'add' ? quantity(t.x) : rd(t.x);
          if (i === 0) out.push(...(t.s < 0 ? [W('negative'), ...body] : body));
          else out.push(W(t.s < 0 ? 'minus' : 'plus'), ...body);
        });
        return out;
      }
      case 'mul': {
        const out = [];
        n.fs.forEach((f, i) => {
          const prev = n.fs[i - 1];
          if (f.k === 'root' && f.n === 2 && isAtom(f.x) && prev && prev.k === 'num') { // 3 root 2
            out.push(W('root'), ...rd(f.x), PAUSE); return;
          }
          if (i > 0) {
            if (endsScoped(prev)) out.push(PAUSE, W('times'));
            else if (prev.k === 'num' && f.k === 'fn') { /* 2 sine of x */ }
            else if (juxPrev(prev) && juxNext(f)) { /* 3 x y */ }
            else out.push(W('times'));
          }
          out.push(...(f.k === 'add' ? quantity(f) : rd(f)));
        });
        return out;
      }
      case 'div': {
        if (isWordFrac(n)) { const w = fracWords(n.a.v, n.b.v); return [W(w)]; }
        const a = n.a.k === 'add' || n.a.k === 'rel' || (n.a.k === 'div' && !isWordFrac(n.a)) || (n.a.k === 'neg' && n.a.x.k === 'add') ? quantity(n.a) : rd(n.a);
        const b = isTight(n.b) || selfScoped(n.b) || isWordFrac(n.b) ? rd(n.b) : quantity(n.b);
        return [...a, W('over'), ...b, PAUSE];
      }
      case 'pow': return [...(isAtom(n.a) ? rd(n.a) : quantity(n.a)), ...expPhrase(n.b)];
      case 'neg': return [W('negative'), ...(n.x.k === 'add' ? quantity(n.x) : rd(n.x))];
      case 'root': {
        const head = n.n === 2 ? 'the square root of' : n.n === 3 ? 'the cube root of' : `the ${ordinal(n.n)} root of`;
        return [W(head), ...arg(n.x), PAUSE];
      }
      case 'fn': {
        if (n.p && n.base) { const { p, ...bare } = n; return rd(pow(bare, p)); } // (log₂x)² → "the quantity log base 2 of x, squared"
        const out = n.f === 'ln' ? [W('the natural log')] : [FNSAY[n.f] ? W(FNSAY[n.f]) : varTok(n.f)];
        if (n.p) out.push(...trimP(expPhrase(n.p)));
        if (n.base) out.push(W('base'), ...rd(n.base));
        out.push(W('of'), ...arg(n.x), PAUSE);
        return out;
      }
      case 'abs': return [W('the absolute value of'), ...arg(n.x), PAUSE];
      case 'fact': return [...(isAtom(n.x) ? rd(n.x) : quantity(n.x)), W('factorial')];
      case 'rel': return [...trimP(rd(n.a)), W(RELSAY[n.op] || n.op), ...rd(n.b)];
      case 'tuple': {
        const out = [];
        n.xs.forEach((x, i) => { if (i) out.push(W(',', 'comma')); out.push(...trimP(rd(x))); });
        return out;
      }
    }
    return [W('?')];
  }
  const juxPrev = p => p.k === 'num' || p.k === 'var' || simplePow(p) || isWordFrac(p);
  const juxNext = f => f.k === 'var' || (simplePow(f) && f.a.k === 'var');

  // Collapse runs of pauses and strip them at the ends.
  function tidy(toks) {
    const out = [];
    for (const t of toks) {
      if (t.p) { if (out.length && !out[out.length - 1].p) out.push(t); }
      else out.push(t);
    }
    while (out.length && out[out.length - 1].p) out.pop();
    return out;
  }
  const speak = n => tidy(rd(n));
  const transcript = toks => toks.map((t, i) => t.p ? (i && /[,.;:?!]$/.test(toks[i - 1].w || '') ? '' : ',') : t.w)
    .filter(Boolean).join(' ').replace(/ ([,.;:?!])/g, '$1').trim();
  const chunks = toks => {
    const out = [[]];
    for (const t of toks) { if (t.p) out.push([]); else if (t.s) out[out.length - 1].push(t.s); }
    return out.map(c => c.join(' ').trim()).filter(Boolean);
  };

  // ───────── evaluation ─────────
  const FNEV = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x),
    ln: Math.log, log: (x, b) => Math.log(x) / Math.log(b == null ? 10 : b),
  };
  const FACT = [1];
  for (let i = 1; i <= 170; i++) FACT[i] = FACT[i - 1] * i;
  function ev(n, env = {}) {
    switch (n.k) {
      case 'num': return n.v;
      case 'var': return n.n in env ? env[n.n] : n.n === 'π' ? Math.PI : n.n === 'e' ? Math.E : NaN;
      case 'add': return n.terms.reduce((s, t) => s + t.s * ev(t.x, env), 0);
      case 'mul': return n.fs.reduce((p, f) => p * ev(f, env), 1);
      case 'div': return ev(n.a, env) / ev(n.b, env);
      case 'pow': return Math.pow(ev(n.a, env), ev(n.b, env));
      case 'neg': return -ev(n.x, env);
      case 'root': { const x = ev(n.x, env); return n.n === 2 ? Math.sqrt(x) : n.n % 2 ? Math.sign(x) * Math.pow(Math.abs(x), 1 / n.n) : Math.pow(x, 1 / n.n); }
      case 'fn': {
        const x = ev(n.x, env);
        const user = env.$f && env.$f[n.f];
        let r = user ? user(x) : FNEV[n.f] ? FNEV[n.f](x, n.base ? ev(n.base, env) : undefined) : NaN;
        if (n.p) r = Math.pow(r, ev(n.p, env));
        return r;
      }
      case 'abs': return Math.abs(ev(n.x, env));
      case 'fact': { const x = ev(n.x, env); return isInt(x) && x >= 0 && x <= 170 ? FACT[x] : NaN; }
      case 'rel': return ev(n.a, env) - ev(n.b, env);
    }
    return NaN;
  }
  function vars(n, set = new Set()) {
    if (!n || typeof n !== 'object') return set;
    if (n.k === 'var' && !['π', 'e'].includes(n.n)) set.add(n.n);
    for (const key of ['a', 'b', 'x', 'p', 'base']) if (n[key]) vars(n[key], set);
    (n.terms || []).forEach(t => vars(t.x, set));
    (n.fs || n.xs || []).forEach(f => vars(f, set));
    return set;
  }
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  // Numeric equivalence at random points: positive, negative and whole (so |x| and factorials get checked).
  // Points where either side is undefined (log of a negative…) are skipped.
  function equiv(a, b, env = {}) {
    const vs = [...new Set([...vars(a), ...vars(b)])];
    let valid = 0;
    for (let t = 0; t < 24 && valid < 8; t++) {
      const e = { ...env };
      vs.forEach(v => {
        const r = 0.6 + Math.random() * 2.3;
        e[v] = t % 3 === 0 ? r : t % 3 === 1 ? 1 + Math.floor(Math.random() * 5) : -r;
      });
      const x = ev(a, e), y = ev(b, e);
      if (!isFinite(x) || !isFinite(y)) continue;
      if (!close(x, y)) return false;
      valid++;
    }
    return valid >= 2;
  }

  // ───────── parser ─────────
  const FUNCS = ['sqrt', 'cbrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'abs'];
  const CONSTS = { pi: 'π', theta: 'θ', alpha: 'α', beta: 'β' };
  const WORDS = [...FUNCS, ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length);
  const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  function tokenize(src) {
    let s = String(src)
      .replace(/[−–—]/g, '-').replace(/[×·∙⋅]/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^')
      .replace(/<=|≤/g, '≤').replace(/>=|≥/g, '≥').replace(/!=|≠/g, '≠')
      .replace(/\\cdot|\\times/g, '*').replace(/\\pi/g, 'π').replace(/\\sqrt/g, '√').replace(/\\left|\\right/g, '')
      .replace(/½/g, '(1/2)').replace(/⅓/g, '(1/3)').replace(/⅔/g, '(2/3)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => `^(${[...m].map(c => SUP[c]).join('')})`);
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      let m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (m) { toks.push({ t: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue; }
      if (/[A-Za-z]/.test(c)) {
        const run = /^[A-Za-z]+/.exec(s.slice(i))[0];
        let j = 0;
        while (j < run.length) {
          const rest = run.slice(j).toLowerCase();
          const w = WORDS.find(f => rest.startsWith(f));
          if (w) { toks.push(CONSTS[w] ? { t: 'var', v: CONSTS[w] } : { t: 'fn', v: w }); j += w.length; }
          else { toks.push({ t: 'var', v: run[j] }); j++; }
        }
        i += run.length; continue;
      }
      if ('πθαβ'.includes(c)) { toks.push({ t: 'var', v: c }); i++; continue; }
      if (c === '√') { toks.push({ t: 'fn', v: 'sqrt' }); i++; continue; }
      if (c === '∛') { toks.push({ t: 'fn', v: 'cbrt' }); i++; continue; }
      if ('+-*/^!()[]{}|,=<>≤≥≠_'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`看不懂的符号 “${c}”`);
    }
    return toks;
  }
  const OPEN = { '(': ')', '[': ']', '{': '}' };
  function parse(src) {
    const toks = tokenize(src);
    if (!toks.length) throw new Error('空的');
    let i = 0, absDepth = 0;
    const peek = () => toks[i];
    const isOp = v => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const eat = v => isOp(v) ? (i++, true) : false;
    const expect = v => { if (!eat(v)) throw new Error(`缺少 “${v}”`); };
    const startsPrimary = t => !!t && (t.t !== 'op' || t.v in OPEN || (t.v === '|' && absDepth === 0));

    function pRel() {
      let a = pAdd();
      while (peek() && peek().t === 'op' && '=<>≤≥≠'.includes(peek().v)) { const op = toks[i++].v; a = rel(op, a, pAdd()); }
      return a;
    }
    function pAdd() {
      const terms = [{ s: 1, x: pMul() }];
      while (isOp('+') || isOp('-')) { const s = toks[i++].v === '-' ? -1 : 1; terms.push({ s, x: pMul() }); }
      return terms.length === 1 ? terms[0].x : { k: 'add', terms };
    }
    function pMul() {
      let a = pUnary();
      while (isOp('*') || isOp('/')) {
        const op = toks[i++].v, b = pUnary();
        a = op === '*' ? mul(a, b) : div(a, b);
      }
      return a;
    }
    function pUnary() {
      if (eat('-')) return neg(pUnary());
      if (eat('+')) return pUnary();
      return pImp();
    }
    // juxtaposition binds tighter than * and /, so "1/2x" is 1/(2x) — the same convention as the spoken "1 over 2x"
    function pImp() {
      const fs = [pPow()];
      while (startsPrimary(peek())) fs.push(pPow());
      return fs.length === 1 ? fs[0] : mul(...fs);
    }
    function pPow() {
      const b = pPost();
      return eat('^') ? pow(b, pExp()) : b;
    }
    function pExp() {
      if (eat('-')) return neg(pExp());
      if (eat('+')) return pExp();
      return pPow();
    }
    function pPost() {
      let p = pPrim();
      while (eat('!')) p = fact(p);
      return p;
    }
    function pGroupAfterOpen(open) {
      const e = pRel();
      if (isOp(',')) { const xs = [e]; while (eat(',')) xs.push(pRel()); expect(OPEN[open]); return { k: 'tuple', xs }; }
      expect(OPEN[open]);
      return grouped(e);
    }
    function pParenArg() {
      const t = toks[i++];
      const e = pRel();
      expect(OPEN[t.v]);
      return e;
    }
    function pSimple() {
      const t = toks[i++];
      if (!t) throw new Error('意外结束');
      if (t.t === 'num') return N(t.v);
      if (t.t === 'var') return V(t.v);
      if (t.t === 'op' && t.v in OPEN) return pGroupAfterOpen(t.v);
      throw new Error(`意外的 “${t.v}”`);
    }
    function pFunc(name) {
      let p = null, base = null;
      if (!['sqrt', 'cbrt', 'abs'].includes(name)) {
        for (let r = 0; r < 2; r++) { // log^2_3 x and log_3^2 x
          if (!p && eat('^')) p = isOp('-') ? (i++, neg(pSimple())) : pSimple();
          if (!base && eat('_')) base = pSimple();
        }
      }
      let a;
      if (peek() && peek().t === 'op' && peek().v in OPEN) a = pParenArg();
      else if (name === 'sqrt' || name === 'cbrt') a = pPost();
      else {
        const fs = [pPow()];
        while (startsPrimary(peek()) && peek().t !== 'fn' && !(peek().t === 'op')) fs.push(pPow());
        a = fs.length === 1 ? fs[0] : mul(...fs);
      }
      if (name === 'sqrt') return root(a, 2);
      if (name === 'cbrt') return root(a, 3);
      if (name === 'abs') return abs(a);
      return fn(name, a, { p, base });
    }
    function pPrim() {
      const t = toks[i++];
      if (!t) throw new Error('意外结束');
      if (t.t === 'num') return N(t.v);
      if (t.t === 'var') {
        if ('fgh'.includes(t.v) && isOp('(')) return fn(t.v, pParenArg());
        return V(t.v);
      }
      if (t.t === 'fn') return pFunc(t.v);
      if (t.v in OPEN) return pGroupAfterOpen(t.v);
      if (t.v === '|') { absDepth++; const e = pRel(); expect('|'); absDepth--; return abs(e); }
      throw new Error(`意外的 “${t.v}”`);
    }
    const out = pRel();
    if (i < toks.length) throw new Error(`多余的 “${toks[i].v}”`);
    return out;
  }
  const tryParse = s => { try { return parse(s); } catch (e) { return null; } };

  const E = {
    N, V, add, sub, mul, div, pow, neg, root, fn, abs, fact, rel, lift, grouped,
    isAtom, isTight, isWordFrac, fracWords, ordinal, fmtNum,
    tex, str, speak, speakRaw: rd, tidy, transcript, chunks, ev, vars, equiv, close, parse, tryParse, PAUSE, W,
  };
  G.NSBE = E;
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
