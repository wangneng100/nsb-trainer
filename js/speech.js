/* NSB 听题训练 — text-to-speech. Speaks a reading chunk by chunk with a real silence between
 * chunks (that silence is the NSB "pause" that closes a quantity). A watchdog keeps things moving
 * when a browser never fires `onend`; with no speech engine at all it runs silently on timers so
 * the UI can show captions instead. */
(function (G) {
  'use strict';
  const synth = G.speechSynthesis;
  let voices = [];
  // macOS ships joke voices (Bells, Bubbles, Zarvox…) that are useless for reading math
  const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Kathy|Fred)\b/;
  function load() {
    try { voices = synth ? synth.getVoices().filter(v => /^en([-_]|$)/i.test(v.lang) && !NOVELTY.test(v.name)) : []; } catch (e) { voices = []; }
  }
  if (synth) {
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load); else synth.onvoiceschanged = load;
  }
  const PREFER = [/Samantha/, /Google US English/, /Microsoft (Aria|Jenny|Guy)/, /\bAlex\b/, /Ava/, /Allison/, /Karen/, /Daniel/];
  function pickVoice(name) {
    if (name) { const v = voices.find(x => x.name === name); if (v) return v; }
    for (const re of PREFER) { const v = voices.find(x => re.test(x.name) && /en[-_]US/i.test(x.lang)) || voices.find(x => re.test(x.name)); if (v) return v; }
    return voices.find(v => /en[-_]US/i.test(v.lang)) || voices[0] || null;
  }
  const estimate = (text, rate) => (text.split(/\s+/).length * 340 + 250) / (rate || 1);

  // play(['the quantity X Y', 'squared'], {rate, pause, voice, onChunk}) → {done: Promise<completed?>, cancel()}
  function play(chunks, o = {}) {
    let cancelled = false, timer = null, watchdog = null, i = 0, settle = null;
    const silent = !synth || o.silent;
    const done = new Promise(resolve => {
      settle = resolve;
      const next = () => {
        if (cancelled) return resolve(false);
        if (i >= chunks.length) return resolve(true);
        const idx = i++, text = chunks[idx];
        if (o.onChunk) o.onChunk(idx, text);
        let finished = false;
        const fin = () => {
          if (finished) return;
          finished = true;
          clearTimeout(watchdog);
          if (cancelled) return resolve(false);
          timer = setTimeout(next, i < chunks.length ? (o.pause || 0) : 0);
        };
        if (silent) { watchdog = setTimeout(fin, estimate(text, o.rate)); return; }
        const u = new SpeechSynthesisUtterance(text);
        const v = pickVoice(o.voice);
        if (v) u.voice = v;
        u.lang = v ? v.lang : 'en-US';
        u.rate = o.rate || 1;
        u.onend = fin;
        u.onerror = fin;
        watchdog = setTimeout(fin, estimate(text, o.rate) * 2.5 + 2000);
        try { synth.speak(u); } catch (e) { fin(); }
      };
      if (synth && !o.silent) { try { synth.cancel(); } catch (e) { } }
      timer = setTimeout(next, 80); // Chrome drops an utterance queued right after cancel()
    });
    return {
      done,
      cancel() { cancelled = true; clearTimeout(timer); clearTimeout(watchdog); if (synth && !silent) { try { synth.cancel(); } catch (e) { } } settle(false); },
    };
  }

  G.NSBTTS = { play, available: () => !!synth, voices: () => voices, pickVoice, cancel: () => { try { synth && synth.cancel(); } catch (e) { } } };
})(window);
