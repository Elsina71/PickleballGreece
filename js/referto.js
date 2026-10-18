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
    return `<fieldset><legend>${T("Cambio campo")}</legend><div class="row">
      <label>${T("Tra un game e l’altro")}<select name="ccTra"><option value="1">${T("Sì")}</option><option value="0" ${c.ccTra === false ? 'selected' : ''}>${T("No")}</option></select></label>
      <label>${T("Durante il game")}<select name="ccDurante"><option value="decisivo">${T("Solo nel game decisivo")}</option><option value="tutti" ${c.ccDurante === 'tutti' ? 'selected' : ''}>${T("In ogni game")}</option><option value="no" ${c.ccDurante === 'no' ? 'selected' : ''}>${T("Mai")}</option></select></label>
      <label>${T("A quanti punti")}<input type="number" name="ccA" min="0" max="20" value="${Number(c.ccA) || ''}" placeholder="${T("a metà")}"></label></div>
      <p class="muted small">${T("Vuoto = a metà del game (6 ai 11, 8 ai 15, 11 ai 21): si cambia quando una squadra arriva a quel punteggio.")}</p></fieldset>`;
  }
  const readCc = v => ({ tra: v.ccTra !== '0', durante: ['no', 'tutti'].includes(v.ccDurante) ? v.ccDurante : 'decisivo', a: Math.max(0, Math.round(Number(v.ccA) || 0)) });
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
  function close() { window.Cloud && window.Cloud.watchReferto && window.Cloud.watchReferto(null); }

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
    let body;
    if (st.phase === 'setup' || st.phase === 'gameover') body = (st.phase === 'gameover' ? gameOverBanner(r, st) : '') + (edit ? startForm(r, st) : `<p class="muted">${T("In attesa dell’inizio del game.")}</p>`);
    else body = board(r, st, edit);
    return `<div class="sb-page">${head}${body}${history(r, st)}${tools(r, st, edit)}</div>`;
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
        ${edit ? `<button class="btn primary big sb-win" data-action="ref-rally" data-w="${i}" ${G.needCC ? 'disabled' : ''}>${r.cfg.sistema === 'rally' ? T("Punto") : serving ? T("Punto") : T("Vince lo scambio")}</button>
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
    if (r.ev.length) b.push(`<button class="btn" data-action="ref-pdf">${H.icon('file-download')} ${T("Scarica PDF")}</button>`);
    if (r.libero) b.push(`<button class="btn" data-action="ref-new">${H.icon('refresh')} ${T("Nuova partita")}</button>`);
    return b.length ? `<div class="actions wrap sb-tools">${b.join('')}</div>` : '';
  }

  const toLeft = () => { if (!ui.to) return ''; const s = Math.max(0, Math.ceil((ui.to.end - Date.now()) / 1000)); return s ? `0:${String(s).padStart(2, '0')}` : T("tempo scaduto"); };

  // ---------- azioni ----------
  const cur = () => ui.ref;
  function push(e) {
    const r = cur();
    if (!r || !canEdit(r)) return;
    r.ev.push(e);
    if (!r.libero && r.stato === 'finito') r.stato = 'live';
    persist();
    H.render();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) { /* ignora */ }
  }
  const actions = {
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
    'ref-undo': () => {
      const r = cur(); if (!r || !canEdit(r) || !r.ev.length) return;
      r.ev.pop();
      if (!r.libero && r.stato === 'finito') r.stato = 'live';
      persist(); H.render();
    },
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
