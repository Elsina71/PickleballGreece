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
  function Detector(emit, clock) {
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
        x.t = C.set(() => finish(b, x), TAP_MS);
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
  const def = () => ({ keys: [{ press: 'Digit1' }, { press: 'Digit2' }], ws: 'ws://localhost:8765', bridge: ['', ''], swap: false, sim: false, ponte: false });
  let cfg = def();
  try { cfg = Object.assign(def(), JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { cfg = def(); }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* ignora */ } };

  let handler = null;        // (squadra 0/1, gesto) => void
  let learning = null;       // { team, slot, cb }
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch (e) { /* ignora */ } });

  // pulsante fisico (0/1) -> squadra, con l'eventuale inversione
  const teamOf = b => (cfg.swap ? 1 - b : b);
  function fire(b, g) { if (handler) handler(teamOf(b), g); }
  const det = Detector(fire);

  // ---------- Bluetooth diretto (Flic come tastiera) ----------
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  function keyMatch(code) {
    for (let b = 0; b < 2; b++) {
      const k = cfg.keys[b] || {};
      if (k.press === code) return { b, slot: 'press' };
      for (const g of ['click', 'double', 'hold']) if (k[g] && k[g] === code) return { b, slot: g };
    }
    return null;
  }
  document.addEventListener('keydown', e => {
    const code = e.code || e.key;
    if (learning && code === 'Escape') { learning = null; changed(); return; }
    if (learning && learning.slot !== 'bridge') {
      e.preventDefault();
      const { team, slot, cb } = learning;
      learning = null;
      // un tasto può avere un solo ruolo: lo si toglie dagli altri
      cfg.keys.forEach(k => Object.keys(k).forEach(x => { if (k[x] === code) delete k[x]; }));
      cfg.keys[team] = cfg.keys[team] || {};
      cfg.keys[team][slot] = code;
      save(); changed();
      if (cb) cb(code);
      return;
    }
    if (!handler || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = keyMatch(code);
    if (!m) return;
    e.preventDefault();
    if (m.slot === 'press') det.down(m.b);
    else if (!e.repeat) fire(m.b, m.slot);
  }, true);
  document.addEventListener('keyup', e => {
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
  const keyLabel = c => (!c ? '—' : c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Arrow/, '↔ '));

  window.Flic = {
    Detector, TAP_MS, HOLD_MS, keyLabel,
    get cfg() { return cfg; },
    get wsState() { return wsState; },
    get learning() { return learning; },
    // l'app indica chi riceve i gesti (null = nessuno: scoresheet chiuso)
    setHandler(fn) { handler = fn; if (!fn) det.reset(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    learn(team, slot, cb) { learning = { team, slot: slot || 'press', cb }; changed(); },
    cancelLearn() { learning = null; changed(); },
    clearKey(team, slot) { if (cfg.keys[team]) delete cfg.keys[team][slot]; save(); changed(); },
    set(k, v) { cfg[k] = v; save(); changed(); },
    connect, disconnect,
    // per le prove: gesto come se arrivasse dal pulsante b
    emit: fire
  };
  if (cfg.ponte) setTimeout(connect, 500);
})();
