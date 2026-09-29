/* NSB 听题训练 — question text: "$…$" math spans inside prose.
 * Renders to HTML, reads aloud with NSB conventions, finds math in imported plain text,
 * and checks typed answers against an official NSB answer line. */
(function (G) {
  'use strict';
  const E = G.NSBE || require('./expr.js');
  const C = G.NSBC || require('./cats.js');
  const { W, PAUSE } = E;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function segments(text) {
    const out = [], re = /\$([^$]+)\$/g;
    let last = 0, m;
    text = String(text || '');
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: 'text', s: text.slice(last, m.index) });
      out.push({ t: 'math', s: m[1], ast: E.tryParse(m[1]) });
      last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: 'text', s: text.slice(last) });
    return out;
  }

  // ───────── HTML ─────────
  function toHTML(text, katex = G.katex) {
    return segments(text).map(seg => {
      if (seg.t === 'text') return esc(seg.s);
      if (!seg.ast || !katex) return `<code>${esc(seg.s)}</code>`;
      try { return katex.renderToString(E.tex(seg.ast), { throwOnError: false, strict: 'ignore' }); } catch (e) { return `<code>${esc(seg.s)}</code>`; }
    }).join('');
  }

  // ───────── speech ─────────
  const LOUD = new Set(['NOT', 'EXCEPT', 'LEAST', 'MOST', 'NEVER', 'ALWAYS', 'TRUE', 'FALSE', 'ONLY', 'ALL', 'NONE', 'BEST', 'CLOSEST', 'GREATEST', 'SMALLEST', 'LARGEST', 'CANNOT', 'AND', 'OR', 'THE', 'TOTAL', 'EXACTLY', 'NEAREST', 'WHOLE', 'NUMBER']);
  const SUBS = [
    [/＄\s?(\d[\d,.]*)/g, '$1 dollars'],
    [/(\d)\s*°\s*F\b/g, '$1 degrees Fahrenheit'], [/(\d)\s*°\s*C\b/g, '$1 degrees Celsius'],
    [/°/g, ' degrees'], [/%/g, ' percent'], [/π/g, ' pi '], [/θ/g, ' theta '],
    [/≤/g, ' is less than or equal to '], [/≥/g, ' is greater than or equal to '], [/≠/g, ' is not equal to '],
    [/\s[–—-]+\s/g, ', '], [/[“”"]/g, ''], [/\b[A-Z]{3,}\b/g, w => LOUD.has(w) ? w.toLowerCase() : w],
  ];
  function plainToks(s) {
    for (const [re, to] of SUBS) s = s.replace(re, to);
    const out = [];
    for (const word of s.split(/\s+/).filter(Boolean)) {
      out.push(W(word, word));
      if (/[,;:.?!]$/.test(word)) out.push(PAUSE);
    }
    return out;
  }
  // unparseable "$…$": read the symbols literally rather than go silent
  const literal = s => s.replace(/\^2\b/g, ' squared ').replace(/\^3\b/g, ' cubed ').replace(/\^/g, ' to the power ')
    .replace(/\//g, ' over ').replace(/\*/g, ' times ').replace(/sqrt/g, ' the square root of ').replace(/\+/g, ' plus ')
    .replace(/[-−–]/g, ' minus ').replace(/=/g, ' equals ').replace(/\(/g, ' the quantity ').replace(/\)/g, ', ');
  function speakText(text) {
    const toks = [];
    for (const seg of segments(text)) {
      if (seg.t === 'math') toks.push(...(seg.ast ? E.speakRaw(seg.ast) : plainToks(literal(seg.s))));
      else {
        // a math span followed by punctuation keeps it on the math side of the pause
        const lead = /^[,;:.?!]/.exec(seg.s);
        if (lead && toks.length) { toks.push(W(lead[0], ''), PAUSE); toks.push(...plainToks(seg.s.slice(1))); }
        else toks.push(...plainToks(seg.s));
      }
    }
    return E.tidy(toks);
  }

  // ───────── finding math in plain text (PDF import) ─────────
  const FN_WORDS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'sqrt']);
  const CAP_WORDS = new Set(['NOT', 'AND', 'THE', 'ALL', 'ONE', 'TWO', 'SUM', 'ARE', 'FOR', 'HOW', 'OR', 'IS', 'IN', 'OF', 'TO', 'AT', 'BY', 'ON', 'IF', 'IT', 'AN', 'BE', 'DO', 'NO', 'SO', 'UP', 'US', 'WE', 'ANY', 'CAN', 'BUT', 'HAS', 'ITS', 'MAY', 'NEW', 'NOW', 'OUT', 'USE', 'WAS', 'WAY', 'WHO', 'WHY', 'YES', 'YOU', 'LCM', 'GCD', 'GCF', 'DNA', 'USA', 'MPH']);
  const OPS = '^+-−–*×·/÷=<>≤≥≠√∛!|()[]{}_';
  function lex(text) {
    const re = /([A-Za-z]+(?:[-'’][A-Za-z]+)+)|([A-Za-z]{2,})|(\d+(?:,\d{3})+(?!\d)|\d*\.\d+|\d+)|([A-Za-z])|(\s+)|(\*\*|[\^+\-−–*×·/÷=<>≤≥≠√∛!|()[\]{}_])|([πθ])|(,)|([\s\S])/g;
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const s = m[0];
      let k = 'other';
      if (m[1]) k = 'word';
      else if (m[2]) k = FN_WORDS.has(s.toLowerCase()) ? 'fn' : s.toLowerCase() === 'pi' ? 'const' : /^[A-Z]{2,3}$/.test(s) && !CAP_WORDS.has(s) ? 'caps' : 'word';
      else if (m[3]) k = 'num';
      else if (m[4]) k = 'var';
      else if (m[5]) k = 'sp';
      else if (m[6]) k = 'op';
      else if (m[7]) k = 'const';
      else if (m[8]) k = 'comma';
      out.push({ s, k });
    }
    return out;
  }
  const MATHY = new Set(['num', 'var', 'op', 'fn', 'caps', 'const']);
  function acceptSpan(toks) {
    // trim spaces, then operators that can't start/end an expression, then unmatched brackets
    const trimmed = toks.slice();
    let changed = true;
    while (changed && trimmed.length) {
      changed = false;
      const a = trimmed[0], z = trimmed[trimmed.length - 1];
      if (a.k === 'sp' || (a.k === 'op' && '+*/^=<>≤≥≠_)]}!'.includes(a.s))) { trimmed.shift(); changed = true; continue; }
      if (z.k === 'sp' || z.k === 'comma' || (z.k === 'op' && '+-−–*/^=<>≤≥≠_([{√'.includes(z.s))) { trimmed.pop(); changed = true; continue; }
      const src = trimmed.map(t => t.s).join('');
      const open = (src.match(/[([{]/g) || []).length, shut = (src.match(/[)\]}]/g) || []).length;
      if (open > shut && '([{'.includes(a.s)) { trimmed.shift(); changed = true; }
      else if (shut > open && ')]}'.includes(z.s)) { trimmed.pop(); changed = true; }
    }
    if (!trimmed.length) return null;
    const src = trimmed.map(t => t.s).join('');
    const kinds = trimmed.filter(t => t.k !== 'sp');
    const hasOp = /[+\-−–*×·/÷^=<>≤≥≠√∛!|]/.test(src);
    const implicit = /\d\s*[A-Za-zπθ(]|[A-Za-z]\s*\(|\)\s*\(/.test(src);
    const loneVar = kinds.length === 1 && kinds[0].k === 'var' && !['a', 'A', 'I'].includes(kinds[0].s);
    const tuple = /^\(.*,.*\)$/.test(src);
    const fnw = kinds.some(t => t.k === 'fn');
    if (!(hasOp || implicit || loneVar || tuple || fnw)) return null;
    if (/^\d{4}\s*[-–]\s*\d{2,4}$/.test(src)) return null; // 2019–20
    const norm = src.replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/(\d),(?=\d{3}\b)/g, '$1');
    if (!E.tryParse(norm)) return null;
    return { src, norm, start: toks.indexOf(trimmed[0]), end: toks.indexOf(trimmed[trimmed.length - 1]) };
  }
  function autoMath(text) {
    text = String(text || '');
    if (text.includes('$')) return text;
    const toks = lex(text);
    let out = '', i = 0;
    while (i < toks.length) {
      if (!MATHY.has(toks[i].k)) { out += toks[i].s; i++; continue; }
      // grow a span: math tokens, spaces between them, commas inside brackets
      let j = i, depth = 0;
      while (j < toks.length) {
        const t = toks[j];
        if (t.k === 'op' && '([{'.includes(t.s)) depth++;
        if (t.k === 'op' && ')]}'.includes(t.s)) depth--;
        if (MATHY.has(t.k) || t.k === 'sp' || (t.k === 'comma' && depth > 0)) j++;
        else break;
      }
      const span = toks.slice(i, j);
      const acc = acceptSpan(span);
      if (!acc) { out += span.map(t => t.s).join(''); i = j; continue; }
      out += span.slice(0, acc.start).map(t => t.s).join('') + '$' + acc.norm + '$' + span.slice(acc.end + 1).map(t => t.s).join('');
      i = j;
    }
    return out;
  }

  // ───────── structure tags ─────────
  function tagsOfText(...texts) {
    const set = new Set();
    for (const t of texts) for (const seg of segments(t)) if (seg.ast) C.tagsOf(seg.ast, set);
    return [...set];
  }

  // ───────── answers ─────────
  function splitAnswer(ans) {
    const accept = [];
    let main = String(ans || '').replace(/\((?:MUST\s+|ALSO\s+)?ACCEPTS?:?\s*([^)]*)\)/gi, (_, a) => { accept.push(...a.split(/\s*(?:;|\bOR\b|,(?!\d{3}))\s*/i)); return ' '; })
      .replace(/\(DO NOT ACCEPT[^)]*\)/gi, ' ').replace(/\s+/g, ' ').trim();
    return { main, accept: accept.map(a => a.trim()).filter(Boolean) };
  }
  const NUMWORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const KNOWN = new Set(['sqrt', 'cbrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'abs', 'theta']);
  // Something the parser can evaluate: "x = 5" → 5, "3 1/2" → 7/2, "12 meters" → 12.
  function answerAst(s) {
    s = String(s || '').replace(/\$/g, '').replace(/[＄%°]/g, '').replace(/(\d),(?=\d{3}\b)/g, '$1').trim();
    s = s.replace(/^[A-Za-z]\s*=\s*(?=[^=]+$)/, '');
    const nw = /^(negative\s+|minus\s+)?([a-z]+)$/i.exec(s);
    if (nw && NUMWORDS.includes(nw[2].toLowerCase())) s = (nw[1] ? '-' : '') + NUMWORDS.indexOf(nw[2].toLowerCase());
    const mixed = /^(-?)(\d+)\s+(\d+)\/(\d+)$/.exec(s);
    if (mixed) s = `${mixed[1]}(${mixed[2]} + ${mixed[3]}/${mixed[4]})`;
    // "square" would otherwise parse as s·q·u·a·r·e
    const wordy = t => (t.match(/[A-Za-z]{3,}/g) || []).some(w => !KNOWN.has(w.toLowerCase()));
    const ok = t => { if (wordy(t)) return null; const a = E.tryParse(t); return a && a.k !== 'rel' && a.k !== 'tuple' ? a : null; };
    let a = ok(s);
    if (a) return a;
    const words = s.split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) { // drop trailing unit words
      if (!/^[A-Za-z.]+$/.test(words[n])) break;
      if ((a = ok(words.slice(0, n).join(' ')))) return a;
    }
    return null;
  }
  const normText = s => String(s || '').replace(/\$/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // → {ok, sure}. sure=false means "can't tell" — the UI lets the student judge, like a moderator would.
  function judge(user, answer) {
    const { main, accept } = splitAnswer(answer);
    const cands = [main, ...accept];
    const ua = answerAst(user);
    let officialParses = false;
    for (const c of cands) {
      const ca = answerAst(c);
      if (ca) officialParses = true;
      if (ua && ca) {
        const uv = E.vars(ua).size, cv = E.vars(ca).size;
        if (!uv && !cv) { if (E.close(E.ev(ua), E.ev(ca))) return { ok: true, sure: true }; }
        else if (E.equiv(ua, ca)) return { ok: true, sure: true };
      }
      if (normText(user) && normText(user) === normText(c)) return { ok: true, sure: true };
    }
    if (!ua && cands.some(c => normText(c).length > 2 && normText(user).includes(normText(c)))) return { ok: true, sure: false };
    return { ok: false, sure: officialParses };
  }

  const T = { segments, toHTML, speakText, autoMath, tagsOfText, splitAnswer, answerAst, judge, esc, lex };
  G.NSBT = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof window !== 'undefined' ? window : globalThis);
