// Pulsanti Flic per lo scoresheet: un pulsante per squadra.
//   1 tocco   = la squadra vince lo scambio (punto o cambio palla); a inizio game fa partire il game con quella squadra al servizio
//   2 tocchi  = annulla l'ultima azione (ripetendo si annullano più azioni)
//   pressione lunga (1 secondo) = azzera la partita (si conferma con un'altra pressione lunga entro 5 secondi)
//
// Da dove arrivano le pressioni:
//   - Bluetooth diretto: il Flic abbinato a telefono, tablet, Mac o PC come tastiera (modalità HID dell'app Flic).
//     Si "insegna" all'app quale tasto manda ogni pulsante.
//   - ponte sul PC: il programma Flic per Windows/Linux + ponte_flic.py (cartella flic-ponte) inviano
//     ogni pressione e rilascio su ws://localhost:8765.
//   - simulatore: due pulsanti sullo schermo, per provare tutto senza i Flic veri.
// I tocchi li conta Flic.Detector: finita la serie (nessun nuovo tocco entro 0,45 s) dice quanti sono stati;
// tenendo premuto 1 secondo dà la pressione lunga.
(function () {
  const LS = 'pbm-flic';
  const TAP_MS = 450;   // un nuovo tocco entro 0,45 secondi fa parte della stessa serie
  const HOLD_MS = 1000; // tenuto premuto almeno 1 secondo = pressione lunga

  // ---------- conteggio dei tocchi (giù/su -> click, double, triple, hold) ----------
  // clock: { set(fn, ms), clear(id) }, sostituibile nei test.
  // tap: tempo massimo tra un tocco e l'altro (ms), anche come funzione (si legge dalle impostazioni)
  function Detector(emit, clock, tap) {
    const tapMs = () => (typeof tap === 'function' ? tap() : tap) || TAP_MS;
    const C = clock || { set: (f, ms) => setTimeout(f, ms), clear: id => clearTimeout(id) };
    const st = {};
    const s = b => (st[b] = st[b] || { down: false, n: 0, t: null, h: null, held: false });
    const finish = (b, x) => { x.t = null; const n = x.n; x.n = 0; if (n) emit(b, n >= 3 ? 'triple' : n === 2 ? 'double' : 'click'); };
    return {
      down(b) {
        const x = s(b);
        if (x.down) return;   // ripetizione automatica del tasto
        x.down = true; x.n++; x.held = false;
        if (x.t != null) { C.clear(x.t); x.t = null; }
        // pressione lunga: vale da sola, i tocchi di prima nella stessa serie si annullano
        x.h = C.set(() => { x.h = null; x.held = true; x.n = 0; emit(b, 'hold'); }, HOLD_MS);
      },
      up(b) {
        const x = s(b);
        if (!x.down) return;
        x.down = false;
        if (x.h != null) { C.clear(x.h); x.h = null; }
        if (x.held) { x.held = false; return; }
        x.t = C.set(() => finish(b, x), tapMs());
      },
      reset() { Object.values(st).forEach(x => { if (x.t != null) C.clear(x.t); if (x.h != null) C.clear(x.h); }); Object.keys(st).forEach(k => delete st[k]); }
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { Detector, TAP_MS, HOLD_MS };
    return;
  }

  // ---------- impostazioni (su questo dispositivo) ----------
  // keys[i] = { press: codice del tasto (giù/su), click, double, hold: tasti già "pronti" (facoltativi) }
  const def = () => ({ keys: [{ press: 'Digit1' }, { press: 'Digit2' }], ws: 'ws://localhost:8765', bridge: ['', ''], swap: false, sim: false, ponte: false, tap: TAP_MS, comuni: { double: '', hold: '' } });
  let cfg = def();
  try { cfg = Object.assign(def(), JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { cfg = def(); }
  cfg.comuni = Object.assign({ double: '', hold: '' }, cfg.comuni || {});
  cfg.net = Object.assign({ on: false, code: '' }, cfg.net || {});
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* ignora */ } };

  let handler = null;        // (squadra 0/1, gesto) => void
  let learning = null;       // { team, slot, cb }
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignora */ } });

  // pulsante fisico (0/1) -> squadra, con l'eventuale inversione
  const teamOf = b => (cfg.swap ? 1 - b : b);
  function fire(b, g) { if (handler) handler(teamOf(b), g); }
  const det = Detector(fire, null, () => Number(cfg.tap) || TAP_MS);
  // registro di prova: gli ultimi tasti arrivati (per capire cosa manda il Flic)
  const log = [];
  let logOn = false, lastT = 0;
  function note(code, kind) {
    if (!logOn) return;
    const now = Date.now();
    log.unshift({ code, kind, dt: lastT ? now - lastT : 0 });
    lastT = now;
    log.length = Math.min(log.length, 12);
    changed();
  }

  // ---------- Bluetooth diretto (Flic come tastiera) ----------
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  // "1" della riga dei numeri e "1" del tastierino valgono uguale
  const same = (a, b) => !!a && !!b && a.replace(/^(Digit|Numpad)/, '#') === b.replace(/^(Digit|Numpad)/, '#');
  function keyMatch(code) {
    for (let b = 0; b < 2; b++) {
      const k = cfg.keys[b] || {};
      if (same(k.press, code)) return { b, slot: 'press' };
      for (const g of ['click', 'double', 'hold']) if (same(k[g], code)) return { b, slot: g };
    }
    // tasti comuni ai due pulsanti: annulla e azzera non dipendono dalla squadra
    for (const g of ['double', 'hold']) if (same(cfg.comuni[g], code)) return { b: 0, slot: g, common: true };
    return null;
  }
  // ---------- abbinamento unico: 1 tocco squadra A, 1 tocco squadra B, doppio clic, pressione lunga ----------
  // Se il Flic manda sempre lo stesso tasto (non riconosce i gesti da solo), si passa al conteggio dei tocchi.
  let pairing = null;   // { step, codes, onStep, onDone }
  let quietUntil = 0;   // subito dopo l'abbinamento si ignorano i tasti (es. il secondo tocco di un doppio clic)
  function pairKey(code) {
    const P = pairing, c = P.codes;
    if (P.step === 0) { c[0] = code; P.step = 1; P.onStep(1); return; }
    if (P.step === 1) {
      if (same(code, c[0])) { P.onStep(1, 'stesso'); return; }   // serve il pulsante dell'altra squadra
      c[1] = code; P.step = 2; P.onStep(2); return;
    }
    if (P.step === 2) {
      if (same(code, c[0]) || same(code, c[1])) {
        // il doppio clic manda lo stesso tasto del clic: i gesti li riconosce l'app contando i tocchi
        cfg.keys = [{ press: c[0] }, { press: c[1] }]; cfg.comuni = { double: '', hold: '' };
        pairing = null; quietUntil = Date.now() + 1000; save(); changed(); P.onDone('tocchi'); return;
      }
      c[2] = code; P.step = 3; P.onStep(3); return;
    }
    if (P.step === 3) {
      const hold = same(code, c[0]) || same(code, c[1]) || same(code, c[2]) ? '' : code;
      cfg.keys = [{ click: c[0] }, { click: c[1] }]; cfg.comuni = { double: c[2], hold };
      pairing = null; quietUntil = Date.now() + 1000; save(); changed(); P.onDone(hold ? 'gesti' : 'senza-azzera');
    }
  }

  document.addEventListener('keydown', e => {
    const code = e.code || e.key;
    if (!typing(e.target)) note(code, e.repeat ? 'ripetizione' : 'giù');
    if (pairing) {
      e.preventDefault();
      if (code === 'Escape') { pairing = null; changed(); return; }
      if (!e.repeat) pairKey(code);
      return;
    }
    if (learning && code === 'Escape') { learning = null; changed(); return; }
    if (learning && learning.slot !== 'bridge') {
      e.preventDefault();
      const { team, slot, cb } = learning;
      learning = null;
      // un tasto può avere un solo ruolo: lo si toglie dagli altri
      cfg.keys.forEach(k => Object.keys(k).forEach(x => { if (same(k[x], code)) delete k[x]; }));
      ['double', 'hold'].forEach(g => { if (same(cfg.comuni[g], code)) cfg.comuni[g] = ''; });
      if (team === 'comune') cfg.comuni[slot] = code;
      else { cfg.keys[team] = cfg.keys[team] || {}; cfg.keys[team][slot] = code; }
      save(); changed();
      if (cb) cb(code);
      return;
    }
    if (!handler || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || Date.now() < quietUntil) return;
    const m = keyMatch(code);
    if (!m) return;
    e.preventDefault();
    if (m.slot === 'press') det.down(m.b);
    else if (!e.repeat) { if (m.common) { if (handler) handler(0, m.slot); } else fire(m.b, m.slot); }
  }, true);
  document.addEventListener('keyup', e => {
    if (!typing(e.target)) note(e.code || e.key, 'su');
    if (!handler || typing(e.target)) return;
    const m = keyMatch(e.code || e.key);
    if (m && m.slot === 'press') { e.preventDefault(); det.up(m.b); }
  }, true);

  // ---------- ponte sul PC (programma Flic + ponte_flic.py) ----------
  let ws = null, wsState = 'off', wsRetry = null;
  function connect() {
    disconnect(true);
    cfg.ponte = true; save();
    wsState = 'connessione';
    changed();
    try { ws = new WebSocket(cfg.ws); } catch (e) { wsState = 'errore'; changed(); return; }
    ws.onopen = () => { wsState = 'collegato'; changed(); };
    ws.onclose = () => {
      ws = null;
      if (cfg.ponte) { wsState = 'riconnessione'; wsRetry = setTimeout(connect, 3000); } else wsState = 'off';
      changed();
    };
    ws.onerror = () => { /* segue onclose */ };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.bd) return;
      if (learning && learning.slot === 'bridge') {
        if (m.e === 'up') return;   // si abbina alla pressione
        const { team, cb } = learning;
        learning = null;
        cfg.bridge = cfg.bridge.map(x => (x === m.bd ? '' : x));
        cfg.bridge[team] = m.bd;
        save(); changed();
        if (cb) cb(m.bd);
        return;
      }
      const b = cfg.bridge.indexOf(m.bd);
      if (b < 0) return;
      if (m.e === 'down') det.down(b);
      else if (m.e === 'up') det.up(b);
      else if (['click', 'double', 'hold'].includes(m.g)) fire(b, m.g);
    };
  }
  function disconnect(keep) {
    clearTimeout(wsRetry);
    if (!keep) { cfg.ponte = false; save(); }
    if (ws) { const w = ws; ws = null; w.onclose = null; try { w.close(); } catch (e) { /* ignora */ } }
    wsState = 'off';
    changed();
  }

  // ---------- simulatore sullo schermo ----------
  // <button data-flic-sim="0|1">: giù/su con il dito o il mouse, come il pulsante vero
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest('[data-flic-sim]');
    if (!el) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    el.classList.add('down');
    det.down(Number(el.dataset.flicSim));
  });
  const simUp = e => {
    const el = e.target.closest && e.target.closest('[data-flic-sim]');
    if (!el) return;
    el.classList.remove('down');
    det.up(Number(el.dataset.flicSim));
  };
  document.addEventListener('pointerup', simUp);
  document.addEventListener('pointercancel', simUp);
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-flic-sim]')) e.preventDefault(); });

  // descrizione leggibile di un tasto
  // ---------- via internet (app Flic → "Internet Request" → database) ----------
  // Il Flic resta collegato solo all'app Flic, non come tastiera: così il telefono tiene la sua tastiera.
  // A ogni gesto l'app Flic scrive { g: '0c' } (pulsante 0/1 + c=click, d=doppio, h=lunga) in flic/{codice}/ev.
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join('');
  let netUnsub = null, netLast = null;
  function syncNet() {
    const want = cfg.net.on && cfg.net.code && handler && window.Cloud && window.Cloud.watchFlic;
    if (want && !netUnsub) {
      netUnsub = window.Cloud.watchFlic(cfg.net.code, g => {
        const b = Number(g[0]), gest = { c: 'click', d: 'double', h: 'hold' }[g[1]];
        if ((b !== 0 && b !== 1) || !gest) return;
        netLast = { b, g: gest, at: Date.now() };
        fire(b, gest);
        changed();
      });
    } else if (!want && netUnsub) { netUnsub(); netUnsub = null; }
  }
  // lo scoresheet ridisegna spesso: se il database è arrivato dopo, ci si collega al primo giro utile
  window.addEventListener('cloud-ready', syncNet);

  const keyLabel = c => (!c ? '—' : c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, '↔ '));

  window.Flic = {
    Detector, TAP_MS, HOLD_MS, keyLabel,
    get cfg() { return cfg; },
    get wsState() { return wsState; },
    get learning() { return learning; },
    // l'app indica chi riceve i gesti (null = nessuno: scoresheet chiuso)
    setHandler(fn) { handler = fn; if (!fn) det.reset(); syncNet(); },
    // collegamento via internet
    get net() { return { on: cfg.net.on, code: cfg.net.code, live: !!netUnsub, last: netLast }; },
    netOn(on) { if (on && !cfg.net.code) cfg.net.code = newCode(); cfg.net.on = !!on; save(); syncNet(); changed(); },
    netNewCode() { cfg.net.code = newCode(); save(); if (netUnsub) { netUnsub(); netUnsub = null; } syncNet(); changed(); },
    netUrl() { const p = (window.Cloud && window.Cloud.projectId) || ''; return `https://firestore.googleapis.com/v1/projects/${p}/databases/(default)/documents/flic/${cfg.net.code}/ev`; },
    netBody: (b, g) => `{"fields":{"g":{"stringValue":"${b}${{ click: 'c', double: 'd', hold: 'h' }[g]}"}}}`,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    learn(team, slot, cb) { learning = { team, slot: slot || 'press', cb }; changed(); },
    cancelLearn() { learning = null; changed(); },
    clearKey(team, slot) { if (team === 'comune') cfg.comuni[slot] = ''; else if (cfg.keys[team]) delete cfg.keys[team][slot]; save(); changed(); },
    // il Flic riconosce da solo i gesti: 1/2 = punto della squadra, 3 = annulla, 5 = azzera (comuni ai due pulsanti)
    get pairing() { return pairing ? pairing.step : null; },
    pairAll(onStep, onDone) { learning = null; pairing = { step: 0, codes: [], onStep: (n, why) => { changed(); onStep(n, why); }, onDone }; changed(); },
    cancelPair() { pairing = null; changed(); },
    preset() { cfg.keys = [{ click: 'Digit1' }, { click: 'Digit2' }]; cfg.comuni = { double: 'Digit3', hold: 'Digit5' }; save(); changed(); },
    set(k, v) { cfg[k] = v; save(); changed(); },
    get log() { return log; },
    get logOn() { return logOn; },
    setLog(on) { logOn = !!on; log.length = 0; lastT = 0; changed(); },
    connect, disconnect,
    // per le prove: gesto come se arrivasse dal pulsante b
    emit: fire
  };
  if (cfg.ponte) setTimeout(connect, 500);
})();
