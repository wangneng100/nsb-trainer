(() => {
  'use strict';
  const E = window.NSBE, C = window.NSBC, T = window.NSBT, I = window.NSBI, TTS = window.NSBTTS;
  const { W, PAUSE } = E;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = T.esc;
  const main = $('#main');
  const LETTERS = ['W', 'X', 'Y', 'Z'];
  const DAY = 864e5;
  const MODE = { dict: '👂 Dictation', calc: '🔔 Math', bank: '🎙 Official' };
  const RT_TARGET = { dict: 3000, calc: 6000, bank: 9000 }; // ms after the reading ends
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sec = ms => ms == null ? '—' : (ms / 1000).toFixed(1) + 's';
  const pct = x => x == null ? '—' : Math.round(x * 100) + '%';
  const dayStr = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

  // ───────── math rendering ─────────
  function K(latex) {
    if (!window.katex) return `<code>${esc(latex)}</code>`;
    try { return katex.renderToString(latex, { throwOnError: false, strict: 'ignore' }); } catch (e) { return `<code>${esc(latex)}</code>`; }
  }
  const texN = n => K(E.tex(n));
  const egHTML = eg => eg.split(' vs ').map(p => { const a = E.tryParse(p); return a ? texN(a) : esc(p); }).join(' <span class="muted">vs</span> ');
  function trHTML(toks) {
    return toks.map((t, i) => t.p ? (i && /[,.;:?!]$/.test(toks[i - 1].w || '') ? '' : '<i class="pz" title="pause">‖</i>')
      : t.c ? `<b class="cue">${esc(t.w)}</b>` : esc(t.w)).filter(Boolean).join(' ').replace(/ ([,.;:?!])/g, '$1');
  }

  // ───────── state ─────────
  const KEY = 'nsb-trainer-v1';
  const defaults = () => ({
    settings: { voice: '', rate: 0.95, pause: 380, len: 10, buzz: 5, bonus: 20, mic: true, showOpts: false, captions: false, sfx: true, theme: 'auto' },
    prefs: { dict: { cats: [], lvl: 'auto', style: 'choice', len: 10 }, calc: { src: 'gen', cats: [], lvl: 'auto', type: 'all', len: 10, years: [], rounds: [] }, bank: { years: [] } },
    cats: {}, log: [], mistakes: [], customBank: [], deletedIds: [], bstats: {}, streak: { n: 0, last: null },
  });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return defaults();
      const d = defaults();
      
      // Remove legacy bank data from localStorage and clean customBank
      delete s.bank;
      if (s.customBank) {
        s.customBank = s.customBank.filter(q => !q.year && q.src && (q.src.file === 'manual' || q.src.file === 'pasted'));
      }
      
      const loaded = { ...d, ...s, settings: { ...d.settings, ...s.settings }, prefs: { 
          dict: { ...d.prefs.dict, ...(s.prefs || {}).dict }, 
          calc: { ...d.prefs.calc, ...(s.prefs || {}).calc },
          bank: { ...d.prefs.bank, ...(s.prefs || {}).bank } 
      } };
      if (loaded.settings.mic === undefined) loaded.settings.mic = true;
      return loaded;
    } catch (e) { return defaults(); }
  }
  let S = load();
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S, (k, v) => k === 'bank' ? undefined : v)); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('⚠️ Browser storage full or disabled. Progress may not be saved. You can export backup from the Bank page.'); } }
  }

  // ───────── Dynamic Banks ─────────
  const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022'];
  const ROUNDS = Array.from({length: 17}, (_, i) => String(i + 1));
  const SUBJECTS = [
    { id: 'all', name: 'All Subjects' },
    { id: 'math', name: 'Math' },
    { id: 'phys', name: 'Physics' },
    { id: 'chem', name: 'Chemistry' },
    { id: 'bio', name: 'Biology' },
    { id: 'earth', name: 'Earth & Space' },
    { id: 'energy', name: 'Energy' },
    { id: 'gen', name: 'General Science' },
  ];
  const subjName = id => (SUBJECTS.find(s => s.id === id) || {}).name || id;
  let loadedBanks = [];
  S.bank = []; // in-memory
  
  async function loadBanks() {
    try {
      const v = Date.now();
      const promises = YEARS.map(y => fetch(`banks/${y}.json?v=${v}`).then(r => r.json()).catch(() => []));
      const arrays = await Promise.all(promises);
      loadedBanks = arrays.flat();
      applyBank();
      route();
    } catch (e) { console.error('Failed to load banks', e); }
  }
  
  function applyBank() {
    const loadedIdSet = new Set(loadedBanks.map(q => q.id));
    if (S.customBank && S.customBank.length) {
      const origLen = S.customBank.length;
      S.customBank = S.customBank.filter(q => !loadedIdSet.has(q.id) && !q.year && q.src && (q.src.file === 'manual' || q.src.file === 'pasted'));
      if (S.customBank.length !== origLen) save();
    }
    S.bank = [...loadedBanks.filter(q => !(S.deletedIds || []).includes(q.id)), ...(S.customBank || [])];
  }
  loadBanks();
  
  const qById = id => S.bank.find(q => q.id === id);

  // ───────── stats model ─────────
  const catRec = id => S.cats[id] || (S.cats[id] = { lvl: 1, n: 0, ok: 0, h: [] });
  // weakness: recent accuracy (recency-weighted, smoothed), slowness vs target, and a nudge for untried/stale categories
  function catInfo(id) {
    const r = S.cats[id] || { lvl: 1, n: 0, ok: 0, h: [] };
    const h = r.h.slice(-12), n = h.length;
    let sw = 0, so = 0;
    h.forEach((x, i) => { const w = Math.pow(0.85, n - 1 - i); sw += w; so += w * (x.ok ? (x.rp ? 0.5 : 1) : 0); });
    const acc = n ? (so + 1) / (sw + 2) : null;
    const rawAcc = n ? h.filter(x => x.ok).length / n : null;
    const rel = h.filter(x => x.ok && x.rt > 0).map(x => x.rt / RT_TARGET[x.m]);
    const slow = rel.length ? Math.min(1.5, Math.max(0, median(rel) - 1)) / 1.5 : 0.3;
    const days = r.last ? (Date.now() - r.last) / DAY : 0;
    const score = (1 - (acc == null ? 0.5 : acc)) * 0.65 + slow * 0.25 + (n < 4 ? 0.35 : 0) + Math.min(0.2, days * 0.03);
    const rtOf = m => median(r.h.filter(x => x.ok && x.m === m && x.rt > 0).slice(-15).map(x => x.rt));
    return { id, n: r.n || 0, recent: h, acc: rawAcc, score, lvl: r.lvl || 1, rtDict: rtOf('dict'), rtCalc: rtOf('calc'), last: r.last || 0 };
  }
  function pickCat(ids) {
    const ws = ids.map(id => 0.04 + Math.pow(catInfo(id).score, 1.5));
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ids.length; i++) { r -= ws[i]; if (r <= 0) return ids[i]; }
    return ids[ids.length - 1];
  }
  function adaptLevel(id) {
    const r = catRec(id), cat = C.CAT[id];
    const h = r.h.filter(x => x.m !== 'bank' && x.l === r.lvl).slice(-8);
    const good = h.filter(x => x.ok && !x.rp);
    const fast = median(good.map(x => x.rt / RT_TARGET[x.m]));
    if (r.lvl < 3 && h.length >= 6 && good.length >= h.length - 1 && fast != null && fast <= 1) {
      r.lvl++; toast(`⬆️ ${cat.zh} leveled up to L${r.lvl}`); sfx('up');
    } else if (r.lvl > 1 && h.length >= 5 && h.filter(x => x.ok).length <= h.length / 2) {
      r.lvl--; toast(`${cat.zh} dropped to L${r.lvl}, practice this level first`);
    }
  }
  function todayStats() {
    const d = dayStr(), L = S.log.filter(x => dayStr(x.t) === d);
    return { n: L.length, ok: L.filter(x => x.ok).length };
  }
  const streakNow = () => (S.streak.last === dayStr() || S.streak.last === dayStr(Date.now() - DAY)) ? S.streak.n : 0;
  function touchStreak() {
    const d = dayStr();
    if (S.streak.last === d) return;
    S.streak.n = S.streak.last === dayStr(Date.now() - DAY) ? S.streak.n + 1 : 1;
    S.streak.last = d;
  }

  // ───────── audio ─────────
  let player = null;
  const sayReg = new Map();
  let sayN = 0;
  const sayBtn = (toks, label = '🔊') => { const id = 's' + (++sayN); sayReg.set(id, toks); return `<button class="say" data-say="${id}" title="Listen">${label}</button>`; };
  const silentMode = () => !TTS.available();
  function chunkPairs(toks) {
    const out = [{ s: [], w: [] }];
    for (const t of toks) { if (t.p) out.push({ s: [], w: [] }); else { if (t.s) out[out.length - 1].s.push(t.s); out[out.length - 1].w.push(t.w); } }
    return out.filter(c => c.s.length).map(c => ({ say: c.s.join(' '), show: c.w.join(' ') }));
  }
  function playToks(toks, onChunk) {
    stopAudio();
    const pairs = chunkPairs(toks);
    player = TTS.play(pairs.map(p => p.say), { rate: S.settings.rate, pause: S.settings.pause, voice: S.settings.voice, silent: silentMode(), onChunk });
    return player;
  }
  function stopAudio() {
    if (player) { player.cancel(); player = null; }
    $$('.say.playing').forEach(b => {
      b.classList.remove('playing');
      if (b.dataset.orig) b.innerHTML = b.dataset.orig;
    });
  }
  let actx;
  function sfx(kind) {
    if (!S.settings.sfx) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const seq = { ok: [[660, .07], [990, .11]], no: [[210, .2]], buzz: [[540, .09], [405, .14]], up: [[523, .1], [659, .1], [784, .18]] }[kind] || [];
      let t = actx.currentTime;
      seq.forEach(([f, d]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === 'no' ? 'sawtooth' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(.1, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + .02); t += d * .9;
      });
    } catch (e) { }
  }

  // ───────── toast / modal / tooltip ─────────
  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = msg;
    $('#toasts').appendChild(el); setTimeout(() => el.remove(), 2800);
  }
  function modal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
  $('#modal').addEventListener('click', e => {
    if (e.target.id !== 'modal' && !e.target.closest('[data-close]')) return;
    closeModal(); imp = null;
    if (view !== 'drill') route(); // settings may have changed what the page shows
  });
  const tipEl = $('#tip');
  document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if (!t) return; tipEl.textContent = t.dataset.tip; tipEl.hidden = false; });
  document.addEventListener('mousemove', e => { if (tipEl.hidden) return; tipEl.style.left = Math.min(e.clientX + 14, innerWidth - tipEl.offsetWidth - 8) + 'px'; tipEl.style.top = (e.clientY - 36) + 'px'; });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tipEl.hidden = true; });

  // ───────── header / theme ─────────
  function applyTheme() { const t = S.settings.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }
  function hud() {
    const td = todayStats();
    $('#hud').innerHTML = `
      <span class="pill fire" title="Streak Days">🔥 ${streakNow()}</span>
      <span class="pill" title="Questions practiced today">Today ${td.n}</span>
      <button class="pill icon-btn" data-act="settings" title="Settings">⚙️</button>`;
  }

  // ───────── router ─────────
  let view = 'home';
  const VIEWS = {};
  function route() {
    const v = location.hash.slice(1) || 'home';
    if (v !== 'drill' && sess) endSession();
    view = VIEWS[v] ? v : 'home';
    document.body.classList.toggle('in-drill', view === 'drill');
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === view));
    sayReg.clear();
    VIEWS[view]();
    if (view !== 'drill') window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // ───────── home ─────────
  const heatClass = i => i.n < 3 || i.acc == null ? '' : i.acc < .6 ? 'a1' : i.acc < .75 ? 'a2' : i.acc < .9 ? 'a3' : 'a4';
  function whyWeak(i) {
    if (i.n < 4) return 'Hardly practiced';
    if (i.acc != null && i.acc < .85) return `Recent Acc ${pct(i.acc)}`;
    const rt = i.rtCalc && i.rtCalc > RT_TARGET.calc ? i.rtCalc : i.rtDict;
    if (rt && rt > RT_TARGET.dict) return `Slow reaction (${sec(rt)}）`;
    return 'Keep in touch';
  }
  VIEWS.home = () => {
    const infos = C.CATS.map(c => ({ c, ...catInfo(c.id) }));
    const weak = infos.slice().sort((a, b) => b.score - a.score).slice(0, 3);
    const td = todayStats();
    main.innerHTML = `
      ${silentMode() ? '<div class="banner">⚠️ This browser does not support TTS. Falling back to subtitles. Chrome or Safari is recommended.</div>' : ''}
      <div class="hero">
        <div class="card">
          <h1>Hear the structure first, calculate later</h1>
          <p class="lead">Uses standard NSB read alouds. 'the quantity ... ,' and pauses dictate parentheses. Mishearing a parenthesis makes fast calculation useless.</p>
          <div class="row"><button class="btn big" data-start="smart">⚡ Smart Drill · ${S.settings.len} Qs</button><span class="muted small">Weaknesses First · Mixed Dictation & Math</span></div>
        </div>
        <div class="card">
          <div class="today">
            <div><b>${td.n}</b><span>Today Qs</span></div>
            <div><b>${td.n ? pct(td.ok / td.n) : '—'}</b><span>Today Acc</span></div>
            <div><b>${streakNow()}</b><span>Streak 🔥</span></div>
          </div>
          <p class="muted small" style="margin:14px 0 0">Bank ${S.bank.length} Qs · Total Drills ${S.log.length} times</p>
        </div>
      </div>
      <div class="modes">
        <a class="mode-card" href="#dict"><div class="ic">👂</div><b>Dictation</b><span>Hear an expression, choose (or write) its form. Practice 'hearing' only.</span></a>
        <a class="mode-card" href="#calc"><div class="ic">🔔</div><b>Competition Drill</b><span>Hear and buzz: Practice official questions and algebraic structures with toss-up & bonus timers.</span></a>
        <a class="mode-card" href="#bank"><div class="ic">📚</div><b>Official Questions</b><span>Practice official NSB questions across Math, Physics, Chemistry, Biology, Earth & Space, Energy, and General Science.</span></a>
      </div>
      <div class="card">
        <h3>Today's Focus</h3>
        <div class="weak">${weak.map(i => `
          <div class="weak-item">
            <div><div class="nm">${esc(i.c.zh)} <span class="lvl small">L${i.lvl}</span></div><div class="why">${esc(whyWeak(i))} · ${egHTML(i.c.eg)}</div></div>
            <span class="spacer"></span><button class="btn sm" data-start="smart" data-cats="${i.id}">Drill</button>
          </div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="row"><h3 style="margin:0">15 Confusable Structures</h3><span class="spacer"></span><span class="muted small">Darker bg = higher recent accuracy · Click to drill</span></div>
        <div class="heat" style="margin-top:12px">${infos.map(i => `
          <button class="${heatClass(i)}" data-start="smart" data-cats="${i.id}" data-tip="${esc(i.c.zh)} · Practiced ${i.n} times · Recent Acc ${pct(i.acc)}">
            <div class="nm">${esc(i.c.zh)}</div><div class="eg">${egHTML(i.c.eg)}</div><span class="v">${i.n >= 3 ? pct(i.acc) : '—'}</span>
          </button>`).join('')}</div>
      </div>`;
  };

  // ───────── setup pages ─────────
  const segHTML = (key, cur, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-val="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const catChips = (key, sel) => `<div class="chips" data-chips="${key}">
    <button class="chip ${sel.length ? '' : 'on'}" data-cat="">All (Weakness First)</button>
    ${C.CATS.map(c => `<button class="chip ${sel.includes(c.id) ? 'on' : ''}" data-cat="${c.id}">${esc(c.zh)}</button>`).join('')}</div>`;
  const yearChips = (key, sel) => `<div class="chips" data-chips="${key}">
    <button class="chip ${sel.length ? '' : 'on'}" data-year="">All Years</button>
    ${YEARS.map(y => `<button class="chip ${sel.includes(y) ? 'on' : ''}" data-year="${y}">${y}</button>`).join('')}</div>`;
  const roundChips = (key, sel) => `<div class="chips" data-chips="${key}">
    <button class="chip ${sel.length ? '' : 'on'}" data-round="">All Rounds</button>
    ${ROUNDS.map(r => `<button class="chip ${sel.includes(r) ? 'on' : ''}" data-round="${r}">${r}</button>`).join('')}</div>`;
  const subjectChips = (key, sel) => `<div class="chips" data-chips="${key}">
    <button class="chip ${(!sel || !sel.length || sel.includes('all')) ? 'on' : ''}" data-subj="all">All Subjects</button>
    ${SUBJECTS.filter(s => s.id !== 'all').map(s => `<button class="chip ${sel && sel.includes(s.id) ? 'on' : ''}" data-subj="${s.id}">${esc(s.name)}</button>`).join('')}</div>`;
  VIEWS.dict = () => {
    const P = S.prefs.dict;
    main.innerHTML = `
      <div class="card">
        <h2>👂 Dictation: Hear expressions, recognize structures</h2>
        <p class="muted">Listen only. Options appear after reading. Pick (or write) what you heard. Just 'hear it right', no calculation.</p>
        <label class="field">Category</label>${catChips('dict', P.cats)}
        <label class="field">Difficulty</label>${segHTML('dict.lvl', P.lvl, [['auto', 'Auto'], [1, 'L1'], [2, 'L2'], [3, 'L3 Embedded']])}
        <label class="field">Answer Mode</label>${segHTML('dict.style', P.style, [['choice', 'Choice W/X/Y/Z'], ['type', 'Type it out']])}
        <label class="field">Questions</label>${segHTML('dict.len', P.len, [[5, 5], [10, 10], [15, 15], [20, 20]])}
        <div class="row" style="margin-top:18px"><button class="btn big" data-go="dict">Start ▶</button></div>
      </div>
      <div class="card flat small">
        <h3>Keyboard</h3>
        <p><kbd>W</kbd> <kbd>X</kbd> <kbd>Y</kbd> <kbd>Z</kbd>(or <kbd>1</kbd>–<kbd>4</kbd>) pick answer · <kbd>R</kbd> Replay (recorded) · <kbd>Enter</kbd> Next · <kbd>Esc</kbd> Quit</p>
        <p class="muted">'Type it out': Type with keyboard, e.g. <code>(xy)^2</code>、<code>sqrt(x+1)</code>、<code>1/(2x)</code>、<code>|x-3|</code>、<code>(n+1)!</code>、<code>log_2(x)</code>、<code>sin^2(x)</code>. Different but equivalent expressions are accepted.</p>
      </div>`;
  };
  VIEWS.calc = () => {
    const P = S.prefs.calc;
    const totalQ = S.bank.length;
    main.innerHTML = `
      <div class="card">
        <h2>🔔 Competition Drill</h2>
        <p class="muted">Simulate competition: ${S.settings.buzz} seconds after toss-up reading to press <kbd>Space</kbd> to buzz, can interrupt early; ${S.settings.bonus} seconds to answer bonus.</p>
        <label class="field">Source</label>${segHTML('calc.src', P.src, [['gen', 'Math Structure Drill (Algebraic)'], ['bank', `Official Questions (${totalQ})`]])}
        ${P.src === 'gen' ? `
          <label class="field">Category</label>${catChips('calc', P.cats)}
          <label class="field">Difficulty</label>${segHTML('calc.lvl', P.lvl, [['auto', 'Auto'], [1, 'L1'], [2, 'L2'], [3, 'L3']])}` : `
          <label class="field">Subject</label>${subjectChips('calc', P.subjects || ['all'])}
          <label class="field">Type</label>${segHTML('calc.type', P.type, [['all', 'All'], ['tossup', 'Toss-up Only'], ['bonus', 'Bonus Only']])}
          <label class="field">Year</label>${yearChips('calc', P.years)}
          <label class="field">Round</label>${roundChips('calc', P.rounds || [])}
          <p class="muted small">Prioritizes unattempted and missed questions. To pick specific questions, go to <a href="#bank">Bank</a> filter and click 'Drill These'.</p>`}
        <label class="field">Questions</label>${segHTML('calc.len', P.len, [[5, 5], [10, 10], [15, 15], [20, 20]])}
        <div class="row" style="margin-top:18px"><button class="btn big" data-go="calc">Start ▶</button></div>
      </div>
      <div class="card flat small">
        <h3>Keyboard</h3>
        <p><kbd>Space</kbd> Buzz · Type answer then <kbd>Enter</kbd> Submit · MCQs press <kbd>W</kbd>/<kbd>X</kbd>/<kbd>Y</kbd>/<kbd>Z</kbd> · <kbd>Enter</kbd> Next</p>
        <p class="muted">Answers can be short numbers/words, fractions <code>3/4</code>, decimals, or algebraic expressions (e.g. <code>8x</code>).</p>
      </div>`;
  };
  document.addEventListener('click', e => {
    const segBtn = e.target.closest('[data-seg] button');
    if (segBtn) {
      const [grp, key] = segBtn.parentElement.dataset.seg.split('.');
      let v = segBtn.dataset.val;
      if (/^\d+$/.test(v)) v = +v;
      if (grp === 'settings') { S.settings[key] = v; save(); if (key === 'theme') applyTheme(); openSettings(); return; }
      S.prefs[grp][key] = v; save(); route(); return;
    }
    const chip = e.target.closest('[data-chips] [data-cat]');
    if (chip) {
      const grp = chip.parentElement.dataset.chips, P = S.prefs[grp], id = chip.dataset.cat;
      if (!id) P.cats = []; else P.cats = P.cats.includes(id) ? P.cats.filter(x => x !== id) : [...P.cats, id];
      save(); route(); return;
    }
    const yChip = e.target.closest('[data-chips] [data-year]');
    if (yChip) {
      const grp = yChip.parentElement.dataset.chips, P = S.prefs[grp], id = yChip.dataset.year;
      if (!id) P.years = []; else P.years = P.years.includes(id) ? P.years.filter(x => x !== id) : [...P.years, id];
      save(); route(); return;
    }
    const rChip = e.target.closest('[data-chips] [data-round]');
    if (rChip) {
      const grp = rChip.parentElement.dataset.chips, P = S.prefs[grp], id = rChip.dataset.round;
      if (!id) P.rounds = []; else P.rounds = (P.rounds || []).includes(id) ? P.rounds.filter(x => x !== id) : [...(P.rounds || []), id];
      save(); route(); return;
    }
    const sChip = e.target.closest('[data-chips] [data-subj]');
    if (sChip) {
      const grp = sChip.parentElement.dataset.chips, P = S.prefs[grp], id = sChip.dataset.subj;
      if (!id || id === 'all') P.subjects = ['all'];
      else {
        let cur = (P.subjects || []).filter(x => x !== 'all');
        cur = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
        P.subjects = cur.length ? cur : ['all'];
      }
      save(); route(); return;
    }
  });

  // ───────── sessions ─────────
  let sess = null;
  let cd = null, tk = null;
  function startSession(o) {
    stopAudio();
    sess = { kind: o.kind, cats: o.cats || [], lvl: o.lvl || 'auto', style: o.style || 'choice', bankIds: o.bankIds || null, btype: o.btype || 'all',
      subjects: o.subjects || (S.prefs.calc && S.prefs.calc.subjects) || ['all'],
      years: o.years || [], rounds: o.rounds || [], len: o.len || S.settings.len, i: 0, results: [], retry: [], seen: new Set(), item: null, phase: null, opts: o };
    if (location.hash === '#drill') route(); else location.hash = '#drill';
  }
  let activeRec = null;
  function stopMic() {
    if (activeRec) {
      try { activeRec.abort(); } catch (e) {}
      activeRec = null;
    }
  }
  function endSession() { stopAudio(); stopTimers(); stopMic(); sess = null; }
  function stopTimers() { clearInterval(cd); clearInterval(tk); cd = tk = null; stopMic(); }
  const allIds = () => C.CATS.map(c => c.id);

  function bankPool() {
    let pool = S.bank.slice();
    if (sess.bankIds) {
      const idSet = new Set(sess.bankIds);
      return pool.filter(q => idSet.has(q.id) && !sess.seen.has(q.id));
    }
    if (sess.subjects && sess.subjects.length && !sess.subjects.includes('all')) {
      pool = pool.filter(q => sess.subjects.includes(q.subject));
    }
    if (sess.btype !== 'all') pool = pool.filter(q => q.type === sess.btype);
    if (sess.years && sess.years.length) pool = pool.filter(q => sess.years.includes(q.year));
    if (sess.rounds && sess.rounds.length) pool = pool.filter(q => q.src && sess.rounds.includes(String(q.src.round)));
    return pool.filter(q => !sess.seen.has(q.id));
  }
  function pickBank(pool) {
    if (!pool.length) return null;
    const w = pool.map(q => { const b = S.bstats[q.id]; return !b ? 3 : b.lastOk === false ? 2.5 : 1 / (1 + b.ok) + Math.min(1, (Date.now() - b.last) / (7 * DAY)); });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function bankToks(q) {
    const subjLabel = subjName(q.subject);
    const out = [W(q.type === 'bonus' ? 'Bonus.' : 'Toss-up.'), PAUSE, W(subjLabel + ','), W(q.format === 'mc' ? 'multiple choice.' : 'short answer.'), PAUSE, ...T.speakText(q.text)];
    if (q.format === 'mc' && q.choices) for (const L of LETTERS) out.push(PAUSE, W(L + ')', L), ...T.speakText(q.choices[L] || ''));
    return E.tidy(out);
  }
  function bankItem(q) {
    sess.seen.add(q.id);
    return { mode: 'bank', q, cat: (q.tags || [])[0] || null, lvl: 0, toks: bankToks(q) };
  }
  function gen(mode, cat, retry) {
    const lvl = sess.lvl === 'auto' ? catRec(cat).lvl : +sess.lvl;
    let it = mode === 'calc' ? C.makeCalc(cat, lvl) : null;
    if (!it) it = C.makeDict(cat, lvl);
    it.retry = !!retry;
    return it;
  }
  function makeItem() {
    const due = sess.retry.findIndex(r => r.at <= sess.i);
    if (due >= 0) { const r = sess.retry.splice(due, 1)[0]; return gen(r.mode, r.cat, true); }
    if (sess.kind === 'bank') { const q = pickBank(bankPool()); return q ? bankItem(q) : null; }
    const pool = sess.cats.length ? sess.cats : allIds();
    const cat = pickCat(pool);
    if (sess.kind === 'smart') {
      const r = Math.random();
      if (r < 0.15) { const q = pickBank(bankPool().filter(x => (x.tags || []).includes(cat))); if (q) return bankItem(q); }
      return gen(r < 0.6 ? 'dict' : 'calc', cat);
    }
    return gen(sess.kind, cat);
  }
  function nextItem() {
    stopAudio(); stopTimers();
    if (sess.item && sess.item.res) sess.i++;
    if (sess.i >= sess.len) return finish();
    const it = makeItem();
    if (!it) { if (!sess.results.length) { toast('No matching questions in the bank'); location.hash = '#bank'; return; } return finish(); }
    it.replays = 0;
    sess.item = it;
    sess.phase = 'reading';
    renderDrill();
    read(it);
  }
  function read(it) {
    stopAudio(); stopTimers();
    sess.phase = 'reading';
    it.t0 = null; it.cap = -1;
    it.pairs = chunkPairs(it.toks);
    renderStage();
    const p = playToks(it.toks, idx => { it.cap = idx; updateCaption(); });
    p.done.then(completed => {
      if (!sess || sess.item !== it || player !== p || !completed) return;
      player = null;
      it.t0 = performance.now();
      afterReading(it);
    });
  }
  const isTossup = it => it.mode === 'calc' || (it.mode === 'bank' && it.q.type === 'tossup');
  function afterReading(it) {
    if (it.mode === 'dict') { sess.phase = 'answer'; renderStage(); startTicker(); return; }
    if (isTossup(it)) { sess.phase = 'window'; renderStage(); startCountdown(S.settings.buzz, () => conclude(it, { ok: false, timeout: true, gotText: "(No buzz)" })); return; }
    sess.phase = 'bonus_window'; renderStage();
    startCountdown(S.settings.bonus, () => conclude(it, { ok: false, timeout: true, gotText: "(Timeout)" }));
  }
  function buzz() {
    const it = sess && sess.item;
    if (!it || !isTossup(it) || !['reading', 'window'].includes(sess.phase)) return;
    it.buzzAt = performance.now();
    it.interrupt = sess.phase === 'reading';
    if (it.interrupt) stopAudio();
    stopTimers(); sfx('buzz');
    sess.phase = 'answering'; renderStage(); startTicker();

    if (S.settings.mic !== false && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const inp = $('#ans');
      if (inp) {
        inp.disabled = true;
        inp.placeholder = "Recognizing team...";
      }
      const team = ['A', 'B'][Math.floor(Math.random() * 2)];
      const num = 1;
      const recVoice = TTS.play([`Team ${team}, ${team} ${num}`], { rate: 1, pause: 0, voice: S.settings.voice });
      recVoice.done.then(() => {
        if (!sess || sess.phase !== 'answering') return;
        const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SRec();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        activeRec = rec;
        if (inp) {
          inp.disabled = false;
          inp.placeholder = "🎤 Listening for answer...";
          inp.focus();
        }
        rec.onresult = e => {
          activeRec = null;
          const transcript = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript;
          if (transcript) {
            if ($('#ans')) $('#ans').value = transcript;
            submitTyped(false);
          }
        };
        rec.onerror = () => {
          activeRec = null;
          if ($('#ans')) {
            $('#ans').disabled = false;
            $('#ans').placeholder = "No voice heard, please type manually";
            $('#ans').focus();
          }
        };
        rec.onend = () => {
          activeRec = null;
          if ($('#ans') && $('#ans').disabled) $('#ans').disabled = false;
        };
        try {
          rec.start();
        } catch (err) {
          activeRec = null;
          if ($('#ans')) {
            $('#ans').disabled = false;
            $('#ans').placeholder = "Mic unavailable, please type answer";
            $('#ans').focus();
          }
        }
      });
    }
  }
  function answerBonus() {
    const it = sess && sess.item;
    if (!it || isTossup(it) || sess.phase !== 'bonus_window') return;
    stopTimers();
    sess.phase = 'answering'; renderStage(); startTicker();

    if (S.settings.mic !== false && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
      const inp = $('#ans');
      const SRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SRec();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      activeRec = rec;
      if (inp) {
        inp.placeholder = "🎤 Listening for bonus answer...";
        inp.focus();
      }
      rec.onresult = e => {
        activeRec = null;
        const transcript = e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript;
        if (transcript) {
          if ($('#ans')) $('#ans').value = transcript;
          submitTyped(false);
        }
      };
      rec.onerror = () => {
        activeRec = null;
        if ($('#ans')) {
          $('#ans').placeholder = "No voice heard, please type manually";
          $('#ans').focus();
        }
      };
      rec.onend = () => {
        activeRec = null;
      };
      try {
        rec.start();
      } catch (err) {
        activeRec = null;
        if ($('#ans')) {
          $('#ans').placeholder = "Mic unavailable, please type answer";
          $('#ans').focus();
        }
      }
    }
  }
  function replay() {
    const it = sess && sess.item;
    if (!it || it.mode !== 'dict' || !['answer', 'reading'].includes(sess.phase)) return;
    it.replays++;
    read(it);
  }
  function startCountdown(secs, onEnd) {
    clearInterval(cd);
    const end = performance.now() + secs * 1000;
    const step = () => {
      const left = (end - performance.now()) / 1000, el = $('#count');
      if (el) { el.querySelector('span').textContent = Math.max(0, left).toFixed(1); el.style.setProperty('--p', Math.max(0, left / secs)); }
      if (left <= 0) { clearInterval(cd); cd = null; onEnd(); }
    };
    step(); cd = setInterval(step, 100);
  }
  function startTicker() {
    clearInterval(tk);
    tk = setInterval(() => { const it = sess && sess.item, el = $('#tick'); if (el && it) { const from = it.buzzAt || it.t0; if (from) el.textContent = sec(performance.now() - from); } }, 100);
  }

  // answers
  function judgeMC(text, q) {
    const t = String(text || '').trim();
    const lm = t.match(/^(?:option|choice|letter)?\s*([WXYZ])\b/i) || t.match(/\b([WXYZ])\)?$/i);
    if (lm) {
      const letter = lm[1].toUpperCase();
      return { ok: letter === q.letter, letter, sure: true };
    }
    if (/^(why|yep|yes|white)$/i.test(t)) return { ok: 'Y' === q.letter, letter: 'Y', sure: true };
    if (/^(double\s*u|double\s*you)$/i.test(t)) return { ok: 'W' === q.letter, letter: 'W', sure: true };
    if (/^(ex|axe|eggs)$/i.test(t)) return { ok: 'X' === q.letter, letter: 'X', sure: true };
    if (/^(zee|zed)$/i.test(t)) return { ok: 'Z' === q.letter, letter: 'Z', sure: true };

    if (q.choices) {
      for (const L of LETTERS) {
        const ctext = q.choices[L];
        if (ctext && T.judge(t, ctext).ok) {
          return { ok: L === q.letter, letter: L, sure: true };
        }
      }
    }
    const j = T.judge(t, q.answer);
    if (j.ok) return { ok: true, letter: q.letter, sure: j.sure };
    return { ok: false, sure: false };
  }
  function choose(idx) {
    const it = sess.item;
    if (it.mode !== 'dict' || sess.style === 'type' || sess.phase !== 'answer' || idx >= it.options.length) return;
    const chosen = it.options[idx];
    conclude(it, { ok: chosen === it.target, chosen, chosenIdx: idx, gotText: E.str(chosen) });
  }
  function chooseLetter(L) {
    const it = sess.item;
    if (it.mode !== 'bank' || it.q.format !== 'mc' || sess.phase !== 'answering') return;
    const known = LETTERS.includes(it.q.letter);
    conclude(it, { ok: known && L === it.q.letter, sure: known, gotText: L });
  }
  function submitTyped(fromTimeout) {
    const it = sess.item, inp = $('#ans');
    if (!inp || !['answer', 'answering'].includes(sess.phase)) return;
    const text = inp.value.trim();
    if (!text) return;
    if (it.mode === 'dict') {
      const a = E.tryParse(text);
      if (!a) { if (!fromTimeout) return flashPreview('Unrecognized format, check parentheses'); }
      const ok = !!a && E.equiv(a, it.target, it.env);
      const sib = a && !ok ? it.options.find(o => o !== it.target && E.equiv(a, o, it.env)) : null;
      return conclude(it, { ok, chosen: sib || a, gotText: text });
    }
    if (it.mode === 'calc') {
      const a = T.answerAst(text);
      if (!a || E.vars(a).size) { if (!fromTimeout) return flashPreview('Please enter a number, e.g., 12, -3, 3/4'); return conclude(it, { ok: false, gotText: text }); }
      const v = E.ev(a), ok = E.close(v, it.answer);
      const diag = ok ? null : it.sib.find(s => isFinite(s.val) && E.close(s.val, v)) || null;
      return conclude(it, { ok, got: v, gotText: text, diag });
    }
    if (it.mode === 'bank' && it.q.format === 'mc') {
      const j = judgeMC(text, it.q);
      return conclude(it, { ok: j.ok, sure: j.sure, gotText: j.letter ? `${j.letter}) ${text}` : text });
    }
    const j = T.judge(text, it.q.answer);
    conclude(it, { ok: j.ok, sure: j.sure, gotText: text });
  }
  function flashPreview(msg) { const p = $('#pv'); if (p) { p.className = 'preview err'; p.textContent = msg; } }

  function conclude(it, res) {
    if (sess.phase === 'feedback') return;
    stopTimers(); stopAudio();
    const end = performance.now();
    res.rt = it.t0 ? end - it.t0 : it.buzzAt ? end - it.buzzAt : null;
    res.buzz = it.buzzAt ? (it.t0 ? it.buzzAt - it.t0 : -1) : null;
    if (res.sure === undefined) res.sure = true;
    it.res = res;
    sess.phase = 'feedback';
    sess.results.push(it);
    if (res.sure) record(it); else it.pending = true;
    if (!res.ok && it.mode !== 'bank' && !it.retry && res.sure) sess.retry.push({ mode: it.mode, cat: it.cat, at: sess.i + 3 });
    sfx(!res.sure ? 'buzz' : res.ok ? 'ok' : 'no');
    renderStage();
  }
  function record(it) {
    const r = it.res, t = Date.now(), ok = !!r.ok, rt = Math.round(r.rt || 0);
    const entry = { t, m: it.mode, c: it.cat, l: it.lvl, ok, rt, b: r.buzz == null ? null : Math.round(r.buzz), rp: it.replays || 0, q: it.q ? it.q.id : undefined };
    S.log.push(entry);
    if (S.log.length > 6000) S.log.splice(0, S.log.length - 6000);
    it.refs = { entry, h: [] };
    const cats = it.mode === 'bank' ? (it.q.tags || []) : [it.cat];
    for (const c of cats) {
      if (!C.CAT[c]) continue;
      const cr = catRec(c), h = { ok, rt, m: it.mode, l: it.lvl || 0, t, rp: it.replays || 0 };
      cr.n++; if (ok) cr.ok++; cr.h.push(h); if (cr.h.length > 40) cr.h.shift(); cr.last = t;
      it.refs.h.push([cr, h]);
    }
    if (it.mode === 'bank') {
      const b = S.bstats[it.q.id] || (S.bstats[it.q.id] = { n: 0, ok: 0 });
      b.n++; if (ok) b.ok++; b.last = t; b.lastOk = ok;
    } else adaptLevel(it.cat);
    if (!ok) addMistake(it);
    touchStreak(); save(); hud();
  }
  function addMistake(it) {
    const m = { t: it.refs.entry.t, m: it.mode, c: it.cat, l: it.lvl, toks: it.toks, got: it.res.gotText };
    if (it.mode === 'dict') { m.target = it.target; m.chosen = it.res.chosen || null; }
    if (it.mode === 'calc') { m.target = it.target; m.answer = it.answer; m.diag = it.res.diag ? it.res.diag.node : null; }
    if (it.mode === 'bank') m.q = it.q.id;
    S.mistakes.unshift(m);
    if (S.mistakes.length > 300) S.mistakes.length = 300;
  }
  // student overrides the auto-judge (bank short answers), or judges when it couldn't tell
  function judgeAs(ok) {
    const it = sess.item;
    if (it.pending) { it.pending = false; it.res.ok = ok; it.res.sure = true; record(it); renderStage(); return; }
    if (!it.refs || it.res.ok === ok) return;
    it.res.ok = ok;
    it.refs.entry.ok = ok;
    it.refs.h.forEach(([cr, h]) => { h.ok = ok; cr.ok += ok ? 1 : -1; });
    const b = S.bstats[it.q.id]; if (b) { b.ok += ok ? 1 : -1; b.lastOk = ok; }
    if (ok) S.mistakes = S.mistakes.filter(m => m.t !== it.refs.entry.t); else addMistake(it);
    save(); hud(); renderStage();
  }

  // ───────── drill rendering ─────────
  VIEWS.drill = () => {
    if (!sess) { location.hash = '#home'; return; }
    if (sess.done) return renderSummary();
    if (!sess.item) return nextItem();
    renderDrill();
  };
  function renderDrill() {
    main.innerHTML = `<section class="drill">
      <div class="drill-top">
        <div class="prog"><i style="width:${Math.round(sess.i / sess.len * 100)}%"></i></div>
        <span class="muted small">${Math.min(sess.i + 1, sess.len)} / ${sess.len}</span>
        <button class="btn sm ghost" data-act="quit">Quit</button>
      </div>
      <div class="card" id="stage"></div>
    </section>`;
    renderStage();
  }
  function stageHead(it) {
    if (it.mode === 'bank') {
      const q = it.q;
      return `<div class="stage-head"><span class="mode">${MODE.bank}</span><span class="tag subj">${esc(subjName(q.subject))}</span>${typeTag(q)}<span class="tag">${q.format === 'mc' ? 'Multiple Choice' : 'Short Answer'}</span>${it.retry ? '<span class="tag warn">Retry</span>' : ''}</div>`;
    }
    return `<div class="stage-head"><span class="mode">${MODE[it.mode]}</span><span class="tag">${esc(C.CAT[it.cat].name || C.CAT[it.cat].zh)} · L${it.lvl}</span>${it.retry ? '<span class="tag warn">Retry</span>' : ''}${it.mode === 'calc' ? '<span class="tag tu">toss-up</span>' : ''}</div>`;
  }
  function listenHTML(it, ph) {
    const on = ph === 'reading';
    const status = on ? 'Reading...' : it.interrupt ? 'You interrupted' : 'Reading finished';
    const sub = on ? (it.mode === 'dict' ? 'Listen closely for parentheses and pauses' : isTossup(it) ? 'Press Space anytime to buzz' : 'Answer after reading')
      : it.mode === 'dict' && ph === 'answer' ? `Replayed ${it.replays} times` : '';
    const showCap = S.settings.captions || silentMode();
    return `<div class="listen ${on ? 'on' : ''}"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div>
      <div><div class="st">${status}</div><div class="sub">${sub}</div></div></div>
      ${showCap && ph !== 'feedback' ? `<div class="caption" id="cap">${captionHTML(it)}</div>` : ''}`;
  }
  const captionHTML = it => it.pairs ? it.pairs.slice(0, it.cap + 1).map(p => `<b>${esc(p.show)}</b>`).join(' <span class="muted">‖</span> ') || '…' : '…';
  function updateCaption() { const el = $('#cap'); if (el && sess && sess.item) el.innerHTML = captionHTML(sess.item); }

  function renderStage() {
    const el = $('#stage');
    if (!el || !sess || !sess.item) return;
    const it = sess.item, ph = sess.phase;
    let h = stageHead(it);
    if (ph === 'feedback') h += feedbackHTML(it);
    else {
      h += listenHTML(it, ph);
      if (it.mode === 'dict') h += dictAnswerHTML(it, ph);
      else if (ph === 'answering') h += answerHTML(it);
      else if (isTossup(it)) h += `<div class="buzz-wrap"><button class="buzz" data-act="buzz"><b>BUZZ</b><small>${"Space / Tap"}</small></button>
          ${ph === 'window' ? `<div class="count" id="count"><span>${S.settings.buzz}</span></div>` : ''}</div>`;
      else {
        if (ph === 'reading') {
          h += `<p class="muted" style="margin-top:14px">${"Bonus requires no buzz, answer within "}${S.settings.bonus}${"s after reading."}</p>`;
        } else if (ph === 'bonus_window') {
          h += `<div class="buzz-wrap"><button class="buzz" data-act="answer-bonus" style="background:var(--ok);border-color:var(--ok-hard);color:white"><b>ANSWER</b><small>${"Click to Answer"}</small></button>
              <div class="count" id="count"><span>${S.settings.bonus}</span></div></div>`;
        }
      }
      
      const peekContent = it.mode === 'bank' ? `<div class="qtext small">${T.toHTML(it.q.text)}</div>${choicesHTML(it.q)}` : `<div class="m" style="margin:10px 0">${texN(it.target)}</div>`;
      h += `<div style="margin-top: 20px; border-top: 1px solid var(--bd); padding-top: 10px;">
              <button class="btn sm ghost" onclick="this.nextElementSibling.hidden = !this.nextElementSibling.hidden">${"👁️ Peek at Question"}</button>
              <div hidden style="margin-top: 10px">${peekContent}</div>
            </div>`;
    }
    el.innerHTML = h;
    const inp = $('#ans');
    if (inp) { inp.focus(); inp.addEventListener('input', livePreview); }
  }
  function dictAnswerHTML(it, ph) {
    const ready = ph === 'answer';
    const controls = `<div class="controls"><button class="btn ghost sm" data-act="replay" ${ready ? '' : 'disabled'}>🔁 Replay <kbd>R</kbd></button><span class="spacer"></span><span class="timer" id="tick">${ready ? '0.0s' : ''}</span></div>`;
    if (sess.style === 'type') {
      return ready ? `<div class="answer-row"><input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type what you heard, e.g. (xy)^2"><button class="btn" data-act="submit">Submit</button></div>
        <div class="preview" id="pv"></div>${controls}` : controls;
    }
    const visible = ready || S.settings.showOpts;
    return `<div class="opts ${visible ? '' : 'hidden'}">${it.options.map((o, i) => `<button class="opt" data-opt="${i}" ${ready ? '' : 'disabled'}><span class="L">${LETTERS[i]}</span><span class="m">${texN(o)}</span></button>`).join('')}</div>${controls}`;
  }
  function answerHTML(it) {
    const timer = `<div class="controls"><span class="muted small">${it.interrupt ? '⚡ Interrupted — wrong answers deduct 4 pts in games' : it.buzzAt ? `Reaction time ${sec(it.buzzAt - it.t0)}` : `Start answering...`}</span><span class="spacer"></span>
      <span class="timer" id="tick">0.0s</span></div>`;
    if (it.mode === 'bank' && it.q.format === 'mc') {
      return `<div class="letters">${LETTERS.map(L => `<button class="opt" data-letter="${L}">${L}</button>`).join('')}</div>
        <div class="answer-row" style="margin-top:10px"><input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Speak or type W/X/Y/Z or answer"><button class="btn" data-act="submit">Submit</button></div>
        <div class="preview" id="pv"></div>${timer}`;
    }
    return `<div class="answer-row"><input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${it.mode === 'calc' ? 'Answer (Number)' : 'Your Answer'}"><button class="btn" data-act="submit">Submit</button></div>
      <div class="preview" id="pv"></div>${timer}`;
  }
  function livePreview() {
    const inp = $('#ans'), pv = $('#pv');
    if (!inp || !pv) return;
    pv.className = 'preview';
    const s = inp.value.trim();
    if (!s) { pv.innerHTML = ''; return; }
    if (sess && sess.item && sess.item.mode === 'bank' && sess.item.q.format === 'mc') {
      const j = judgeMC(s, sess.item.q);
      pv.innerHTML = j.letter ? `<span class="muted small">Detected: <b>${j.letter}</b></span>` : '';
      return;
    }
    const a = sess.item.mode === 'dict' ? E.tryParse(s) : T.answerAst(s);
    pv.innerHTML = a ? '= ' + texN(a) : '<span class="muted small">…</span>';
  }
  function typeTag(q) { return q.type === 'bonus' ? '<span class="tag bo">BONUS</span>' : '<span class="tag tu">TOSS-UP</span>'; }
  function fbBanner(it) {
    const r = it.res;
    if (it.pending) return `<div class="fb ask">🤔 I can't grade this — check the answer yourself</div>`;
    const extra = r.timeout ? '(Timeout)' : it.interrupt && !r.ok ? '(Interrupted & wrong: -4 pts)' : it.interrupt ? '(Interrupted successfully ⚡)' : it.replays ? `（Replay ${it.replays} times）` : '';
    return `<div class="fb ${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓ Correct' : '✗ Incorrect'} <span class="small">${extra}</span><span class="rt">${r.rt != null ? sec(r.rt) : ''}</span></div>`;
  }
  function feedbackHTML(it) {
    const r = it.res, cat = C.CAT[it.cat];
    let h = fbBanner(it);
    if (it.mode === 'dict') {
      h += `<div class="kv"><span>Read</span><div class="m">${texN(it.target)}</div>${sayBtn(it.toks)}</div>
        <div class="transcript">${trHTML(it.toks)}</div>`;
      if (!r.ok && r.chosen) {
        const ct = E.speak(r.chosen);
        h += `<div class="kv"><span>${sess.style === 'type' ? 'You wrote' : 'You chose'}</span><div class="m">${texN(r.chosen)}</div>${sayBtn(ct)}</div>
          <div class="transcript">${trHTML(ct)}</div>
          <div class="row"><button class="btn sm ghost" data-contrast>🎧 Compare: question first, then your answer</button></div>`;
        it.contrast = [it.toks, ct];
      } else if (!r.ok) h += `<p class="muted">You wrote: <code>${esc(r.gotText || '')}</code> (unrecognized format)</p>`;
    } else if (it.mode === 'calc') {
      h += `<div class="kv"><span>Correct Answer</span><div class="m">${K(String(it.answer))}</div><span></span></div>
        <div class="kv"><span>Your Answer</span><div class="m">${esc(r.gotText || '—')}</div><span></span></div>`;
      if (r.diag) {
        const dt = E.speak(r.diag.node);
        h += `<div class="diag">🔍 Your answer is exactly the value of ${texN(r.diag.node)} — you misheard ${texN(it.target)} as this.<br>
          Question: <b>${trHTML(E.speak(it.target))}</b> ${sayBtn(E.speak(it.target))}<br>You heard: <b>${trHTML(dt)}</b> ${sayBtn(dt)}</div>`;
      } else if (!r.ok && !r.timeout) h += `<p class="muted small">Your answer isn't a common mishearing — structure might be right, but calculation was wrong.</p>`;
      h += `<div class="kv"><span>Question</span><div class="m">${texN(it.target)}</div>${sayBtn(it.toks)}</div><div class="transcript">${trHTML(it.toks)}</div>`;
      if (it.buzzAt && !it.interrupt) h += `<p class="muted small">Buzz reaction ${sec(r.buzz)} (from end of reading to buzz)</p>`;
    } else {
      const q = it.q;
      h += `<div class="qtext">${T.toHTML(q.text)}</div>${choicesHTML(q)}
        <div class="kv"><span>Official Answer</span><div>${T.toHTML(q.answer)}</div><span></span></div>
        <div class="kv"><span>Your Answer</span><div>${esc(r.gotText || '—')}</div><span></span></div>`;
      if (it.pending) h += `<div class="row" style="margin:8px 0"><button class="btn good" data-judge="1">✓ I was right</button><button class="btn bad" data-judge="0">✗ I was wrong</button></div>`;
      else if (q.format === 'sa' && !r.timeout) h += `<p class="small muted">Graded wrong?<a href="#" data-judge="${r.ok ? 0 : 1}">Regrade as ${r.ok ? 'Wrong' : 'Correct'}</a></p>`;
      h += `<details><summary class="muted small">Transcript ${sayBtn(it.toks)}</summary><div class="transcript">${trHTML(it.toks)}</div></details>`;
      if (q.tags && q.tags.length) h += `<p class="small muted">Related structures: ${q.tags.map(t => C.CAT[t] ? esc(C.CAT[t].zh) : t).join('、')}</p>`;
    }
    if (cat && !(it.mode === 'bank')) h += `<div class="tip">💡 ${esc(cat.tip)}</div>`;
    h += `<div class="controls"><span class="spacer"></span><button class="btn" data-act="next" ${it.pending ? 'disabled' : ''}>${sess.i + 1 >= sess.len ? 'Summary' : 'Next'} <kbd>Enter</kbd></button></div>`;
    return h;
  }
  function choicesHTML(q, mark = true) {
    if (q.format !== 'mc' || !q.choices) return '';
    return `<ul class="choices">${LETTERS.map(L => `<li class="${mark && L === q.letter ? 'right' : ''}"><b>${L})</b><span>${T.toHTML(q.choices[L] || '')}</span></li>`).join('')}</ul>`;
  }

  function finish() {
    stopAudio(); stopTimers();
    sess.done = true;
    renderSummary();
  }
  function renderSummary() {
    const R = sess.results.filter(it => it.res && !it.pending);
    const ok = R.filter(it => it.res.ok).length;
    const rts = R.filter(it => it.res.ok && it.res.rt).map(it => it.res.rt);
    const wrongCats = [...new Set(R.filter(it => !it.res.ok && it.cat && C.CAT[it.cat]).map(it => it.cat))];
    main.innerHTML = `<section class="drill"><div class="card">
      <h2>Session Complete ${ok === R.length && R.length ? '🎉' : ''}</h2>
      <div class="summary-top">
        <div><b>${ok}/${R.length}</b><span>Correct</span></div>
        <div><b>${R.length ? pct(ok / R.length) : '—'}</b><span>Accuracy</span></div>
        <div><b>${sec(median(rts))}</b><span>Median RT for correct answers</span></div>
      </div>
      <div class="res-list">${R.map(it => `
        <div class="res-item"><span>${it.res.ok ? '<span style="color:var(--status-good)">✓</span>' : '<span style="color:var(--status-bad)">✗</span>'}</span>
          <div class="m">${it.mode === 'bank' ? `<span class="small">${T.toHTML(it.q.text)}</span>` : texN(it.target)}</div>
          <span class="tag">${it.mode === 'bank' ? 'Official' : esc(C.CAT[it.cat].zh)}</span>${sayBtn(it.toks)}</div>`).join('')}</div>
      <div class="row" style="margin-top:18px">
        <button class="btn" data-act="again">Another Round</button>
        ${wrongCats.length ? `<button class="btn ghost" data-start="smart" data-cats="${wrongCats.join(',')}">Drill missed ${wrongCats.length} categories</button>` : ''}
        <span class="spacer"></span><a class="btn ghost" href="#home">Back to Home</a>
      </div></div></section>`;
  }

  // ───────── bank ─────────
  const bankF = { q: '', subject: 'all', type: 'all', src: 'all', tag: 'all', year: 'all', round: 'all', missed: false, shown: 30 };
  const srcName = q => q.src && q.src.file ? q.src.file + (q.src.round ? ` · R${q.src.round}` : '') : 'Manually added';
  function filteredBank() {
    const s = bankF.q.trim().toLowerCase();
    return S.bank.filter(q => (bankF.subject === 'all' || q.subject === bankF.subject)
      && (bankF.type === 'all' || q.type === bankF.type)
      && (bankF.src === 'all' || srcName(q) === bankF.src)
      && (bankF.year === 'all' || q.year === bankF.year)
      && (bankF.round === 'all' || (q.src && String(q.src.round) === bankF.round))
      && (bankF.tag === 'all' || (bankF.tag === 'none' ? !(q.tags || []).length : (q.tags || []).includes(bankF.tag)))
      && (!bankF.missed || (S.bstats[q.id] && S.bstats[q.id].ok < S.bstats[q.id].n))
      && (!s || (q.text + ' ' + q.answer).toLowerCase().includes(s)));
  }
  function qCard(q) {
    const b = S.bstats[q.id];
    return `<div class="qcard" data-qid="${q.id}">
      <div class="meta">${typeTag(q)}<span class="tag subj">${esc(subjName(q.subject))}</span><span class="tag">${q.format === 'mc' ? 'MCQ' : 'SA'}</span><span class="tag">${esc(srcName(q))}</span>
        ${(q.tags || []).map(t => C.CAT[t] ? `<span class="tag">${esc(C.CAT[t].zh)}</span>` : '').join('')}
        ${b ? `<span class="tag ${b.lastOk ? 'ok' : 'bad'}">Attempted ${b.n} times · Correct ${b.ok}</span>` : ''}</div>
      <div class="qtext">${T.toHTML(q.text)}</div>${choicesHTML(q)}
      <div class="ans"><b>ANSWER:</b> ${T.toHTML(q.answer)}</div>
      <div class="acts">${sayBtn(bankToks(q), '🔊 Listen')}<button class="btn sm ghost" data-practice="${q.id}">▶ Drill this</button>
        <button class="btn sm ghost" data-edit="${q.id}">✏️ Edit</button><button class="btn sm danger" data-del="${q.id}">Delete</button></div>
    </div>`;
  }
  VIEWS.bank = () => {
    const srcs = [...new Set(S.bank.map(srcName))];
    const list = filteredBank();
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    const subjBreakdown = SUBJECTS.filter(s => s.id !== 'all').map(s => `${s.name}: ${S.bank.filter(q => q.subject === s.id).length}`).join(' · ');
    main.innerHTML = `
      <div class="card">
        <div class="row"><h2 style="margin:0">📚 Bank</h2><span class="spacer"></span>
          <button class="btn" data-act="import">📄 Import PDF / Text</button><button class="btn ghost" data-act="new-q">＋ New Q</button></div>
        <p class="muted small">Total ${S.bank.length} questions (${subjBreakdown}). Official: ${S.bank.filter(q => q.year).length} · Custom: ${S.customBank.length}.</p>
        <div class="toolbar">
          <input type="search" id="bq" placeholder="Search questions or answers" value="${esc(bankF.q)}">
          <select data-bf="subject">${SUBJECTS.map(s => opt(s.id, s.name, bankF.subject)).join('')}</select>
          <select data-bf="year">${opt('all', 'All Years', bankF.year)}${YEARS.map(y => opt(y, y, bankF.year)).join('')}</select>
          <select data-bf="round">${opt('all', 'All Rounds', bankF.round)}${ROUNDS.map(r => opt(r, 'Round ' + r, bankF.round)).join('')}</select>
          <select data-bf="type">${opt('all', 'All Types', bankF.type)}${opt('tossup', 'Toss-up', bankF.type)}${opt('bonus', 'Bonus', bankF.type)}</select>
          <select data-bf="src">${opt('all', 'All Sources', bankF.src)}${srcs.map(s => opt(s, s, bankF.src)).join('')}</select>
          <select data-bf="tag">${opt('all', 'All Structures', bankF.tag)}${C.CATS.map(c => opt(c.id, c.name || c.zh, bankF.tag)).join('')}${opt('none', '(Untagged)', bankF.tag)}</select>
        </div>
        <div class="row"><label class="small"><input type="checkbox" data-bf="missed" ${bankF.missed ? 'checked' : ''}> Show Missed Only</label><span class="spacer"></span>
          <button class="btn sm" data-act="bank-practice" ${list.length ? '' : 'disabled'}>▶ Drill these <span id="bcount">${list.length}</span> Qs</button>
          <button class="btn sm ghost" data-act="export">Export Backup</button><button class="btn sm ghost" data-act="restore">Import Backup</button></div>
      </div>
      <div id="blist">${bankListHTML(list)}</div>`;
    $('#bq').addEventListener('input', e => { bankF.q = e.target.value; bankF.shown = 30; const l = filteredBank(); $('#blist').innerHTML = bankListHTML(l); $('#bcount').textContent = l.length; });
  };
  const bankListHTML = list => list.length
    ? list.slice(0, bankF.shown).map(qCard).join('') + (list.length > bankF.shown ? `<div class="row"><button class="btn ghost" data-act="more">Show ${Math.min(30, list.length - bankF.shown)} Qs</button></div>` : '')
    : '<div class="card muted">No matching questions.</div>';
  document.addEventListener('change', e => {
    const f = e.target.closest('[data-bf]');
    if (f) { bankF[f.dataset.bf] = f.type === 'checkbox' ? f.checked : f.value; bankF.shown = 30; route(); }
  });

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'nsb-trainer', v: 1, exported: new Date().toISOString(), data: S }, (k, v) => k === 'bank' ? undefined : v, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `nsb-trainer-${dayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function restoreData() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text());
        if (j.app !== 'nsb-trainer' || !j.data) throw new Error('Not a valid backup file from this app');
        if (!confirm(`Use backup（${j.exported ? j.exported.slice(0, 10) : 'UnknownDate'}）Overwrite current question bank and drill history？`)) return;
        const d = defaults();
        S = { ...d, ...j.data, settings: { ...d.settings, ...j.data.settings } };
        // Migration if restoring old backup
        if (S.bank && !S.customBank) {
            S.customBank = S.bank.filter(q => !q.id.startsWith('seed-'));
        }
        applyBank(); save(); applyTheme(); hud(); route(); toast('✓ Backup restored');
      } catch (err) { toast('⚠️ Import failed: ' + esc(err.message)); }
    };
    inp.click();
  }

  // import modal
  let imp = null;
  function openImport() {
    imp = { items: [], files: [] };
    modal(`<h3>📄 Import PDF / Text</h3>
      <p class="muted small">Select NSB question set PDFs (can select multiple). Parses standard DOE format (TOSS-UP / BONUS, Short Answer / Multiple Choice, ANSWER). Requires text-selectable PDFs.</p>
      <label class="drop" id="drop"><input type="file" id="imp-file" accept="application/pdf,.pdf,.txt,text/plain" multiple>Click here to select PDF, or drag files here</label>
      <details style="margin-top:10px"><summary class="small muted">Or paste question text</summary>
        <textarea id="imp-text" rows="7" placeholder="TOSS-UP&#10;1) MATH Short Answer What is ...&#10;ANSWER: 12"></textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="imp-text">Parse text</button></div></details>
      <div id="imp-status" class="small" style="margin-top:12px"></div>
      <div id="imp-list"></div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-close>Close</button><span class="spacer"></span><button class="btn" id="imp-add" data-act="imp-add" disabled>Add to Bank</button></div>`);
    const drop = $('#drop');
    $('#imp-file').addEventListener('change', e => importFiles([...e.target.files]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); importFiles([...e.dataTransfer.files]); });
  }
  const impStatus = html => { const el = $('#imp-status'); if (el) el.innerHTML = html; };
  async function importFiles(files) {
    for (const f of files) {
      try {
        impStatus(`Reading ${esc(f.name)} …`);
        let text, round = '';
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const r = await I.pdfToText(await f.arrayBuffer(), (p, n) => impStatus(`Reading ${esc(f.name)}：page ${p}/${n} `));
          text = r.text; round = r.round;
        } else text = await f.text();
        addParsed(I.parseNSB(text, { file: f.name.replace(/\.(pdf|txt)$/i, ''), round }), f.name);
      } catch (err) {
        imp.files.push({ name: f.name, err: err.message || String(err) });
      }
    }
    renderImport();
  }
  function addParsed(r, name) {
    const existing = new Set(S.bank.map(q => I.dupKey(q.text)));
    imp.files.push({ name, counts: r.counts, warnings: r.warnings, found: r.found, total: r.questions.length });
    for (const q of r.questions) {
      const item = I.toBankItem(q);
      const dup = existing.has(I.dupKey(item.text)) || imp.items.some(x => I.dupKey(x.item.text) === I.dupKey(item.text));
      imp.items.push({ item, on: !dup, dup });
    }
  }
  function renderImport() {
    if (!imp || !$('#imp-list')) return;
    impStatus(imp.files.map(f => f.err ? `<p>⚠️ <b>${esc(f.name)}</b>：${esc(f.err)}</p>`
      : `<p><b>${esc(f.name)}</b>: Found ${f.found} Qs (${Object.entries(f.counts).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') || 'None'}), Total: ${f.total} Qs.
        ${f.found === 0 ? '<br>⚠️ No question format found. Might be a scanned PDF or different format — try pasting the text instead.' : ''}
        ${f.warnings.length ? `<br><span class="muted">${f.warnings.map(esc).join('<br>')}</span>` : ''}</p>`).join(''));
    $('#imp-list').innerHTML = imp.items.length ? `<div class="row small" style="margin:6px 0"><a href="#" data-act="imp-all">Select All</a><a href="#" data-act="imp-none">Deselect All</a><span class="muted">Duplicates are unchecked by default</span></div>` +
      imp.items.map((x, i) => `<label class="imp-item ${x.dup ? 'dup' : ''}"><input type="checkbox" data-imp="${i}" ${x.on ? 'checked' : ''}>
        <div><div class="meta">${typeTag(x.item)} <span class="tag">${x.item.format === 'mc' ? 'MCQ' : 'SA'}</span> ${x.dup ? '<span class="tag warn">In Bank</span>' : ''}
          ${x.item.tags.map(t => `<span class="tag">${esc(C.CAT[t].zh)}</span>`).join('')}</div>
          <div class="qtext small">${T.toHTML(x.item.text)}</div>${choicesHTML(x.item)}<div class="small"><b>ANSWER:</b> ${T.toHTML(x.item.answer)}</div></div></label>`).join('') : '';
    const n = imp.items.filter(x => x.on).length;
    const b = $('#imp-add'); if (b) { b.disabled = !n; b.textContent = `Add to Bank (${n}）`; }
  }
  document.addEventListener('change', e => {
    const c = e.target.closest('[data-imp]');
    if (c && imp) { imp.items[+c.dataset.imp].on = c.checked; const n = imp.items.filter(x => x.on).length; const b = $('#imp-add'); b.disabled = !n; b.textContent = `Add to Bank (${n}）`; }
  });

  // edit modal
  function openEdit(id) {
    const q = id ? qById(id) : { id: null, subject: 'math', type: 'tossup', format: 'sa', text: '', answer: '', choices: null, letter: '', src: { file: '' } };
    if (!q) return;
    const ch = q.choices || { W: '', X: '', Y: '', Z: '' };
    modal(`<h3>${id ? '✏️ Edit Q' : '＋ New Q'}</h3>
      <div class="row">
        <select id="ed-subj" style="width:auto">${SUBJECTS.filter(s => s.id !== 'all').map(s => `<option value="${s.id}" ${q.subject === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select id="ed-type" style="width:auto"><option value="tossup">Toss-up</option><option value="bonus">Bonus</option></select>
        <select id="ed-fmt" style="width:auto"><option value="sa">Short Answer</option><option value="mc">Multiple Choice</option></select></div>
      <label class="field">Question (put math expressions in $...$, e.g., $(2x+1)^2$; transcript will update)</label><textarea id="ed-text" rows="4">${esc(q.text)}</textarea>
      <div id="ed-mc"><label class="field">Options</label>${LETTERS.map(L => `<div class="row" style="margin-bottom:6px"><b style="width:22px">${L})</b><input data-ch="${L}" style="flex:1" value="${esc(ch[L] || '')}"></div>`).join('')}</div>
      <label class="field">Answer <span class="muted">(Can write '21/2 (ACCEPT: 10.5)')</span></label>
      <div class="row"><select id="ed-letter" style="width:auto"><option value="">—</option>${LETTERS.map(L => `<option ${q.letter === L ? 'selected' : ''}>${L}</option>`).join('')}</select><input id="ed-ans" style="flex:1" value="${esc(q.format === 'mc' ? (q.choices && q.choices[q.letter]) || '' : q.answer)}"></div>
      <label class="field">Preview</label><div class="card flat" id="ed-pv" style="margin:0"></div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-close>Cancel</button><span class="spacer"></span><button class="btn" data-save-q="${id || ''}">Save</button></div>`);
    $('#ed-subj').value = q.subject || 'math'; $('#ed-type').value = q.type; $('#ed-fmt').value = q.format;
    const upd = () => {
      const d = editDraft(q);
      $('#ed-mc').style.display = d.format === 'mc' ? '' : 'none';
      $('#ed-letter').style.display = d.format === 'mc' ? '' : 'none';
      const toks = bankToks(d);
      $('#ed-pv').innerHTML = `<div class="qtext">${T.toHTML(d.text)}</div>${choicesHTML(d)}<div class="small"><b>ANSWER:</b> ${T.toHTML(d.answer)}</div>
        <div class="transcript small" style="margin-top:8px">${trHTML(toks)}</div>${sayBtn(toks, '🔊 Listen once')}`;
    };
    $$('#modal-box input, #modal-box textarea, #modal-box select').forEach(el => el.addEventListener('input', upd));
    upd();
  }
  function editDraft(q) {
    const format = $('#ed-fmt').value;
    const choices = format === 'mc' ? Object.fromEntries(LETTERS.map(L => [L, $(`[data-ch="${L}"]`).value.trim()])) : null;
    const letter = format === 'mc' ? $('#ed-letter').value : '';
    const ans = $('#ed-ans').value.trim();
    return { ...q, subject: $('#ed-subj').value, type: $('#ed-type').value, format, text: $('#ed-text').value.trim(), choices, letter,
      answer: format === 'mc' ? `${letter}) ${ans || (choices[letter] || '')}` : ans };
  }
  function saveEdit(id) {
    const base = id ? qById(id) : { id: 'q' + Date.now().toString(36), subject: 'math', src: { file: '' }, added: Date.now() };
    const d = editDraft(base);
    if (!d.text) return toast('Question text cannot be empty');
    if (d.format === 'mc' && !d.letter) return toast('MCQquestion requiresonecorrect letter');
    d.tags = T.tagsOfText(d.text, ...Object.values(d.choices || {}));
    if (id) {
      const idx = (S.customBank || []).findIndex(q => q.id === id);
      if (idx >= 0) {
        S.customBank[idx] = d;
      } else {
        // Editing a built-in question: clone it to customBank and mark original as deleted
        if (!S.customBank) S.customBank = [];
        S.customBank.unshift(d);
        if (!S.deletedIds) S.deletedIds = [];
        S.deletedIds.push(id);
      }
    } else {
      if (!S.customBank) S.customBank = [];
      S.customBank.unshift(d);
    }
    applyBank();
    save(); closeModal(); route(); toast('✓ Saved');
  }

  // ───────── stats ─────────
  function days14() {
    const out = [];
    for (let i = 13; i >= 0; i--) { const t = Date.now() - i * DAY, d = new Date(t); out.push({ key: dayStr(t), label: `${d.getMonth() + 1}/${d.getDate()}`, n: 0, ok: 0 }); }
    const idx = Object.fromEntries(out.map((d, i) => [d.key, i]));
    for (const x of S.log) { const i = idx[dayStr(x.t)]; if (i != null) { out[i].n++; if (x.ok) out[i].ok++; } }
    return out;
  }
  const niceMax = v => { if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p; return 10 * p; };
  const barPath = (x, y, w, h, r = 4) => { r = Math.min(r, h, w / 2); return h <= 0 ? '' : `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  function barChart(days) {
    const Wd = 420, H = 190, l = 28, r = 6, t = 10, b = 24, iw = Wd - l - r, ih = H - t - b;
    const max = niceMax(Math.max(1, ...days.map(d => d.n))), band = iw / days.length, bw = Math.max(6, band * 0.62);
    const y = v => t + ih - v / max * ih;
    let s = `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Daily questions over the last 14 days">`;
    for (const v of [0, max / 2, max]) s += `<line class="gl" x1="${l}" x2="${Wd - r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    days.forEach((d, i) => {
      const x = l + i * band + (band - bw) / 2;
      s += `<rect class="hit" x="${l + i * band}" y="${t}" width="${band}" height="${ih}" data-tip="${d.label} · ${d.n} Qs${d.n ? ` · Accuracy ${pct(d.ok / d.n)}` : ''}"/>`;
      s += `<path class="bar" d="${barPath(x, y(d.n), bw, t + ih - y(d.n))}" pointer-events="none"/>`;
      if ((13 - i) % 3 === 0) s += `<text x="${l + i * band + band / 2}" y="${H - 6}" text-anchor="middle">${d.label}</text>`;
    });
    return s + '</svg>';
  }
  function lineChart(days) {
    const Wd = 420, H = 190, l = 36, r = 6, t = 12, b = 24, iw = Wd - l - r, ih = H - t - b, band = iw / days.length;
    const y = v => t + ih - v * ih, x = i => l + i * band + band / 2;
    const pts = days.map((d, i) => d.n ? { i, v: d.ok / d.n, d } : null).filter(Boolean);
    let s = `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Daily accuracy over the last 14 days">`;
    for (const v of [0, .5, 1]) s += `<line class="gl" x1="${l}" x2="${Wd - r}" y1="${y(v)}" y2="${y(v)}"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`;
    if (pts.length > 1) s += `<path class="line" d="${pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join('')}"/>`;
    pts.forEach(p => { s += `<g class="pt"><circle class="dot" cx="${x(p.i)}" cy="${y(p.v)}" r="4.5"/><circle class="hit" cx="${x(p.i)}" cy="${y(p.v)}" r="13" data-tip="${p.d.label} · Accuracy ${pct(p.v)}（${p.d.ok}/${p.d.n}）"/></g>`; });
    days.forEach((d, i) => { if ((13 - i) % 3 === 0) s += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${d.label}</text>`; });
    return s + '</svg>';
  }
  VIEWS.stats = () => {
    const L = S.log, wk = L.filter(x => x.t > Date.now() - 7 * DAY);
    const rt = m => median(L.filter(x => x.m === m && x.ok && x.rt > 0).slice(-40).map(x => x.rt));
    const buzz = median(L.filter(x => x.b != null && x.b >= 0).slice(-40).map(x => x.b));
    const days = days14();
    const infos = C.CATS.map(c => ({ c, ...catInfo(c.id) })).sort((a, b) => b.score - a.score);
    main.innerHTML = `
      <div class="tiles">
        <div class="tile"><span>Total Drills</span><b>${L.length}</b></div>
        <div class="tile"><span>Last 7 Days Acc</span><b>${wk.length ? pct(wk.filter(x => x.ok).length / wk.length) : '—'}</b></div>
        <div class="tile"><span>Dictation RT (Median)</span><b>${sec(rt('dict'))}</b></div>
        <div class="tile"><span>Buzz RT (Median)</span><b>${sec(buzz)}</b></div>
      </div>
      <div class="grid two viz-root">
        <div class="card"><h3>Daily Qs</h3>${barChart(days)}</div>
        <div class="card"><h3>Daily Acc</h3>${lineChart(days)}</div>
      </div>
      <details class="card flat small"><summary>Data Table</summary><div class="tbl-wrap"><table class="tbl"><tr><th>Date</th><th>Questions</th><th>Correct</th><th>Accuracy</th></tr>
        ${days.map(d => `<tr><td>${d.label}</td><td class="num">${d.n}</td><td class="num">${d.ok}</td><td class="num">${d.n ? pct(d.ok / d.n) : '—'}</td></tr>`).join('')}</table></div></details>
      <div class="card">
        <div class="row"><h3 style="margin:0">Confusable Structures</h3><span class="spacer"></span><span class="muted small">Sorted by need · RT starts after reading</span></div>
        <div class="tbl-wrap" style="margin-top:8px"><table class="tbl">
          <tr><th>Category</th><th>Level</th><th>Times</th><th>Recent Acc</th><th>Last 10 Times</th><th>Dictation</th><th>Math</th><th></th></tr>
          ${infos.map(i => `<tr>
            <td><b>${esc(i.c.zh)}</b><div class="small muted">${egHTML(i.c.eg)}</div></td>
            <td class="lvl">L${i.lvl}</td><td class="num">${i.n}</td>
            <td><div class="accbar"><s><i style="width:${i.acc == null ? 0 : Math.round(i.acc * 100)}%"></i></s><span class="num">${pct(i.acc)}</span></div></td>
            <td><span class="dots">${i.recent.slice(-10).map(x => x.ok ? '<span class="y" title="Correct">✓</span>' : '<span class="n" title="Wrong">✗</span>').join('') || '<span class="muted">—</span>'}</span></td>
            <td class="num">${sec(i.rtDict)}</td><td class="num">${sec(i.rtCalc)}</td>
            <td><button class="btn sm ghost" data-start="smart" data-cats="${i.id}">Drill</button></td></tr>`).join('')}
        </table></div>
      </div>`;
  };

  // ───────── mistakes ─────────
  const ago = t => { const m = (Date.now() - t) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))}  mins ago` : m < 1440 ? `${Math.round(m / 60)}  hours ago` : `${Math.round(m / 1440)}  days ago`; };
  VIEWS.mistakes = () => {
    const M = S.mistakes;
    const cats = [...new Set(M.slice(0, 30).map(m => m.c).filter(c => C.CAT[c]))];
    const bankIds = [...new Set(M.filter(m => m.q && qById(m.q)).map(m => m.q))];
    main.innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">📕 Mistakes</h2><span class="spacer"></span>
        ${cats.length ? `<button class="btn" data-start="smart" data-cats="${cats.join(',')}">▶ Redo recently missed ${cats.length} categories</button>` : ''}
        ${bankIds.length ? `<button class="btn ghost" data-act="redo-bank">▶ Redo missed official Qs (${bankIds.length}）</button>` : ''}</div>
        <p class="muted small">Every wrong question can be replayed. Dictation and Math modes will generate new questions of the same type instead of letting you memorize answers.</p></div>
      ${M.length ? M.slice(0, 80).map((m, i) => mistakeCard(m, i)).join('') : '<div class="card muted">No mistakes yet.</div>'}`;
  };
  function mistakeCard(m, i) {
    let body = '';
    if (m.m === 'dict') {
      body = `<div class="kv"><span>Read</span><div class="m">${texN(m.target)}</div>${sayBtn(m.toks)}</div>` +
        (m.chosen ? `<div class="kv"><span>You answered</span><div class="m">${texN(m.chosen)}</div>${sayBtn(E.speak(m.chosen))}</div>` : `<div class="kv"><span>You answered</span><div><code>${esc(m.got || '')}</code></div><span></span></div>`) +
        `<div class="transcript small">${trHTML(m.toks)}</div>`;
    } else if (m.m === 'calc') {
      body = `<div class="transcript small">${trHTML(m.toks)}</div>
        <div class="kv"><span>Correct Answer</span><div>${esc(String(m.answer))}</div>${sayBtn(m.toks)}</div>
        <div class="kv"><span>You answered</span><div>${esc(m.got || '—')}${m.diag ? ` <span class="small muted">= ${texN(m.diag)} value (misheard ${texN(m.target)} as this)</span>` : ''}</div><span></span></div>`;
    } else {
      const q = qById(m.q);
      body = q ? `<div class="qtext small">${T.toHTML(q.text)}</div>${choicesHTML(q)}<div class="kv"><span>Official Answer</span><div>${T.toHTML(q.answer)}</div>${sayBtn(bankToks(q))}</div>
        <div class="kv"><span>You answered</span><div>${esc(m.got || '—')}</div><span></span></div>` : '<p class="muted">(Question deleted from bank)</p>';
    }
    return `<div class="qcard"><div class="meta"><span class="tag">${MODE[m.m]}</span>${C.CAT[m.c] ? `<span class="tag">${esc(C.CAT[m.c].zh)}${m.l ? ' · L' + m.l : ''}</span>` : ''}<span class="muted small">${ago(m.t)}</span>
      <span class="spacer"></span><button class="btn sm ghost" data-rm-mistake="${i}" title="Remove from mistakes">✕</button></div>${body}</div>`;
  }

  // ───────── reading guide ─────────
  VIEWS.guide = () => {
    const ex = s => { const a = E.parse(s), toks = E.speak(a); return `<div class="ex"><div class="m">${texN(a)}</div><div class="r">${trHTML(toks)} ${sayBtn(toks)}</div></div>`; };
    main.innerHTML = `
      <div class="card">
        <h2>📖 How NSB reads math expressions</h2>
        <p>In competition, expressions are read only once without paper. Knowing where the parentheses are relies on fixed phrasing:</p>
        <ul>
          <li><b class="cue">the quantity</b> = left parenthesis; the following <b>pause</b> (marked as <i class="pz">‖</i> here) = right parenthesis.</li>
          <li><b>squared / cubed / to the 5th power</b> only applies to the immediately adjacent <b>one</b> symbol; to apply to a whole block, 'the quantity' must precede it.</li>
          <li><b>over</b> is the fraction line. If the denominator is a monomial (2x), read it directly; if it's a sum or difference, say 'over the quantity ...'.</li>
          <li><b>negative 3 squared</b> is −9; (−3)² is read as 'the quantity negative 3, squared'.</li>
          <li>Functions: <b>sine of …</b>、<b>log base 2 of …</b>、<b>f of …</b>; 'sine squared of x' is (sin x)².</li>
          <li>Constant fractions are read as <b>one-half、two-thirds、three-fourths</b>; 'one-half x' is x/2, '1 over 2x' is 1/(2x).</li>
        </ul>
        <p class="muted small">Rules: Buzz within 5s after toss-up reading. You can interrupt, but wrong answers after interrupt give opponents 4 pts. Only correct toss-ups get a bonus, 20s to answer bonus. MCQ options are W, X, Y, Z.</p>
      </div>
      <div class="card">
        <h3>🧪 Try it: Enter an expression, hear how NSB reads it</h3>
        <input id="play-in" placeholder="e.g., (x+1)^2/(x-1), sqrt(2x)+1, -3^2, log_2(x+4)" autocomplete="off" spellcheck="false">
        <div id="play-out" style="margin-top:10px"></div>
      </div>
      ${C.CATS.map(c => `<div class="card"><div class="row"><h3 style="margin:0">${esc(c.zh)}</h3><span class="spacer"></span><button class="btn sm ghost" data-start="dict" data-cats="${c.id}">Drill this type</button></div>
        <p class="muted small" style="margin-top:6px">${esc(c.tip)}</p><div class="rule">${c.eg.split(' vs ').map(ex).join('')}</div></div>`).join('')}`;
    $('#play-in').addEventListener('input', e => {
      const s = e.target.value.trim(), out = $('#play-out');
      if (!s) { out.innerHTML = ''; return; }
      try {
        const a = E.parse(s), toks = E.speak(a), v = E.vars(a).size ? null : E.ev(a);
        out.innerHTML = `<div class="kv" style="border:0"><span>Transcribed</span><div class="m">${texN(a)}</div>${sayBtn(toks)}</div>
          <div class="transcript">${trHTML(toks)}</div>${v != null && isFinite(v) ? `<p class="muted small">Value = ${E.fmtNum(v)}</p>` : ''}`;
      } catch (err) { out.innerHTML = `<p class="muted small">${esc(err.message)}</p>`; }
    });
  };

  // ───────── settings ─────────
  function openSettings() {
    const st = S.settings, vs = TTS.voices();
    modal(`<h3>⚙️ Settings</h3>
      <label class="field">TTS Voice</label>
      <div class="row"><select id="st-voice" style="flex:1"><option value="">Auto (Prefers Samantha / Google US English)</option>
        ${vs.map(v => `<option value="${esc(v.name)}" ${st.voice === v.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}</select>
        <button class="btn sm ghost" data-act="test-voice">Test</button></div>
      ${!TTS.available() ? '<p class="small" style="color:var(--bad)">This browser does not support text-to-speech.</p>' : !vs.length ? '<p class="small muted">Voice list is still loading, open settings later.</p>' : ''}
      <label class="field">Speech Rate <span id="rate-v">${st.rate.toFixed(2)}</span> (Comp is ~0.9-1.1)</label><input type="range" id="st-rate" min="0.6" max="1.4" step="0.05" value="${st.rate}">
      <label class="field">Pause Duration <span id="pause-v">${st.pause}</span> ms (shorter = harder)</label><input type="range" id="st-pause" min="120" max="900" step="20" value="${st.pause}">
      <label class="field">Smart Drill Qs per Session</label>${segHTML('settings.len', st.len, [[5, 5], [10, 10], [15, 15], [20, 20]])}
      <label class="field">Toss-up Buzz Time (after reading)</label>${segHTML('settings.buzz', st.buzz, [[3, '3 sec'], [5, '5 sec (comp)'], [8, '8 sec']])}
      <label class="field">Bonus Answer Time</label>${segHTML('settings.bonus', st.bonus, [[10, '10 sec'], [20, '20 sec (comp)'], [30, '30 sec']])}
      <label class="field">Theme</label>${segHTML('settings.theme', st.theme, [['auto', "System"], ['light', "Light"], ['dark', "Dark"]])}
      <div style="margin-top:12px;display:grid;gap:8px">
        <label><input type="checkbox" id="st-mic" ${st.mic !== false ? 'checked' : ''}> 🎤 Simulate competition buzzer (Announce team and answer via Mic)</label>
        <label><input type="checkbox" id="st-showOpts" ${st.showOpts ? 'checked' : ''}> Show options during reading in dictation (for beginners)</label>
        <label><input type="checkbox" id="st-captions" ${st.captions ? 'checked' : ''}> Show captions during reading (turn off for listen-only)</label>
        <label><input type="checkbox" id="st-sfx" ${st.sfx ? 'checked' : ''}> Sound Effects</label>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn sm danger" data-act="reset">${"Clear Drill History"}</button><span class="spacer"></span><button class="btn" data-close>${"Done"}</button></div>`);
    $('#st-voice').addEventListener('change', e => { st.voice = e.target.value; save(); });
    $('#st-rate').addEventListener('input', e => { st.rate = +e.target.value; $('#rate-v').textContent = st.rate.toFixed(2); save(); });
    $('#st-pause').addEventListener('input', e => { st.pause = +e.target.value; $('#pause-v').textContent = st.pause; save(); });
    ['mic', 'showOpts', 'captions', 'sfx'].forEach(k => $('#st-' + k).addEventListener('change', e => { st[k] = e.target.checked; save(); }));
  }

  // ───────── global clicks ─────────
  document.addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { 
      e.preventDefault(); 
      if (say.dataset.cdIntv) {
        clearInterval(say.dataset.cdIntv);
        delete say.dataset.cdIntv;
        say.classList.remove('counting');
        if (say.dataset.orig) say.innerHTML = say.dataset.orig;
        return;
      }
      if (say.classList.contains('playing')) {
        stopAudio();
        return;
      }
      const toks = sayReg.get(say.dataset.say); 
      if (toks) { 
        const p = playToks(toks); 
        say.classList.add('playing'); 
        if (!say.dataset.orig) say.dataset.orig = say.innerHTML;
        say.innerHTML = "🛑 Cancel";
        p.done.then((completed) => { 
          say.classList.remove('playing'); 
          if (!completed) {
            if (say.dataset.orig) say.innerHTML = say.dataset.orig;
            return;
          }
          const qcard = say.closest('.qcard');
          if (qcard) {
            const q = (S.customBank || []).concat(S.bank || []).find(x => x.id === qcard.dataset.qid);
            if (q) {
              const secs = q.type === 'tossup' ? S.settings.buzz : S.settings.bonus;
              let left = secs;
              say.classList.add('counting');
              say.innerHTML = `⏳ ${left.toFixed(1)}s`;
              const t0 = performance.now();
              const intv = setInterval(() => {
                left = secs - (performance.now() - t0)/1000;
                if (left <= 0) {
                  clearInterval(intv);
                  delete say.dataset.cdIntv;
                  say.classList.remove('counting');
                  if (say.dataset.orig) say.innerHTML = say.dataset.orig;
                  sfx('no');
                } else {
                  say.innerHTML = `⏳ ${left.toFixed(1)}s`;
                }
              }, 100);
              say.dataset.cdIntv = intv;
              return;
            }
          }
          if (say.dataset.orig) say.innerHTML = say.dataset.orig;
        }); 
      } 
      return; 
    }
    const st = e.target.closest('[data-start]');
    if (st) {
      closeModal();
      const cats = st.dataset.cats ? st.dataset.cats.split(',') : [];
      const kind = st.dataset.start;
      startSession({ kind, cats, style: kind === 'dict' ? S.prefs.dict.style : 'choice', len: kind === 'dict' ? S.prefs.dict.len : S.settings.len });
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'dict') { const P = S.prefs.dict; startSession({ kind: 'dict', cats: P.cats, lvl: P.lvl, style: P.style, len: P.len }); }
      else { const P = S.prefs.calc; startSession(P.src === 'bank' ? { kind: 'bank', btype: P.type, len: P.len, years: P.years, rounds: P.rounds } : { kind: 'calc', cats: P.cats, lvl: P.lvl, len: P.len }); }
      return;
    }
    const opt = e.target.closest('[data-opt]'); if (opt) { choose(+opt.dataset.opt); return; }
    const let_ = e.target.closest('[data-letter]'); if (let_) { chooseLetter(let_.dataset.letter); return; }
    const jd = e.target.closest('[data-judge]'); if (jd) { e.preventDefault(); judgeAs(jd.dataset.judge === '1'); return; }
    if (e.target.closest('[data-contrast]')) { contrast(e.target.closest('[data-contrast]')); return; }
    const ed = e.target.closest('[data-edit]'); if (ed) { openEdit(ed.dataset.edit); return; }
    const sv = e.target.closest('[data-save-q]'); if (sv) { saveEdit(sv.dataset.saveQ || null); return; }
    const del = e.target.closest('[data-del]');
    if (del) { 
      const q = qById(del.dataset.del); 
      if (q && confirm("Delete this question?")) { 
        S.customBank = (S.customBank || []).filter(x => x.id !== q.id);
        if (!S.deletedIds) S.deletedIds = [];
        S.deletedIds.push(q.id);
        applyBank(); save(); route(); 
      } 
      return; 
    }
    const pr = e.target.closest('[data-practice]'); if (pr) { startSession({ kind: 'bank', bankIds: [pr.dataset.practice], len: 1 }); return; }
    const rm = e.target.closest('[data-rm-mistake]'); if (rm) { S.mistakes.splice(+rm.dataset.rmMistake, 1); save(); route(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (['imp-all', 'imp-none'].includes(act)) e.preventDefault();
    ({
      settings: openSettings,
      quit: () => { if (sess && sess.results.some(r => r.res && !r.pending)) finish(); else location.hash = '#home'; },
      buzz, 'answer-bonus': answerBonus, replay, next: () => { if (sess && !sess.item.pending) nextItem(); },
      submit: () => submitTyped(false),
      again: () => startSession(sess.opts),
      import: openImport, 'new-q': () => openEdit(null), export: exportData, restore: restoreData,
      more: () => { bankF.shown += 30; route(); },
      'bank-practice': () => { const l = filteredBank(); startSession({ kind: 'bank', bankIds: l.map(q => q.id), len: l.length }); },
      'redo-bank': () => { const ids = [...new Set(S.mistakes.filter(m => m.q && qById(m.q)).map(m => m.q))]; startSession({ kind: 'bank', bankIds: ids, len: ids.length }); },
      'imp-text': () => { const t = $('#imp-text').value; if (!t.trim()) return; addParsed(I.parseNSB(t, { file: 'pasted' }), 'Pasted text'); renderImport(); },
      'imp-all': () => { imp.items.forEach(x => x.on = true); renderImport(); },
      'imp-none': () => { imp.items.forEach(x => x.on = false); renderImport(); },
      'imp-add': () => {
        const add = imp.items.filter(x => x.on).map(x => x.item);
        if (!S.customBank) S.customBank = [];
        S.customBank.unshift(...add); applyBank(); save(); closeModal(); imp = null; toast(`✓ Added ${add.length} questions Math Qs`); route();
      },
      'test-voice': () => playToks(E.speak(E.parse('(xy)^2 - x y^2'))),
      reset: () => { if (confirm("Clear all drill history (bank preserved)? This cannot be undone.")) { Object.assign(S, { cats: {}, log: [], mistakes: [], bstats: {}, streak: { n: 0, last: null } }); save(); closeModal(); hud(); route(); } },
    }[act] || (() => { }))();
  });
  function contrast(btn) {
    const it = sess && sess.item;
    if (!it || !it.contrast) return;
    btn.disabled = true;
    const [a, b] = it.contrast;
    const p1 = playToks(a);
    p1.done.then(ok => {
      if (!ok) { btn.disabled = false; return; }
      setTimeout(() => { const p2 = playToks(b); p2.done.then(() => { btn.disabled = false; }); }, 700);
    });
  }

  // ───────── keyboard ─────────
  document.addEventListener('keydown', e => {
    if (view !== 'drill' || !sess || sess.done || !$('#modal').hidden) return;
    const it = sess.item, ph = sess.phase;
    if (!it) return;
    const inInput = !!(e.target.matches && e.target.matches('input, textarea, select'));
    if (e.key === 'Escape') { e.preventDefault(); $('[data-act="quit"]').click(); return; }
    if (ph === 'feedback') {
      if ((e.key === 'Enter' || (e.key === ' ' && !inInput) || e.key === 'ArrowRight') && !it.pending) { e.preventDefault(); nextItem(); }
      return;
    }
    if (inInput) { if (e.key === 'Enter') { e.preventDefault(); submitTyped(false); } return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (it.mode === 'dict') {
      if (k === 'r') { e.preventDefault(); replay(); return; }
      let idx = 'wxyz'.indexOf(k); if (idx < 0) idx = '1234'.indexOf(k);
      if (idx >= 0) { e.preventDefault(); choose(idx); }
      return;
    }
    if (e.key === ' ') { e.preventDefault(); if (isTossup(sess.item)) buzz(); else answerBonus(); return; }
    if (it.mode === 'bank' && it.q.format === 'mc' && ph === 'answering' && 'wxyz'.includes(k) && k) { e.preventDefault(); chooseLetter(k.toUpperCase()); }
  });

  // read-only handle for debugging in the console
  window.NSBApp = { get session() { return sess; }, get state() { return S; } };

  // ───────── boot ─────────
  applyTheme();
  hud();
  route();
})();
