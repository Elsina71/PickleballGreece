// E-scoresheet del pickleball: schermata di gioco, diretta, conferma del risultato, PDF.
// Si collega all'app con Referto.init(helper): usa le stesse funzioni dell'app (testi, permessi, dialoghi).
(function () {
  let H = null;   // helper dell'app
  const ui = { ref: null, to: null, saveTimer: null, toTimer: null };
  const LS = 'pbm-referto-libero';

  // colori delle maglie (scoresheet libero)
  const COLORI = [['#ffffff', T("Bianco")], ['#111111', T("Nero")], ['#e53935', T("Rosso")], ['#1e5bd8', T("Blu")], ['#38bdf8', T("Azzurro")], ['#2e7d4f', T("Verde")],
    ['#facc15', T("Giallo")], ['#fb923c', T("Arancione")], ['#9333ea', T("Viola")], ['#f472b6', T("Rosa")], ['#9ca3af', T("Grigio")]];
  const colorName = hex => (COLORI.find(c => c[0] === hex) || [hex, ''])[1];
  const colorSelect = (name, sel) => `<select name="${name}">${COLORI.map(([h, l]) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const shirt = (r, i) => (r.colori && r.colori[i] ? `<span class="shirt" style="background:${r.colori[i]}" title="${colorName(r.colori[i])}"></span>` : '');
  // scelte sul cambio campo (scoresheet libero e scheda del torneo)
  function ccFields(c) {
    const on = c.ccDurante !== 'no';
    return `<fieldset class="cc-box"><legend>${T("Cambio campo")}</legend><div class="row">
      <label>${T("Cambio campo durante il game")}<select name="ccSi" data-cc-toggle><option value="1">${T("Sì")}</option><option value="0" ${on ? '' : 'selected'}>${T("No")}</option></select></label>
      <label>${T("A quanti punti")}<input type="number" name="ccA" min="1" max="20" value="${Number(c.ccA) || ''}" placeholder="${T("a metà")}" data-cc-on ${on ? '' : 'disabled'}></label>
      <label>${T("In quali game")}<select name="ccDove" data-cc-on ${on ? '' : 'disabled'}><option value="decisivo">${T("Solo nel game decisivo")}</option><option value="tutti" ${c.ccDurante === 'tutti' ? 'selected' : ''}>${T("In ogni game")}</option></select></label>
      <label>${T("Tra un game e l’altro")}<select name="ccTra"><option value="1">${T("Sì")}</option><option value="0" ${c.ccTra === false ? 'selected' : ''}>${T("No")}</option></select></label></div>
      <p class="muted small">${T("Vuoto = a metà del game (6 ai 11, 8 ai 15, 11 ai 21): si cambia quando una squadra arriva a quel punteggio.")}</p></fieldset>`;
  }
  // Sì / No: con "No" la casella dei punti e la scelta dei game si spengono
  document.addEventListener('change', e => {
    if (!e.target.matches || !e.target.matches('[data-cc-toggle]')) return;
    const on = e.target.value === '1';
    e.target.closest('.cc-box').querySelectorAll('[data-cc-on]').forEach(el => { el.disabled = !on; });
  });
  const readCc = v => ({ tra: v.ccTra !== '0', durante: v.ccSi === '0' ? 'no' : v.ccDove === 'tutti' ? 'tutti' : 'decisivo', a: Math.max(0, Math.round(Number(v.ccA) || 0)) });
  const ccText = cfg => { const c = Score.ccCfg(cfg), parts = [];
    if (c.tra) parts.push(T("cambio campo tra i game"));
    if (c.durante !== 'no') parts.push(`${c.durante === 'tutti' ? T("in ogni game") : T("nel game decisivo")} ${Number(c.a) ? T("a {0} punti", [c.a]) : T("a metà")}`);
    return parts.length ? parts.join(', ') : T("nessun cambio campo"); };
  const refId = (tid, key) => `${tid}__${String(key).replace(/\//g, '_')}`;
  const sistemaLabel = c => (c.sistema === 'rally' ? T("Rally scoring") : T("Punteggio classico"));

  // ---------- dati della gara ----------
  function matchInfo(t, key) {
    const m = H.findMatch(t, key);
    if (!m) return null;
    const nomi = [H.sidePlayers(t, m.a), H.sidePlayers(t, m.b)];
    const doppio = nomi[0].length === 2 && nomi[1].length === 2;
    const c = t.config;
    const cfg = { sistema: c.sistema === 'rally' ? 'rally' : 'sideout', doppio, giochi: Number(c.sets) === 3 ? 3 : 1, punti: [c.punti, c.punti, c.puntiDecisivo].map(Number),
      cc: { tra: c.ccTra !== false, durante: ['no', 'tutti'].includes(c.ccDurante) ? c.ccDurante : 'decisivo', a: Number(c.ccA) || 0 } };
    return { m, nomi, cfg };
  }
  const teamLabel = (ref, i) => ref.nomi[i].join(' / ');
  // il database non accetta liste dentro liste: i punteggi dei game si salvano come "11-7"
  const sintesi = (ref, st) => ({
    games: st.games.map(g => g.score.join('-')), cur: st.cur ? st.cur.score.slice() : [0, 0], g: st.g, phase: st.phase,
    call: st.cur ? st.cur.call : '', serve: st.cur ? st.cur.serve : null, wins: st.wins.slice(), winner: st.winner
  });

  // ---------- apertura ----------
  function open(parts) {
    if (parts[1] === 'libero') {
      if (!ui.ref || !ui.ref.libero) {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { saved = null; }
        ui.ref = saved && saved.libero ? saved : { libero: true, cfg: null, nomi: null, ev: [] };
      }
      return ui.ref;
    }
    const tid = parts[1], key = decodeURIComponent(parts.slice(2).join('/'));
    const id = refId(tid, key);
    if (!ui.ref || ui.ref.id !== id) {
      const t = H.tourById(tid), info = t && matchInfo(t, key);
      if (!info) return null;
      ui.ref = { id, tid, key, cfg: info.cfg, nomi: info.nomi, ev: [], stato: 'live', loaded: false, dirty: false };
      window.Cloud.watchReferto(id, doc => {
        const r = ui.ref;
        if (!r || r.id !== id) return;
        r.loaded = true;
        // le modifiche di questo dispositivo non ancora salvate hanno la precedenza
        if (doc && !r.dirty) { r.ev = doc.ev || []; r.stato = doc.stato || 'live'; if (doc.cfg) r.cfg = doc.cfg; if (doc.nomi) r.nomi = doc.nomi; }
        H.refresh();
      });
    }
    return ui.ref;
  }
  function close() {
    window.Cloud && window.Cloud.watchReferto && window.Cloud.watchReferto(null);
    if (window.Flic) window.Flic.setHandler(null);
    wake(false);
  }

  function persist(now) {
    const r = ui.ref;
    if (!r) return;
    if (r.libero) { try { localStorage.setItem(LS, JSON.stringify(r)); } catch (e) { /* ignora */ } return; }
    r.dirty = true;
    clearTimeout(ui.saveTimer);
    // diretta punto per punto, ma raggruppando i tocchi ravvicinati (meno scritture sul database)
    ui.saveTimer = setTimeout(() => {
      const st = Score.replay(r.cfg, r.ev), t = H.tourById(r.tid);
      const data = { tid: r.tid, key: r.key, stato: r.stato, cfg: r.cfg, nomi0: r.nomi[0], nomi1: r.nomi[1], ev: r.ev.slice(), sintesi: sintesi(r, st), by: window.Cloud.user ? window.Cloud.user.uid : '' };
      if (t) data.torneo = t.nome || '';
      if (window.Cloud.scorer) data.campo = window.Cloud.scorer.campo || '';
      window.Cloud.saveReferto(r.id, data).then(() => { if (ui.ref === r) r.dirty = false; }).catch(e => { H.toast(T("Scoresheet non salvato: {0}", [e.code || e.message]), 'err'); });
    }, now ? 0 : 1200);
  }

  function canEdit(r) {
    if (r.libero) return true;
    const t = H.tourById(r.tid);
    return H.canScore(t) && r.stato !== 'omologato';
  }

  // ---------- schermata ----------
  function view(parts) {
    const r = open(parts);
    if (!r) return H.empty(T("Gara non trovata."), 'alert-circle');
    if (r.libero && !r.cfg) return freeSetup();
    const t = r.libero ? null : H.tourById(r.tid);
    const edit = canEdit(r);
    const st = Score.replay(r.cfg, r.ev);
    const back = r.libero ? `<a href="#/tornei">${T("{0} Tornei", [H.icon('arrow-left')])}</a>` : `<a href="#/tornei/${r.tid}">${T("{0} Torneo", [H.icon('arrow-left')])}</a>`;
    const head = `<div class="sb-head"><p>${back}</p>
      <h1 class="sb-title">${H.icon('clipboard-text')} ${r.libero ? T("Scoresheet libero") : T("Scoresheet")}</h1>
      <p class="muted small">${t ? H.esc(t.nome) + ' · ' : ''}${sistemaLabel(r.cfg)} · ${r.cfg.giochi === 1 ? T("game unico") : T("{0} game su {1}", [Score.needWins(r.cfg), r.cfg.giochi])} · ${T("ai {0}", [r.cfg.punti[0]])}${r.cfg.giochi > 1 && r.cfg.punti[r.cfg.giochi - 1] !== r.cfg.punti[0] ? ' ' + T("(decisivo ai {0})", [r.cfg.punti[r.cfg.giochi - 1]]) : ''} · ${ccText(r.cfg)}</p></div>`;
    if (!r.libero && !r.loaded) return head + `<p class="muted">${T("Caricamento…")}</p>`;
    if (!edit && !r.ev.length) return head + H.empty(T("Lo scoresheet di questa gara non è ancora iniziato."), 'clipboard-text');
    // i pulsanti Flic comandano questo scoresheet finché è aperto; lo schermo resta acceso
    if (window.Flic) window.Flic.setHandler(edit ? onFlic : null);
    wake(edit && st.phase !== 'end');
    let body;
    if (st.phase === 'setup' || st.phase === 'gameover') body = (st.phase === 'gameover' ? gameOverBanner(r, st) : '') + (edit ? startForm(r, st) : `<p class="muted">${T("In attesa dell’inizio del game.")}</p>`);
    else body = board(r, st, edit);
    return `<div class="sb-page">${head}${edit ? resetBanner() : ''}${body}${edit && window.Flic && window.Flic.cfg.sim ? simButtons(r) : ''}${history(r, st)}${tools(r, st, edit)}</div>`;
  }

  function freeSetup() {
    const pts = [11, 15, 21].map(p => `<option ${p === 11 ? 'selected' : ''}>${p}</option>`).join('');
    return `<div class="sb-page"><p><a href="#/tornei">${T("{0} Tornei", [H.icon('arrow-left')])}</a></p>
      <h1>${H.icon('clipboard-text')} ${T("Scoresheet libero")}</h1>
      <p class="muted">${T("Per una partita qualsiasi: il punteggio resta solo su questo dispositivo e alla fine puoi scaricare il PDF.")}</p>
      <form data-form="ref-libero" class="card">
        <div class="row">
          <label>${T("Gioco")}<select name="doppio"><option value="1">${T("Doppio")}</option><option value="0">${T("Singolo")}</option></select></label>
          <label>${T("Sistema di punteggio")}<select name="sistema"><option value="sideout">${T("Classico (punto solo a chi serve)")}</option><option value="rally">${T("Rally scoring (ogni scambio è un punto)")}</option></select></label>
        </div>
        <div class="row">
          <label>${T("Game")}<select name="giochi"><option value="1">${T("Game unico")}</option><option value="3">${T("2 game su 3")}</option><option value="5">${T("3 game su 5")}</option></select></label>
          <label>${T("Punti per game")}<select name="punti">${pts}</select></label>
          <label>${T("Game decisivo ai")}<select name="decisivo">${pts}</select></label>
        </div>
        ${ccFields({})}
        ${['a', 'b'].map((k, i) => `<fieldset><legend>${T("Squadra {0}", [i + 1])}</legend>
          <div class="row"><label>${T("Giocatore 1 (parte a destra)")}<input name="${k}0" maxlength="40" required></label>
            <label>${T("Giocatore 2 (parte a sinistra)")}<input name="${k}1" maxlength="40"></label>
            <label>${T("Colore maglia")}${colorSelect('c' + i, i ? '#e53935' : '#1e5bd8')}</label></div></fieldset>`).join('')}
        <p class="muted small">${T("Nel singolo basta il giocatore 1. Chi serve per primo e chi parte a destra si possono cambiare all’inizio di ogni game.")}</p>
        <p class="form-error" hidden></p>
        <div class="actions"><button class="btn primary">${T("{0} Prepara la partita", [H.icon('player-play')])}</button></div>
      </form></div>`;
  }

  function startForm(r, st) {
    const n = st.next != null ? st.next : st.games.length;
    if (n >= r.cfg.giochi || st.phase === 'end') return '';
    const prev = st.games[n - 1];
    // di norma il primo servizio passa all'altra squadra a ogni game; chi parte a destra resta come nel game prima
    const s0 = prev ? 1 - prev.start.s : 0, r0 = prev ? prev.start.r : [0, 0];
    const who = i => `<label class="check"><input type="radio" name="s" value="${i}" ${i === s0 ? 'checked' : ''}> ${shirt(r, i)}${H.esc(teamLabel(r, i))}</label>`;
    const right = i => r.cfg.doppio ? `<label>${T("A destra per {0}", [H.esc(teamLabel(r, i))])}<select name="r${i}">${r.nomi[i].map((p, j) => `<option value="${j}" ${j === r0[i] ? 'selected' : ''}>${H.esc(p)}</option>`).join('')}</select></label>` : '';
    return `<form data-form="ref-start" class="card sb-start">
      <h2>${T("Game {0}", [n + 1])}</h2>
      <fieldset><legend>${T("Chi serve per primo")}</legend>${who(0)}${who(1)}</fieldset>
      ${r.cfg.doppio ? `<div class="row">${right(0)}${right(1)}</div><p class="muted small">${T("Il primo servizio di ogni cambio palla è di chi si trova a destra.")}</p>` : ''}
      <div class="actions"><button class="btn primary big">${T("{0} Inizia il game {1}", [H.icon('player-play'), n + 1])}</button></div></form>`;
  }

  function gameOverBanner(r, st) {
    const g = st.games[st.games.length - 1];
    return `<div class="notice ok sb-banner">${H.icon('flag')} <span>${T("Game {0} a {1}: {2}", [g.n + 1, H.esc(teamLabel(r, g.winner)), g.score[g.winner] + '-' + g.score[1 - g.winner]])}.${Score.ccCfg(r.cfg).tra ? ' ' + T("Si cambia campo.") : ''}</span></div>`;
  }

  function board(r, st, edit) {
    const G = st.cur;
    const order = G.flip ? [1, 0] : [0, 1];
    const half = i => {
      const serving = G.serve === i;
      const players = r.cfg.doppio
        ? G.pos[i].map((p, side) => `<li class="${serving && G.server === p ? 'srv' : ''}"><span class="side-tag">${side === 0 ? T("Destra") : T("Sinistra")}</span> ${H.esc(r.nomi[i][p])}${serving && G.server === p ? ` <span class="ball" title="${T("Serve")}">●</span>${G.sn ? ` <small>(${G.sn})</small>` : ''}` : ''}</li>`).join('')
        : `<li class="${serving ? 'srv' : ''}">${H.esc(r.nomi[i][0])}${serving ? ` <span class="ball">●</span> <small>${G.score[i] % 2 === 0 ? T("da destra") : T("da sinistra")}</small>` : ''}</li>`;
      return `<div class="sb-half ${serving ? 'serving' : ''}" ${r.colori ? `style="border-top:8px solid ${r.colori[i]}"` : ''}>
        <p class="sb-team">${shirt(r, i)}${H.esc(teamLabel(r, i))}</p>
        <p class="sb-games">${Array.from({ length: Score.needWins(r.cfg) }, (_, k) => `<span class="dot ${k < st.wins[i] ? 'on' : ''}"></span>`).join('')}</p>
        <p class="sb-score">${G.score[i]}</p>
        <ul class="plain sb-players">${players}</ul>
        ${edit && st.phase !== 'end' ? `<button class="btn primary big sb-win" data-action="ref-rally" data-w="${i}" ${G.needCC ? 'disabled' : ''}>${r.cfg.sistema === 'rally' ? T("Punto") : serving ? T("Punto") : T("Vince lo scambio")}</button>
          <button class="btn small" data-action="ref-to" data-t="${i}" ${G.toLeft[i] ? '' : 'disabled'}>${H.icon('clock-pause')} ${T("Timeout ({0})", [G.toLeft[i]])}</button>` : ''}
      </div>`;
    };
    const cc = G.needCC ? `<div class="notice warn-box sb-banner">${H.icon('arrows-exchange')} <span><strong>${T("Cambio campo!")}</strong> ${T("Si cambia lato a {0} punti.", [Score.ccAt(r.cfg, G.n)])}</span>
      ${edit ? `<button class="btn small primary" data-action="ref-cc">${T("Fatto")}</button>` : ''}</div>` : '';
    const to = ui.to && ui.to.id === (r.id || 'libero') ? `<div class="notice sb-banner">${H.icon('clock-pause')} <span>${T("Timeout {0}", [H.esc(teamLabel(r, ui.to.t))])}: <strong data-to-left>${toLeft()}</strong></span>
      <button class="btn small" data-action="ref-to-end">${T("Riprendi")}</button></div>` : '';
    const end = st.phase === 'end' ? endBanner(r, st, edit) : '';
    return `${end}${cc}${to}
      <div class="sb-call"><span class="muted small">${T("Chiamata")}</span> <strong>${G.call}</strong> <span class="muted small">${T("Game {0}", [G.n + 1])}</span></div>
      <div class="sb-court">${order.map(half).join('')}</div>`;
  }

  function endBanner(r, st) {
    const res = Score.result(r.cfg, st);
    const sets = res.sets.map(s => s.join('-')).join(' · ');
    const t = r.libero ? null : H.tourById(r.tid), mgr = t && H.tourMgr(t);
    let act = '';
    if (r.libero) act = `<button class="btn small" data-action="ref-new">${T("Nuova partita")}</button>`;
    else if (r.stato === 'omologato') act = `<span class="badge ok">${T("Risultato confermato")}</span>`;
    else if (mgr) act = `<button class="btn small primary" data-action="ref-confirm" data-id="${r.id}">${T("{0} Conferma il risultato", [H.icon('circle-check')])}</button>`;
    else if (r.stato === 'finito') act = `<span class="badge">${T("In attesa di conferma dell’organizzatore")}</span>`;
    else act = `<button class="btn small primary" data-action="ref-send">${T("{0} Invia il risultato", [H.icon('send')])}</button>`;
    return `<div class="notice ok sb-banner">${H.icon('trophy')} <span><strong>${T("Partita finita")}</strong>: ${T("vince {0}", [H.esc(teamLabel(r, st.winner))])} ${sets ? '(' + sets + ')' : ''}${st.retired != null ? ' — ' + T("ritiro di {0}", [H.esc(teamLabel(r, st.retired))]) : ''}</span> ${act}</div>`;
  }

  function history(r, st) {
    if (!st.games.length) return '';
    return `<p class="sb-hist">${st.games.map(g => `<span class="chip">${T("Game {0}", [g.n + 1])}: ${g.score[0]}-${g.score[1]}${g.winner != null ? '' : ' …'}</span>`).join(' ')}</p>`;
  }

  function tools(r, st, edit) {
    const b = [];
    if (edit && r.ev.length) b.push(`<button class="btn" data-action="ref-undo">${H.icon('arrow-back-up')} ${T("Annulla l’ultima azione")}</button>`);
    if (edit && st.phase === 'play' && !(H.tourById(r.tid) && Array.isArray((H.findMatch(H.tourById(r.tid), r.key) || {}).a))) b.push(`<button class="btn" data-action="ref-retire">${H.icon('flag-off')} ${T("Ritiro")}</button>`);
    if (edit && window.Flic) b.push(`<button class="btn ${ui.flicOpen ? 'primary' : ''}" data-action="ref-flic-panel">${H.icon('hand-click')} ${T("Pulsanti Flic")}${window.Flic.wsState === 'collegato' ? ' · ' + T("ponte collegato") : ''}</button>`);
    if (edit && r.ev.length) b.push(`<button class="btn" data-action="ref-reset">${H.icon('restore')} ${T("Azzera la partita")}</button>`);
    if (edit && V() && V().supported()) b.push(`<button class="btn ${ui.voiceOpen ? 'primary' : ''}" data-action="ref-voice-panel">${H.icon(V().on ? 'volume' : 'volume-off')} ${V().on ? T("Voce: attiva") : T("Voce: spenta")} · ${T("impostazioni")}</button>`);
    if (r.ev.length) b.push(`<button class="btn" data-action="ref-pdf">${H.icon('file-download')} ${T("Scarica PDF")}</button>`);
    if (r.libero) b.push(`<button class="btn" data-action="ref-new">${H.icon('refresh')} ${T("Nuova partita")}</button>`);
    return (b.length ? `<div class="actions wrap sb-tools">${b.join('')}</div>` : '') + (edit && ui.flicOpen ? flicPanel(r) : '') + (edit && ui.voiceOpen ? voicePanel() : '');
  }

  const toLeft = () => { if (!ui.to) return ''; const s = Math.max(0, Math.ceil((ui.to.end - Date.now()) / 1000)); return s ? `0:${String(s).padStart(2, '0')}` : T("tempo scaduto"); };

  // ---------- chiamata vocale del punteggio (in inglese: js/voce.js) ----------
  const V = () => window.Voce;
  function speak(r, before, kind) {
    if (!V() || !V().on || !r || !r.cfg) return;
    const after = Score.replay(r.cfg, r.ev);
    let txt = V().announce(before, after, r.nomi, kind);
    const last = r.ev[r.ev.length - 1] || '';
    if (kind !== 'undo' && last[0] === 'T') txt = `Timeout, ${V().teamText(r.nomi[Number(last[1])])}.`;
    if (kind !== 'undo' && last === 'C') txt = `Ends changed. ${V().callText(after.cur)}.`;
    V().say(txt);
  }
  const SAMPLE = 'nine, seven, two, left.';
  // scelta della voce: stile (donna/uomo, calda/squillante), voce del dispositivo, tono e velocità
  function voicePanel() {
    const v = V();
    if (!v || !v.supported()) return '';
    const P = v.pref, vs = v.voices(), k = v.setup(), st = v.STILI.find(x => x.id === P.stile) || v.STILI[1];
    const gl = g => (g === 'F' ? T("donna") : g === 'M' ? T("uomo") : '?');
    const note = !vs.length ? T("Il telefono non ha voci inglesi installate: si usa la voce predefinita.")
      : !k.sameGender && !P.voce ? (st.g === 'M' ? T("Su questo telefono non c’è una voce inglese maschile: la simulo abbassando il tono.") : T("Su questo telefono non c’è una voce inglese femminile: la simulo alzando il tono.")) : '';
    return `<div class="card voce-panel">
      <div class="actions wrap"><button class="btn ${v.on ? 'primary' : ''}" data-action="ref-voice">${H.icon(v.on ? 'volume' : 'volume-off')} ${v.on ? T("Chiamata vocale: attiva") : T("Chiamata vocale: spenta")}</button>
        <button class="btn" data-action="ref-voice-test">${H.icon('player-play')} ${T("Prova")}</button></div>
      <div class="row voce-row">
        <label>${T("Stile della voce")}<select data-voce="stile">${v.STILI.map(x => `<option value="${x.id}" ${x.id === st.id ? 'selected' : ''}>${T(x.label)}</option>`).join('')}</select></label>
        <label>${T("Voce del telefono")}<select data-voce="voce"><option value="">${T("Automatica (secondo lo stile)")}</option>${vs.map(x => `<option value="${H.esc(x.uri)}" ${x.uri === P.voce ? 'selected' : ''}>${H.esc(x.name)} · ${H.esc(x.lang)} (${gl(x.g)})</option>`).join('')}</select></label></div>
      <div class="row voce-row">
        <label>${T("Tono: calda ↔ squillante")}<input type="range" data-voce="tono" min="-4" max="4" step="1" value="${Number(P.tono) || 0}"></label>
        <label>${T("Velocità: lenta ↔ rapida")}<input type="range" data-voce="vel" min="0.7" max="1.4" step="0.05" value="${Number(P.vel) || 1}"></label></div>
      <p class="muted small">${T("La chiamata è in inglese: punti di chi serve, punti di chi riceve, numero del battitore e lato del servizio.")}${note ? ' ' + note : ''}</p></div>`;
  }
  // modifiche ai comandi della voce: si salvano e si fa sentire subito la prova
  document.addEventListener('change', e => {
    const el = e.target.closest && e.target.closest('[data-voce]');
    if (!el || !V()) return;
    const k = el.dataset.voce;
    V().setPref(k, el.type === 'range' ? Number(el.value) : el.value);
    if (k === 'stile') V().setPref('voce', '');
    V().say(SAMPLE, true);
    if (H) H.render();
  });
  if (window.Voce) window.Voce.onVoices(() => { if (/^#\/referto/.test(location.hash) && ui.voiceOpen && H) H.render(); });

  // ---------- azioni ----------
  const cur = () => ui.ref;
  function push(e) {
    const r = cur();
    if (!r || !canEdit(r)) return;
    const before = Score.replay(r.cfg, r.ev);
    if (before.phase === 'end') return;   // partita finita: si può solo annullare
    [].concat(e).forEach(x => r.ev.push(x));
    ui.undoReset = null;
    if (!r.libero && r.stato === 'finito') r.stato = 'live';
    persist();
    H.render();
    speak(r, before);
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* ignora */ }
  }
  function undo() {
    const r = cur(); if (!r || !canEdit(r)) return;
    // subito dopo un azzeramento, "annulla" rimette la partita com'era
    if (!r.ev.length && ui.undoReset && ui.undoReset.r === r) {
      r.ev = ui.undoReset.ev; ui.undoReset = null;
      persist(); H.render();
      if (V()) V().say(`Match restored. ${V().callText(Score.replay(r.cfg, r.ev).cur)}.`);
      return;
    }
    if (!r.ev.length) return;
    const before = Score.replay(r.cfg, r.ev);
    r.ev.pop();
    if (!r.libero && r.stato === 'finito') r.stato = 'live';
    persist(); H.render();
    speak(r, before, 'undo');
  }
  // azzeramento: si chiede conferma (un'altra pressione lunga entro 5 secondi, o il pulsante sullo schermo)
  function askReset() {
    const r = cur(); if (!r || !canEdit(r) || !r.ev.length) return;
    if (ui.reset && ui.reset.until > Date.now()) return doReset();
    ui.reset = { until: Date.now() + 5000 };
    clearTimeout(ui.resetTimer);
    ui.resetTimer = setTimeout(() => { ui.reset = null; H.render(); }, 5000);
    H.render();
    if (V()) V().say('Reset the match? Hold the button again to confirm.', true);
  }
  function doReset() {
    const r = cur();
    ui.reset = null; clearTimeout(ui.resetTimer);
    if (!r || !canEdit(r) || !r.ev.length) { H.render(); return; }
    ui.undoReset = { r, ev: r.ev.slice() };
    r.ev = [];
    if (!r.libero && r.stato === 'finito') r.stato = 'live';
    persist(true); H.render();
    if (V()) V().say('Match reset.', true);
    H.toast(T("Partita azzerata: due tocchi (o Annulla) la ripristinano."), 'ok');
  }
  const resetBanner = () => (ui.reset ? `<div class="notice warn-box sb-banner">${H.icon('alert-triangle')} <span><strong>${T("Azzerare la partita?")}</strong> ${T("Conferma con un’altra pressione lunga entro 5 secondi, oppure qui.")}</span>
    <button class="btn small danger" data-action="ref-reset-ok">${T("Azzera")}</button><button class="btn small" data-action="ref-reset-no">${T("Annulla")}</button></div>` : '');
  // gesti dei pulsanti Flic (squadra 0/1): 1 tocco = scambio vinto, 2 tocchi = annulla, pressione lunga = azzera
  function onFlic(team, g) {
    const r = cur();
    if (!r || !r.cfg || !canEdit(r)) return;
    if (document.querySelector('dialog[open]')) return;
    if (g === 'hold') return askReset();
    if (g === 'triple') return;   // 3 o più tocchi: nessuna azione
    if (ui.reset) { ui.reset = null; clearTimeout(ui.resetTimer); }
    if (g === 'double') return undo();
    if (g !== 'click') return;
    const st = Score.replay(r.cfg, r.ev);
    if (st.phase === 'play') {
      // se c'era da cambiare campo, il tocco vuol dire che il cambio è stato fatto
      push(st.cur.needCC ? ['C', team ? 'B' : 'A'] : (team ? 'B' : 'A'));
    } else if (st.phase === 'setup' || st.phase === 'gameover') {
      // inizio del game: serve la squadra che preme; a destra come nel game precedente
      const prev = st.games[st.games.length - 1], rr = prev ? prev.start.r : [0, 0];
      push('G' + team + rr[0] + rr[1]);
    } else if (V()) V().say(V().announce(null, st, r.nomi), true);
  }
  // schermo sempre acceso durante la partita (il telefono non va in blocco e i pulsanti restano collegati)
  let lock = null;
  function wake(on) {
    if (!('wakeLock' in navigator)) return;
    if (on && !lock && document.visibilityState === 'visible') {
      lock = 'attesa';
      navigator.wakeLock.request('screen').then(l => { lock = l; l.addEventListener('release', () => { if (lock === l) lock = null; }); }).catch(() => { lock = null; });
    } else if (!on && lock && lock !== 'attesa') { lock.release().catch(() => {}); lock = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && /^#\/referto/.test(location.hash) && H) H.render(); });
  // tempo per il doppio tocco (cursore nel pannello dei pulsanti)
  document.addEventListener('change', e => { if (e.target.matches && e.target.matches('[data-flic-tap]') && window.Flic) window.Flic.set('tap', Number(e.target.value)); });
  if (window.Flic) window.Flic.onChange(() => { if (/^#\/referto/.test(location.hash) && H) H.render(); });

  // due pulsanti sullo schermo che si comportano come i Flic (prove senza pulsanti)
  function simButtons(r) {
    const F = window.Flic, team = b => (F.cfg.swap ? 1 - b : b);
    return `<div class="flic-sim">${[0, 1].map(b => `<button type="button" class="flic-sim-btn" data-flic-sim="${b}" ${r.colori ? `style="--sim:${r.colori[team(b)]}"` : ''}>
      <span>${T("Flic {0}", [b + 1])}</span><small>${H.esc(teamLabel(r, team(b)))}</small></button>`).join('')}
      <p class="muted small">${T("Simulatore: 1 tocco = vince lo scambio · 2 tocchi = annulla · tieni premuto = azzera")}</p></div>`;
  }
  // impostazioni dei pulsanti Flic
  function flicPanel(r) {
    const F = window.Flic;
    if (!F) return '';
    const c = F.cfg, L = F.learning, team = b => (c.swap ? 1 - b : b);
    const learnBtn = (b, slot, lbl) => L && L.team === b && L.slot === slot
      ? `<button class="btn small primary" data-action="ref-flic-cancel">${T("Premi ora il pulsante… (tocca per annullare)")}</button>`
      : `<button class="btn small" data-action="ref-flic-learn" data-b="${b}" data-slot="${slot}">${lbl}</button>`;
    const row = b => {
      const k = c.keys[b] || {};
      const extra = ['click', 'double', 'hold'].map(g => `<span class="chip">${{ click: T("1 tocco"), double: T("2 tocchi"), hold: T("pressione lunga") }[g]}: ${k[g] ? H.esc(F.keyLabel(k[g])) + ` <button type="button" class="link" data-action="ref-flic-clear" data-b="${b}" data-slot="${g}" aria-label="${T("Togli")}">×</button>` : '—'} ${learnBtn(b, g, T("Abbina"))}</span>`).join(' ');
      return `<div class="flic-row"><p><strong>${T("Pulsante {0}", [b + 1])}</strong> → ${H.esc(teamLabel(r, team(b)))}</p>
        <p class="small">${T("Tasto Bluetooth")}: <strong>${H.esc(F.keyLabel(k.press))}</strong> ${learnBtn(b, 'press', T("Abbina tasto"))}</p>
        <details class="small"><summary>${T("Tasti separati per i gesti (facoltativo)")}</summary><p>${extra}</p></details>
        <p class="small">${T("Ponte sul PC")}: <strong>${c.bridge[b] ? H.esc(c.bridge[b]) : '—'}</strong> ${F.wsState === 'collegato' ? learnBtn(b, 'bridge', T("Abbina dal ponte")) : ''}</p></div>`;
    };
    const PSTEP = [T("1 · Premi una volta il pulsante della squadra {0}", [H.esc(teamLabel(r, 0))]), T("2 · Premi una volta il pulsante della squadra {0}", [H.esc(teamLabel(r, 1))]),
      T("3 · Fai un doppio clic su uno dei due pulsanti (annulla)"), T("4 · Tieni premuto uno dei due pulsanti (azzera)")];
    if (F.pairing != null) return `<section class="card sb-flic"><h3>${H.icon('link')} ${T("Abbinamento dei pulsanti")}</h3>
        <div class="notice sb-banner flic-wiz">${H.icon('hand-click')} <span><strong>${PSTEP[F.pairing]}</strong></span>
          <button class="btn small" data-action="ref-flic-pair-stop">${T("Annulla")}</button></div>
        <ol class="small flic-howto">${PSTEP.map((x, i) => `<li class="${i < F.pairing ? 'muted' : ''}">${i < F.pairing ? '✓ ' : ''}${x.replace(/^\d · /, '')}</li>`).join('')}</ol></section>`;
    const wiz = L && ['press', 'bridge'].includes(L.slot) && ui.wizard != null
      ? `<div class="notice sb-banner flic-wiz">${H.icon('hand-click')} <span><strong>${T("Premi il pulsante di {0}", [H.esc(teamLabel(r, team(L.team)))])}</strong> (${T("pulsante {0} di 2", [L.team + 1])})</span>
        <button class="btn small" data-action="ref-flic-cancel">${T("Annulla")}</button></div>`
      : `<div class="actions wrap"><button class="btn primary" data-action="ref-flic-pair">${H.icon('link')} ${T("Abbina tutto (pulsanti e gesti)")}</button>
        <button class="btn" data-action="ref-flic-wizard">${H.icon('link')} ${T("Abbina solo i pulsanti")}</button>
        ${F.wsState === 'collegato' ? `<button class="btn" data-action="ref-flic-wizard" data-slot="bridge">${H.icon('link')} ${T("Abbina dal ponte")}</button>` : ''}</div>`;
    return `<section class="card sb-flic">
        <h3>${H.icon('hand-click')} ${T("Pulsanti Flic")}</h3>
        ${netPanel(r)}
        <p><strong>${T("1 tocco = la squadra vince lo scambio (punto o cambio palla) · 2 tocchi = annulla l’ultima azione · pressione lunga = azzera la partita (si conferma con un’altra pressione lunga).")}</strong></p>
        <ol class="small flic-howto">
          <li>${T("Nell’app Flic imposta ogni pulsante come tastiera (HID) e scegli un tasto diverso per ciascuno.")}</li>
          <li>${T("Abbina il pulsante al telefono, al Mac o al PC dalle impostazioni Bluetooth, come una tastiera.")}</li>
          <li>${T("Qui premi “Abbina i pulsanti” e poi il pulsante di ogni squadra.")}</li>
        </ol>
        ${wiz}
        ${[0, 1].map(row).join('')}
        <div class="flic-row">
          <p><strong>${T("Tasti comuni ai due pulsanti")}</strong> <span class="muted small">${T("(se nell’app Flic hai dato lo stesso tasto ai due pulsanti)")}</span></p>
          <p class="small">${T("Annulla l’ultima azione")}: <strong>${H.esc(F.keyLabel(c.comuni.double))}</strong> ${c.comuni.double ? `<button type="button" class="link" data-action="ref-flic-clear" data-b="comune" data-slot="double" aria-label="${T("Togli")}">×</button>` : ''} ${learnBtn('comune', 'double', T("Abbina"))}</p>
          <p class="small">${T("Azzera la partita")}: <strong>${H.esc(F.keyLabel(c.comuni.hold))}</strong> ${c.comuni.hold ? `<button type="button" class="link" data-action="ref-flic-clear" data-b="comune" data-slot="hold" aria-label="${T("Togli")}">×</button>` : ''} ${learnBtn('comune', 'hold', T("Abbina"))}</p>
          <p><button class="btn small" data-action="ref-flic-preset">${H.icon('wand')} ${T("Usa: 1 e 2 punto · 3 annulla · 5 azzera")}</button></p>
        </div>
        <div class="flic-test">
          <label>${T("Tempo per il doppio tocco")}: <strong>${Number(c.tap) || 450} ms</strong>
            <input type="range" data-flic-tap min="300" max="1000" step="50" value="${Number(c.tap) || 450}"></label>
          <p class="muted small">${T("Se 2 tocchi segnano due punti invece di annullare, allunga questo tempo.")}</p>
          <button class="btn small ${F.logOn ? 'primary' : ''}" data-action="ref-flic-log">${H.icon('keyboard')} ${F.logOn ? T("Ferma la prova dei tasti") : T("Prova dei tasti")}</button>
          ${F.logOn ? `<p class="muted small">${T("Premi i Flic: qui sotto vedi cosa arriva (tasto, giù/su, millisecondi dal precedente).")}</p>
            <ul class="plain flic-log">${F.log.map(x => `<li><code>${H.esc(F.keyLabel(x.code))}</code> ${H.esc(x.kind)} <span class="muted">+${x.dt} ms</span></li>`).join('') || `<li class="muted">${T("Ancora nessun tasto.")}</li>`}</ul>` : ''}
        </div>
        <div class="actions wrap"><button class="btn small" data-action="ref-flic-swap">${H.icon('arrows-exchange')} ${T("Inverti i pulsanti")}</button>
          <button class="btn small ${c.sim ? 'primary' : ''}" data-action="ref-flic-sim">${H.icon('device-gamepad-2')} ${c.sim ? T("Nascondi simulatore") : T("Mostra simulatore")}</button></div>
        <details class="small"><summary>${T("In alternativa: ponte su PC Windows o Linux (programma ufficiale Flic)")}</summary>
          <p class="muted">${T("Avvia il programma Flic e il ponte (cartella flic-ponte del progetto: ponte_flic.py), poi collega qui.")}</p>
          <form data-form="ref-ponte" class="row flic-ponte"><label>${T("Indirizzo del ponte")}<input name="ws" value="${H.esc(c.ws)}" placeholder="ws://localhost:8765"></label>
            <span class="actions">${F.wsState === 'off' ? `<button class="btn small">${T("Collega")}</button>` : `<button class="btn small" type="button" data-action="ref-ponte-off">${T("Scollega")}</button>`}
            <span class="muted small">${{ off: T("non collegato"), connessione: T("collegamento…"), collegato: T("collegato"), riconnessione: T("ponte non raggiungibile, riprovo…"), errore: T("indirizzo non valido") }[F.wsState] || ''}</span></span></form></details>
      </section>`;
  }

  // collegamento via internet: il Flic resta nell'app Flic (niente tastiera Bluetooth, il telefono tiene la sua tastiera)
  function netPanel(r) {
    const F = window.Flic, N = F.net, team = b => (F.cfg.swap ? 1 - b : b);
    const G = { click: T("1 tocco"), double: T("2 tocchi"), hold: T("pressione lunga") };
    const head = `<h4>${H.icon('world')} ${T("Senza tastiera Bluetooth (consigliato su iPhone)")}</h4>
      <p class="small">${T("Il Flic resta collegato solo all’app Flic: a ogni pressione l’app Flic manda un segnale via internet allo scoresheet. Così il telefono non vede nessuna tastiera e puoi scrivere normalmente. Serve internet.")}</p>`;
    if (!N.on) return `<div class="flic-row flic-net">${head}<p><button class="btn primary" data-action="ref-flic-net" data-on="1">${H.icon('world')} ${T("Attiva il collegamento via internet")}</button></p></div>`;
    const last = N.last ? T("Ultimo segnale: {0}", [`${T("Pulsante {0}", [N.last.b + 1])} · ${G[N.last.g]} · ${new Date(N.last.at).toLocaleTimeString()}`]) : T("Ancora nessun segnale: premi un Flic per provare.");
    const copy = (txt, lbl) => `<span class="flic-copy"><code>${H.esc(txt)}</code> <button type="button" class="btn small" data-action="ref-flic-copy" data-txt="${H.esc(txt)}">${H.icon('copy')} ${lbl || T("Copia")}</button></span>`;
    return `<div class="flic-row flic-net">${head}
      <p class="small"><strong>${N.live ? '🟢 ' + T("In ascolto") : '⚪ ' + T("Non in ascolto (serve la connessione)")}</strong> · ${H.esc(last)}</p>
      <ol class="small flic-howto">
        <li>${T("Se il Flic era abbinato come tastiera: Impostazioni → Bluetooth → (i) accanto al Flic → Dissocia dispositivo; nell’app Flic togli la modalità tastiera.")}</li>
        <li>${T("Nell’app Flic apri il pulsante, tocca “Click” e scegli l’azione “Internet Request”.")}</li>
        <li>${T("Metodo POST, l’indirizzo (URL) qui sotto, tipo di contenuto application/json e il testo (Body) del gesto. Ripeti per “Double Click” e “Hold” e poi per l’altro pulsante.")}</li>
      </ol>
      <p class="small"><strong>${T("Indirizzo (URL), uguale per tutti")}</strong><br>${copy(F.netUrl())}</p>
      ${[0, 1].map(b => `<p class="small"><strong>${T("Pulsante {0}", [b + 1])}</strong> → ${H.esc(teamLabel(r, team(b)))}<br>
        ${['click', 'double', 'hold'].map(g => `${G[g]}: ${copy(F.netBody(b, g))}`).join('<br>')}</p>`).join('')}
      <p class="muted small">${T("Non condividere questo indirizzo: chi lo ha può segnare punti. Con “Nuovo codice” lo cambi (poi vanno rifatte le azioni nell’app Flic).")}</p>
      <div class="actions wrap"><button class="btn small" data-action="ref-flic-net" data-on="0">${T("Disattiva")}</button>
        <button class="btn small" data-action="ref-flic-net-code">${H.icon('refresh')} ${T("Nuovo codice")}</button></div></div>`;
  }

  const actions = {
    'ref-flic-net': d => window.Flic.netOn(d.on === '1'),
    'ref-flic-net-code': () => { if (confirm(T("Il codice cambia: dovrai rifare le azioni nell’app Flic. Continuare?"))) window.Flic.netNewCode(); },
    'ref-flic-copy': d => {
      const ok = () => H.toast(T("Copiato."), 'ok');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.txt).then(ok, () => window.prompt(T("Copia"), d.txt));
      else window.prompt(T("Copia"), d.txt);
    },
    'ref-rally': d => push(Number(d.w) === 0 ? 'A' : 'B'),
    'ref-to': d => {
      const r = cur(); if (!r) return;
      push('T' + d.t);
      ui.to = { id: r.id || 'libero', t: Number(d.t), end: Date.now() + 60000 };
      clearInterval(ui.toTimer);
      ui.toTimer = setInterval(() => { const el = document.querySelector('[data-to-left]'); if (!el || !ui.to) { clearInterval(ui.toTimer); return; } el.textContent = toLeft(); }, 500);
      H.render();
    },
    'ref-to-end': () => { ui.to = null; clearInterval(ui.toTimer); H.render(); },
    'ref-cc': () => push('C'),
    'ref-voice': () => {
      if (!V()) return;
      V().setOn(!V().on);
      if (V().on) { const r = cur(), G = r && r.cfg && Score.replay(r.cfg, r.ev).cur; V().say(G ? V().callText(G) + '.' : 'Voice on.'); }
      else if (window.speechSynthesis) speechSynthesis.cancel();
      H.render();
    },
    'ref-voice-panel': () => { ui.voiceOpen = !ui.voiceOpen; H.render(); },
    'ref-voice-test': () => { if (V()) V().say(SAMPLE, true); },
    'ref-undo': () => undo(),
    'ref-reset': () => askReset(),
    'ref-reset-ok': () => doReset(),
    'ref-reset-no': () => { ui.reset = null; clearTimeout(ui.resetTimer); H.render(); },
    'ref-flic-panel': () => { ui.flicOpen = !ui.flicOpen; H.render(); },
    'ref-flic-learn': d => window.Flic.learn(d.b === 'comune' ? 'comune' : Number(d.b), d.slot, () => H.toast(T("Pulsante abbinato."), 'ok')),
    'ref-flic-wizard': d => {
      const slot = d.slot || 'press', r = cur();
      const name = b => (r && r.nomi ? teamLabel(r, window.Flic.cfg.swap ? 1 - b : b) : T("squadra {0}", [b + 1]));
      ui.wizard = 0;
      window.Flic.learn(0, slot, () => {
        ui.wizard = 1;
        if (V()) V().say(`Now the button of ${name(1).replace(/ \/ /g, ' and ')}.`, true);
        window.Flic.learn(1, slot, () => { ui.wizard = null; H.toast(T("Pulsanti abbinati: si gioca!"), 'ok'); if (V()) V().say('Buttons paired.', true); });
      });
    },
    'ref-flic-cancel': () => { ui.wizard = null; window.Flic.cancelLearn(); },
    'ref-flic-clear': d => window.Flic.clearKey(d.b === 'comune' ? 'comune' : Number(d.b), d.slot),
    'ref-flic-pair': () => {
      const r = cur(), say = t => { if (V()) V().say(t, true); };
      ui.flicOpen = true;
      say('Press the button of the first team once.');
      window.Flic.pairAll((n, why) => {
        if (why === 'stesso') { H.toast(T("Questo è il pulsante della prima squadra: premi quello dell’altra."), 'err'); say('Now the other button.'); return; }
        say(['', 'Now press the button of the second team once.', 'Now double click one of the buttons.', 'Now hold one of the buttons.'][n]);
      }, how => {
        H.toast({ gesti: T("Abbinamento completato: 1 tocco punto, doppio clic annulla, pressione lunga azzera."),
          'senza-azzera': T("Pulsanti e doppio clic abbinati. La pressione lunga manda lo stesso tasto del clic: per azzerare usa il pulsante sullo schermo."),
          tocchi: T("Il Flic manda sempre lo stesso tasto: i gesti li riconosce l’app (1 tocco, 2 tocchi, pressione lunga).") }[how], 'ok');
        say('Buttons paired.');
        H.render();
      });
    },
    'ref-flic-pair-stop': () => window.Flic.cancelPair(),
    'ref-flic-preset': () => { window.Flic.preset(); H.toast(T("Tasti impostati: 1 e 2 punto, 3 annulla, 5 azzera."), 'ok'); },
    'ref-flic-log': () => window.Flic.setLog(!window.Flic.logOn),
    'ref-flic-swap': () => window.Flic.set('swap', !window.Flic.cfg.swap),
    'ref-flic-sim': () => window.Flic.set('sim', !window.Flic.cfg.sim),
    'ref-ponte-off': () => window.Flic.disconnect(),
    'ref-retire': () => {
      const r = cur(); if (!r) return;
      const w = prompt(T("Quale squadra si ritira? Scrivi 1 per {0} o 2 per {1}", [teamLabel(r, 0), teamLabel(r, 1)]));
      if (w !== '1' && w !== '2') return;
      push('R' + (Number(w) - 1));
    },
    'ref-send': () => {
      const r = cur(); if (!r || r.libero) return;
      r.stato = 'finito'; persist(true); H.render();
      H.toast(T("Risultato inviato: lo conferma l’organizzatore."), 'ok');
    },
    'ref-confirm': d => confirmResult(d.id),
    'ref-discard': d => {
      if (!confirm(T("Scartare questo scoresheet? Il risultato andrà inserito a mano."))) return;
      window.Cloud.deleteReferto(d.id).catch(e => H.toast(e.code || e.message, 'err'));
    },
    'ref-pdf': () => pdf(cur()),
    'ref-new': () => {
      if (!confirm(T("Iniziare una nuova partita? Quella attuale verrà cancellata da questo dispositivo."))) return;
      ui.ref = { libero: true, cfg: null, nomi: null, ev: [] };
      try { localStorage.removeItem(LS); } catch (e) { /* ignora */ }
      H.render();
    }
  };
  const forms = {
    'ref-ponte': v => { window.Flic.set('ws', (v.ws || '').trim() || 'ws://localhost:8765'); window.Flic.connect(); },
    'ref-libero': (v, f) => {
      const doppio = v.doppio === '1';
      const nomi = [[v.a0, v.a1], [v.b0, v.b1]].map(x => (doppio ? x : x.slice(0, 1)).map(s => (s || '').trim()));
      if (nomi.some(x => x.some(s => !s))) return H.formError(f, doppio ? T("Scrivi i nomi dei 4 giocatori.") : T("Scrivi i nomi dei 2 giocatori."));
      const g = Number(v.giochi) || 1, p = Number(v.punti) || 11, dec = Number(v.decisivo) || p;
      ui.ref = { libero: true, cfg: { sistema: v.sistema === 'rally' ? 'rally' : 'sideout', doppio, giochi: g, punti: Array.from({ length: g }, (_, i) => (i === g - 1 && g > 1 ? dec : p)), cc: readCc(v) }, nomi, colori: [v.c0, v.c1], ev: [] };
      persist(); H.render();
    },
    'ref-start': v => {
      const r = cur(); if (!r) return;
      push('G' + (Number(v.s) ? 1 : 0) + (Number(v.r0) ? 1 : 0) + (Number(v.r1) ? 1 : 0));
    }
  };

  // ---------- conferma dell'organizzatore ----------
  function confirmResult(id) {
    const r = (H.S().referti || []).find(x => x.id === id) || (ui.ref && ui.ref.id === id ? ui.ref : null);
    if (!r) return;
    const t = H.tourById(r.tid);
    if (!t || !H.tourMgr(t)) return;
    const m = H.findMatch(t, r.key);
    if (!m) return H.toast(T("Gara non trovata."), 'err');
    const st = Score.replay(r.cfg, r.ev), res = Score.result(r.cfg, st);
    if (st.phase !== 'end') return H.toast(T("La partita non è ancora finita."), 'err');
    const amer = Array.isArray(m.a);
    const err = Logic.validateResult(res.sets, amer ? null : res.forfeit, t.config);
    if (err) return H.toast(T("Risultato non valido per questo torneo: {0} Inseriscilo a mano.", [err]), 'err');
    t.results[r.key] = amer ? { sets: res.sets, closed: true } : { a: m.a, b: m.b, sets: res.forfeit ? [] : res.sets, forfeit: res.forfeit, closed: true };
    H.save();
    if (ui.ref && ui.ref.id === id) ui.ref.stato = 'omologato';
    window.Cloud.saveReferto(id, { stato: 'omologato' }).catch(() => {});
    H.toast(T("Risultato confermato e inserito nel torneo."), 'ok');
    H.render();
  }

  // ---------- nel torneo: diretta, link allo scoresheet, risultati da confermare ----------
  const forMatch = (t, key) => (H.S().referti || []).find(r => r.tid === t.id && r.key === key);
  function liveChip(t, m) {
    const r = forMatch(t, m.key);
    if (!r || m.stats || !r.sintesi || r.stato === 'omologato') return '';
    const s = r.sintesi, done = (s.games || []).filter((_, i) => i < s.g);
    return `<a class="live-chip ${r.stato === 'finito' ? 'done' : ''}" href="#/referto/${t.id}/${encodeURIComponent(m.key)}" title="${T("Segui lo scoresheet")}">${r.stato === 'finito' ? H.icon('flag') : '<span class="live-dot"></span>'} ${done.length ? done.join(' · ') + ' · ' : ''}${s.cur[0]}-${s.cur[1]}</a>`;
  }
  function matchLink(t, m) {
    if (!H.canScore(t) || m.stats || m.bye) return '';
    return `<a class="ss-link" href="#/referto/${t.id}/${encodeURIComponent(m.key)}" title="${T("Apri lo scoresheet")}" aria-label="${T("Apri lo scoresheet")}">${H.icon('clipboard-text')}</a>`;
  }
  function pendingBlock(t) {
    if (!H.tourMgr(t)) return '';
    const list = (H.S().referti || []).filter(r => r.tid === t.id && r.stato === 'finito');
    if (!list.length) return '';
    return `<section class="card sb-pending"><h2>${H.icon('clipboard-check')} ${T("Risultati dagli scoresheet da confermare ({0})", [list.length])}</h2>
      ${list.map(r => { const st = Score.replay(r.cfg, r.ev), res = Score.result(r.cfg, st);
        return `<div class="sb-pend-row"><span>${H.esc(r.nomi[0].join(' / '))} <strong>${res.sets.map(s => s.join('-')).join(' · ')}${res.forfeit ? ' (' + T("ritiro") + ')' : ''}</strong> ${H.esc(r.nomi[1].join(' / '))}${r.campo ? ` <span class="muted small">· ${T("Campo {0}", [H.esc(r.campo)])}</span>` : ''}</span>
          <span class="actions"><button class="btn small primary" data-action="ref-confirm" data-id="${r.id}">${T("Conferma")}</button>
          <a class="btn small" href="#/referto/${t.id}/${encodeURIComponent(r.key)}">${T("Apri")}</a>
          <button class="btn small danger" data-action="ref-discard" data-id="${r.id}">${T("Scarta")}</button></span></div>`; }).join('')}</section>`;
  }

  // ---------- PDF ----------
  async function pdf(r) {
    if (!r) return;
    let JsPDF;
    try { JsPDF = await H.pdfLibs(); } catch (e) { return H.toast(T("Non riesco a creare il PDF: controlla la connessione e riprova."), 'err'); }
    const st = Score.replay(r.cfg, r.ev), res = Score.result(r.cfg, st), t = r.libero ? null : H.tourById(r.tid);
    const doc = new JsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth();
    const green = [46, 125, 79];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(T("Scoresheet pickleball"), M, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = [];
    if (t) lines.push(`${t.nome}${t.data ? ' · ' + t.data : ''}`);
    if (r.campo) lines.push(T("Campo {0}", [r.campo]));
    lines.push(`${sistemaLabel(r.cfg)} · ${r.cfg.giochi === 1 ? T("game unico") : T("{0} game su {1}", [Score.needWins(r.cfg), r.cfg.giochi])} · ${T("ai {0}", [r.cfg.punti[0]])}`);
    lines.push(...[0, 1].map(i => `${T("Squadra {0}", [i + 1])}: ${teamLabel(r, i)}${r.colori && r.colori[i] ? ` (${T("maglia")} ${colorName(r.colori[i]).toLowerCase()})` : ''}`));
    lines.push(`${T("Risultato")}: ${res.sets.map(s => s.join('-')).join(' · ') || '—'}${st.winner != null ? ' — ' + T("vince {0}", [teamLabel(r, st.winner)]) : ''}${st.retired != null ? ' (' + T("ritiro di {0}", [teamLabel(r, st.retired)]) + ')' : ''}`);
    lines.forEach((l, i) => doc.text(l, M, 26 + i * 5.5));
    let y = 26 + lines.length * 5.5 + 4;
    st.games.forEach(g => {
      let n = 0;
      const body = g.log.map(x => {
        if (x.to != null) return ['', T("Timeout {0}", [teamLabel(r, x.to)]), '', x.score.join('-')];
        if (x.cc) return ['', T("Cambio campo"), '', x.score.join('-')];
        if (x.rit != null) return ['', T("Ritiro di {0}", [teamLabel(r, x.rit)]), '', x.score.join('-')];
        n++;
        const srvName = r.cfg.doppio ? r.nomi[x.srv][x.p] : r.nomi[x.srv][0];
        const esito = x.pt ? T("Punto squadra {0}", [x.w + 1]) : x.second ? T("Passa al 2° servizio") : T("Cambio palla");
        return [String(n), `${srvName}${x.sn ? ' (' + x.sn + ')' : ''}`, esito, x.score.join('-')];
      });
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [[{ content: `${T("Game {0}", [g.n + 1])} — ${g.score.join('-')}`, colSpan: 4 }], ['#', T("Al servizio"), T("Esito"), T("Punteggio")]],
        body, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.2 }, headStyles: { fillColor: green }, columnStyles: { 0: { cellWidth: 10 }, 3: { cellWidth: 24 } }
      });
      y = doc.lastAutoTable.finalY + 6;
    });
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    [T("Refertista"), T("Capitano squadra 1"), T("Capitano squadra 2")].forEach((l, i) => { const x = M + i * ((W - 2 * M) / 3); doc.line(x, y + 12, x + 52, y + 12); doc.text(l, x, y + 17); });
    const name = (r.nomi || []).map(x => x.join('-')).join('_vs_').replace(/[^\w\-]+/g, '_').slice(0, 60);
    doc.save(`scoresheet_${name || 'partita'}.pdf`);
  }

  window.Referto = {
    init: helpers => { H = helpers; },
    view, close, actions, forms, liveChip, matchLink, pendingBlock, refId, ccFields, readCc,
    get cur() { return ui.ref; }
  };
})();
