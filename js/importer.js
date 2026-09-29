/* NSB 听题训练 — import NSB question sets (PDF or pasted text) and keep the Math questions.
 * PDF text comes from pdf.js; raised/lowered small text is rebuilt as ^(…) / _(…) so x² survives
 * extraction. The parser follows the DOE layout: "TOSS-UP / 1) MATH Short Answer …",
 * W) X) Y) Z) choices, and "ANSWER: …". Other subjects are counted, not kept. */
(function (G) {
  'use strict';
  const T = G.NSBT || require('./textmath.js');

  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  function loadScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('无法加载 pdf.js（需要联网）')); document.head.appendChild(s); });
  }
  // The worker script is loaded as a plain <script> (it defines globalThis.pdfjsWorker), so pdf.js parses on
  // the main thread instead of spawning a Worker from the CDN — which a page opened as file:// can't do.
  async function pdfjs() {
    if (!G.pdfjsLib) await loadScript(PDFJS + 'pdf.min.js');
    if (!G.pdfjsWorker) await loadScript(PDFJS + 'pdf.worker.min.js');
    G.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
    return G.pdfjsLib;
  }

  // ───────── pdf.js text items → lines (pure; tested with synthetic items) ─────────
  function linesFromItems(items) {
    const its = items.filter(it => it && typeof it.str === 'string' && it.str.length).map(it => ({
      s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0,
      h: Math.abs(it.height || it.transform[3]) || 10,
    }));
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of its) {
      let best = null, bd = Infinity;
      for (const L of lines) {
        const d = Math.abs(it.y - L.y);
        if (d < 0.6 * Math.max(L.h, it.h) && d < bd) { best = L; bd = d; }
      }
      if (!best) { lines.push({ y: it.y, h: it.h, items: [it] }); continue; }
      best.items.push(it);
      if (it.h > best.h * 1.05 && it.s.trim()) { best.h = it.h; best.y = it.y; } // baseline = the full-size text
    }
    lines.sort((a, b) => b.y - a.y);
    return lines.map(L => {
      const parts = [];
      L.items.sort((a, b) => a.x - b.x);
      let prev = null;
      for (const it of L.items) {
        const small = it.h < 0.85 * L.h, rel = it.y - L.y;
        const mode = small && rel > 0.15 * L.h ? 'sup' : small && rel < -0.08 * L.h ? 'sub' : 'n';
        const gap = prev ? it.x - (prev.x + prev.w) : 0;
        const space = prev && gap > 0.18 * Math.min(it.h, prev.h) ? ' ' : '';
        const last = parts[parts.length - 1];
        if (last && last.mode === mode) last.s += space + it.s;
        else parts.push({ mode, s: (mode === 'n' ? space : '') + it.s });
        prev = it;
      }
      return parts.map((p, k) => {
        const s = p.s.trim();
        if (p.mode === 'n' || !s) return p.s;
        // a space typed right after the raised/lowered run ("log₂ 64") belongs to the text that follows
        const next = parts[k + 1];
        const trail = /\s$/.test(p.s) || (next && next.mode === 'n' && /^\s/.test(next.s)) ? ' ' : '';
        if (p.mode === 'sup' && /^(st|nd|rd|th)$/i.test(s)) return s + trail;
        const body = /^[\w.]+$/.test(s) ? s : `(${s})`;
        return (p.mode === 'sup' ? '^' : '_') + body + trail;
      }).join('').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  // Page headers/footers repeat on most pages; drop them (but never the TOSS-UP/BONUS/ANSWER lines).
  function stripRepeated(pages) {
    if (pages.length < 3) return pages;
    const key = l => l.replace(/\d+/g, '#').toLowerCase();
    const count = new Map();
    pages.forEach(p => new Set(p.map(key)).forEach(k => count.set(k, (count.get(k) || 0) + 1)));
    const min = Math.max(3, Math.ceil(pages.length * 0.5));
    return pages.map(p => p.filter(l => (count.get(key(l)) || 0) < min || /^(TOSS|BONUS|ANSWER)/i.test(l) || l.length > 90));
  }

  async function pdfToText(buf, onProgress) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      pages.push(linesFromItems(tc.items));
      if (onProgress) onProgress(p, doc.numPages);
    }
    const round = (/\bROUND\s*#?\s*(\d+|[A-Z]\b)/i.exec(pages.flat().slice(0, 12).join('\n')) || [])[1] || '';
    return { text: stripRepeated(pages).map(p => p.join('\n')).join('\n'), pages: doc.numPages, round };
  }

  // ───────── NSB text → questions (pure) ─────────
  const SUBJECTS = [
    [/^MATH/i, 'math', 'Math'], [/^(BIOLOGY|LIFE)/i, 'bio', 'Biology'], [/^CHEM/i, 'chem', 'Chemistry'],
    [/^(PHYSICS|PHYSICAL)/i, 'phys', 'Physics'], [/^(EARTH|ASTRO)/i, 'earth', 'Earth & Space'], [/^ENERGY/i, 'energy', 'Energy'],
    [/^GENERAL/i, 'gen', 'General Science'],
  ];
  const subjectOf = raw => { for (const [re, key, name] of SUBJECTS) if (re.test(raw.trim())) return { key, name }; return { key: raw.trim().toLowerCase(), name: raw.trim() }; };
  const clean = s => String(s || '').replace(/(\w)-\n(\w)/g, '$1$2').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const HEAD = /(^|\n)[ \t]*(?:(TOSS[ \t]*-?[ \t]*UP|BONUS)[ \t]*(?:\n[ \t]*)?)?(\d{1,2})[ \t]*[).][ \t]*([A-Za-z][A-Za-z &/,]*?)[ \t]*[–—\-:]?[ \t]*(Short[ \t]+Answer|Multiple[ \t]+Choice)\b[ \t]*[:.\-–]?/gi;

  function parseNSB(raw, meta = {}) {
    const text = String(raw || '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/\$/g, '＄');
    const heads = [];
    let m;
    HEAD.lastIndex = 0;
    while ((m = HEAD.exec(text))) heads.push({ i: m.index + m[1].length, end: HEAD.lastIndex, type: m[2], num: +m[3], subj: m[4], fmt: m[5] });
    const out = [], counts = {}, warnings = [];
    let prevEnd = 0, lastType = null;
    heads.forEach((h, n) => {
      const before = text.slice(prevEnd, h.i);
      const marks = before.match(/TOSS[ \t]*-?[ \t]*UP|BONUS/gi);
      let type = h.type || (marks && marks[marks.length - 1]);
      type = type ? (/BONUS/i.test(type) ? 'bonus' : 'tossup') : (lastType === 'tossup' && out.length && out[out.length - 1].num === h.num ? 'bonus' : 'tossup');
      lastType = type;
      prevEnd = h.end;
      let body = text.slice(h.end, n + 1 < heads.length ? heads[n + 1].i : text.length);
      body = body.split(/\n[ \t]*(?:TOSS[ \t]*-?[ \t]*UP|BONUS)\b/i)[0].split(/\n[ \t]*[~_=*]{5,}/)[0];
      const subj = subjectOf(h.subj);
      counts[subj.name] = (counts[subj.name] || 0) + 1;
      const ai = body.search(/\bANSWER\s*:/i);
      if (ai < 0) { warnings.push(`${type === 'bonus' ? 'Bonus' : 'Toss-up'} ${h.num}（${subj.name}）没有找到 ANSWER，已跳过`); return; }
      let stem = body.slice(0, ai);
      const ans = clean(body.slice(ai).replace(/^ANSWER\s*:\s*/i, ''));
      const isMC = /multiple/i.test(h.fmt);
      let choices = null;
      if (isMC) {
        const cm = /(?:^|\s)W\)\s*([\s\S]*?)\s+X\)\s*([\s\S]*?)\s+Y\)\s*([\s\S]*?)\s+Z\)\s*([\s\S]*)$/.exec(stem);
        if (cm) { choices = { W: clean(cm[1]), X: clean(cm[2]), Y: clean(cm[3]), Z: clean(cm[4]) }; stem = stem.slice(0, cm.index); }
        else warnings.push(`${type === 'bonus' ? 'Bonus' : 'Toss-up'} ${h.num} 标为选择题，但没找到 W) X) Y) Z)`);
      }
      const letter = isMC ? ((/^\(?([WXYZ])\b/.exec(ans) || [])[1] || '') : '';
      out.push({ subject: subj.key, subjectName: subj.name, type, num: h.num, format: isMC && choices ? 'mc' : 'sa', stem: clean(stem), choices, answer: ans, letter, src: { file: meta.file || '', round: meta.round || '' } });
    });
    return { questions: out, counts, warnings, found: heads.length };
  }

  // Parsed question → bank entry: math spans marked, structures tagged.
  function toBankItem(q) {
    const text = T.autoMath(q.stem);
    const choices = q.choices ? Object.fromEntries(Object.entries(q.choices).map(([k, v]) => [k, T.autoMath(v)])) : null;
    const answer = T.autoMath(q.answer);
    return {
      id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      subject: q.subject, type: q.type, format: q.format, text, choices, answer, letter: q.letter || '',
      src: { ...q.src, num: q.num }, tags: T.tagsOfText(text, ...(choices ? Object.values(choices) : [])), added: Date.now(),
    };
  }
  const dupKey = text => String(text || '').replace(/\$/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const I = { pdfToText, linesFromItems, stripRepeated, parseNSB, toBankItem, dupKey };
  G.NSBI = I;
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
