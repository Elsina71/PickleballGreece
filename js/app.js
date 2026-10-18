// Interfaccia: pagine, dialoghi e azioni.
const App = (() => {
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('dialog');
  const S = () => Store.state;
  const me = () => Store.current();
  const isAdmin = () => { const u = me(); return !!u && u.role === 'admin'; };
  // Gestore tornei: gestisce i tornei (anche l'admin lo è), senza accesso al resto dell'amministrazione.
  // Chi ha lanciato una sfida a torneo gestisce il torneo che ne nasce (curTour: torneo aperto o su cui si agisce).
  let curTour = null;
  const canTours = () => isAdmin() || (!!me() && me().role === 'tornei') || (!!curTour && !!me() && (curTour.owner === me().id
    || (!!curTour.lega && ((S().leghe || []).find(l => l.id === curTour.lega) || { admins: [] }).admins.includes(me().id))));

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayKey = () => new Date().toLocaleDateString('sv');
  const nowHM = () => new Date().toTimeString().slice(0, 5);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); };
  const fmtDate = (d, long) => (d ? new Date(d + 'T12:00').toLocaleDateString(I18n.locale, long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  const icon = n => `<i class="ti ti-${n}" aria-hidden="true"></i>`;

  // Date in formato italiano gg/mm/aaaa (i dati restano salvati come AAAA-MM-GG).
  const itDate = iso => (iso ? iso.split('-').reverse().join('/') : '');
  function parseItDate(txt) {
    const m = /^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\s*$/.exec(txt || '');
    if (!m) return null;
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const d = new Date(iso + 'T12:00');
    return !isNaN(d) && d.toLocaleDateString('sv') === iso ? iso : null;
  }
  // Campo data: testo gg/mm/aaaa + pulsante che apre il calendario del dispositivo.
  function dateField(name, iso, opts) {
    const o = opts || {};
    return `<span class="date-field"><input type="text" name="${name}" data-date value="${itDate(iso)}" placeholder="gg/mm/aaaa" inputmode="numeric" autocomplete="off" ${o.required ? 'required' : ''}>
      <span class="date-pick"><button type="button" class="btn icon" data-action="pick-date" aria-label="${T("Apri il calendario")}">${icon('calendar')}</button>
        <input type="date" class="date-native" value="${iso || ''}" data-change="date-native" tabindex="-1" aria-hidden="true" ${o.min ? `min="${o.min}"` : ''}></span></span>`;
  }
  const money = n => (Number(n) ? `€ ${Number(n).toLocaleString(I18n.locale)}` : T("Gratuito"));

  const DISCIPLINE = { singolo: T("Singolo"), doppio: T("Doppio") };
  const GENERI = { open: T("Open"), M: T("Maschile"), F: T("Femminile"), misto: T("Misto") };
  const SESSI = { M: T("Uomo"), F: T("Donna") };
  // Livelli di gioco: select e caselle "livelli ammessi" (tornei e sfide).
  const levelSelect = (name, cur, req) => `<select name="${name}" ${req ? 'required' : ''}><option value="">—</option>${Object.entries(Logic.LIVELLI).map(([k, l]) => `<option value="${k}" ${Number(cur) === Number(k) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const levelName = n => Logic.LIVELLI[n] || '—';
  const levelsBox = (sel, help) => `<fieldset class="levels"><legend>${T("Livelli ammessi")}</legend>
    ${Object.entries(Logic.LIVELLI).map(([k, l]) => `<label class="check"><input type="checkbox" name="livelli" value="${k}" ${(sel || []).map(Number).includes(Number(k)) ? 'checked' : ''}> ${l}</label>`).join('')}
    <p class="muted small">${help || T("Nessuna casella = aperto a tutti i livelli.")}</p></fieldset>`;
  const readLevels = f => [...f.querySelectorAll('input[name=livelli]:checked')].map(el => Number(el.value)).sort();
  const levelsText = l => (l && l.length ? l.map(levelName).join(', ') : 'tutti');
  // Messaggio se qualcuno non ha un livello ammesso (null = tutto a posto).
  function levelError(allowed, uids) {
    if (!allowed || !allowed.length) return null;
    const bad = uids.filter(Boolean).filter(id => !levelOk(allowed, id));
    if (!bad.length) return null;
    const u = S().users.find(x => x.id === bad[0]);
    if (me() && bad[0] === me().id && !me().livello) return T("Indica il tuo livello di gioco nel profilo.");
    return `${u ? u.nome + ' ' + u.cognome : T("Il giocatore")} (${levelName(u && u.livello)}) ${T("non è tra i livelli ammessi: {0}.", [levelsText(allowed)])}`;
  }
  const levelOk = (allowed, uid) => { if (!allowed || !allowed.length) return true; const u = S().users.find(x => x.id === uid); return !!u && allowed.map(Number).includes(Number(u.livello)); };
  // Iscrizione a coppie fisse (doppio classico); americana e fantasma sono individuali.
  const isPairs = t => t.disciplina === 'doppio' && !Logic.individualEntry(t);

  const ui = { sel: null, date: todayKey(), tab: {}, rank: { cat: 'sfide', categoriaId: '' }, counts: {}, admMonth: null, admDay: null, admAll: false, authTab: 'login' };

  function userName(id) {
    const u = S().users.find(x => x.id === id);
    return u ? `${u.nome} ${u.cognome}` : '—';
  }

  // Nome dell'iscritto: giocatore registrato oppure ospite inserito dall'organizzatore.
  const guestName = e => (e && e.guest ? `${e.guest.nome} ${e.guest.cognome}` : null);
  const entrySex = e => (e && e.guest ? e.guest.sesso : (S().users.find(u => u.id === (e && e.p1)) || {}).sesso || '');

  function entryLabel(t, id) {
    if (id === Logic.BYE) return 'bye';
    const e = t.entries.find(x => x.id === id);
    if (!e) return '—';
    const names = [guestName(e) || userName(e.p1)];
    if (isPairs(t)) names.push(e.p2 ? userName(e.p2) : '<em>' + T("compagno da definire") + '</em>');
    return names.map(n => (n.startsWith('<em>') ? n : esc(n))).join(' / ');
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function save() { Store.save(); render(); }

  // Aggiornamenti dal database: si rimanda il ridisegno se l'utente sta scrivendo o ha un dialogo aperto.
  let pendingRender = false;
  function busy() {
    const a = document.activeElement;
    return $dialog.open || !!$app.querySelector('form[data-dirty]') || (a && a !== document.body && a.matches('input, select, textarea') && $app.contains(a));
  }
  function refresh() {
    if (busy()) { pendingRender = true; return; }
    pendingRender = false;
    render();
  }

  function cloudError(err) {
    const code = (err && err.code) || '';
    toast(code === 'permission-denied' ? T("Operazione non consentita (forse lo slot è già stato prenotato o le iscrizioni sono chiuse).")
      : T("Errore di collegamento al database") + (code ? ` (${code})` : '') + '.', 'err');
  }

  // ---------- temi ----------

  const applyTheme = (th, save) => Temi.apply(th, save);

  function themeDialog() {
    const cur = document.documentElement.dataset.theme || Temi.DEFAULT;
    Temi.loadAll();
    const scroll = $dialog.open ? ($dialog.querySelector('.theme-grid') || {}).scrollTop : 0;
    openDialog(`
      <h2>${T("{0} Scegli il tuo stile", [icon('palette')])}</h2>
      <p class="muted small">${T("Colori, caratteri e decorazioni cambiano in tutta l’app. Tocca un tema per provarlo.")}</p>
      <div class="theme-grid">
        ${Object.entries(Temi.LIST).map(([k, v]) => `
          <button type="button" class="theme-card ${k === cur ? 'on' : ''}" data-action="set-theme" data-pick="${k}" aria-pressed="${k === cur}">
            <span class="tp" data-theme="${k}">
              <span class="tp-top"><i></i><i></i></span>
              <span class="tp-hero">${T("Aa")}</span>
              <span class="tp-slots"><i class="f"></i><i class="f"></i><i class="b"></i><i class="s"></i><i class="f"></i></span>
            </span>
            <strong>${v.nome}</strong><small>${v.desc}</small>
          </button>`).join('')}
      </div>
      <p class="muted small">${me() ? T("La scelta viene salvata nel tuo profilo.") : T("La scelta vale per questo dispositivo. Accedi per salvarla nel profilo.")}</p>
      <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Chiudi")}</button></div>`);
    const g = $dialog.querySelector('.theme-grid');
    if (g && scroll) g.scrollTop = scroll;
  }

  // ---------- dialoghi ----------

  function openDialog(html) {
    $dialog.innerHTML = `<div class="dialog-body">${html}</div>`;
    if (!$dialog.open) $dialog.showModal();
    const first = $dialog.querySelector('input:not([type=hidden]), select, textarea');
    if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
  }

  const closeDialog = () => { if ($dialog.open) $dialog.close(); };

  // ---------- componenti ----------

  function sectionHead(title, extra) {
    return `<div class="section-head"><h2>${title}</h2>${extra || ''}</div>`;
  }

  function empty(text, ic) {
    return `<div class="empty">${icon(ic || 'mood-empty')}<p>${text}</p></div>`;
  }

  function statusBadge(t) {
    const st = Logic.status(t);
    const cls = { concluso: 'done', 'in corso': 'live', 'iscrizioni aperte': 'open', 'in preparazione': '' }[st];
    return `<span class="badge ${cls}">${st}</span>`;
  }

  function pointsLabel(t) {
    if (t.categoriaId === 'custom') return T("punti personalizzati");
    const cat = S().categories.find(c => c.id === t.categoriaId);
    return cat ? cat.nome : T("senza punti in classifica");
  }

  // Nome del giocatore iscritto (formule individuali).
  const pname = (t, id) => { const e = t.entries.find(x => x.id === id); return esc(e ? guestName(e) || userName(e.p1) : '—'); };
  // Lato di una gara: squadra (id) oppure coppia del turno ([id, id]).
  const sideName = (t, side) => (Array.isArray(side) ? side.map(id => pname(t, id)).join(' + ') : teamName(t, side));

  function tourCard(t) {
    return `
      <a class="card tour-card" href="#/tornei/${t.id}">
        <div class="tour-date"><strong>${t.data ? new Date(t.data + 'T12:00').getDate() : '?'}</strong><small>${t.data ? new Date(t.data + 'T12:00').toLocaleDateString(I18n.locale, { month: 'short' }) : ''}</small></div>
        <div class="tour-main">
          <h3>${esc(t.nome)}</h3>
          <p class="muted small">${esc(Logic.FORMATS[t.formato])} · ${DISCIPLINE[t.disciplina] || ''} ${GENERI[t.genere] || ''} · ${esc(pointsLabel(t))}</p>
          <p class="small">${statusBadge(t)} <span class="muted">${t.entries.length} iscritti</span></p>
        </div>
        ${icon('chevron-right')}
      </a>`;
  }

  function courseCard(c, full) {
    const u = me(), n = c.iscritti.length, left = Math.max(0, c.posti - n), mine = u && c.iscritti.includes(u.id);
    const past = (c.fine || c.inizio) < todayKey();
    return `
      <article class="card course-card ${c.promo ? 'promo' : ''}">
        ${c.promo ? `<span class="ribbon">${T("{0} In evidenza", [icon('star')])}</span>` : ''}
        <p class="kicker">${c.tipo === 'lezione' ? T("Lezione") : c.tipo === 'clinic' ? T("Clinic") : T("Corso")} · ${esc(c.livello || T("Tutti i livelli"))}</p>
        <h3>${esc(c.titolo)}</h3>
        ${full ? `<p>${esc(c.descrizione)}</p>` : ''}
        <ul class="facts">
          <li>${icon('calendar')} ${fmtDate(c.inizio)}${c.fine && c.fine !== c.inizio ? ' → ' + fmtDate(c.fine) : ''}</li>
          ${c.orario ? `<li>${icon('clock')} ${esc(c.orario)}</li>` : ''}
          ${c.istruttore ? `<li>${icon('user-star')} ${esc(c.istruttore)}</li>` : ''}
          <li>${icon('ticket')} ${money(c.prezzo)}</li>
          <li>${icon('users')} ${left ? `${T("{0} posti liberi su {1}", [left, c.posti])}` : T("Completo")}</li>
        </ul>
        <div class="actions">
          ${!full ? `<a class="btn" href="#/corsi">${T("Dettagli")}</a>` : ''}
          ${full && !past ? (mine
            ? `<span class="badge done">${T("{0} Sei iscritto", [icon('check')])}</span><button class="btn" data-action="course-leave" data-id="${c.id}">${T("Annulla iscrizione")}</button>`
            : `<button class="btn primary" data-action="course-join" data-id="${c.id}" ${left ? '' : 'disabled'}>${T("Iscriviti")}</button>`) : ''}
          ${full && isAdmin() ? `<button class="btn" data-action="course-edit" data-id="${c.id}">${T("{0} Modifica", [icon('pencil')])}</button>` : ''}
        </div>
        ${full && isAdmin() ? `<details class="enrolled"><summary>${T("Iscritti ({0})", [n])}</summary>${n ? `<ol>${c.iscritti.map(id => `<li>${esc(userName(id))} <button class="link danger" data-action="course-kick" data-id="${c.id}" data-user="${id}">${T("rimuovi")}</button></li>`).join('')}</ol>` : '<p class="muted small">' + T("Nessun iscritto.") + '</p>'}</details>` : ''}
      </article>`;
  }

  // ---------- home ----------

  function viewHome() {
    const s = S(), u = me();
    const next = s.tournaments.filter(t => !t.closed).sort((a, b) => (a.data || '').localeCompare(b.data || '')).slice(0, 4);
    const promo = s.courses.filter(c => c.promo && (c.fine || c.inizio) >= todayKey());
    return `
      ${noticesBlock()}
      ${notifBlock()}
      ${sfideAlerts()}
      <section class="hero">
        <div>
          <p class="kicker">${u ? `${T("Ciao {0}!", [esc(u.nome)])}` : T("Benvenuto")}</p>
          <h1>${esc(s.settings.nome)}</h1>
          <p>${T("Lancia una sfida o rispondi a quelle degli altri, gioca i tornei, segui classifiche e risultati.")}</p>
          <div class="actions">
            <a class="btn primary big" href="#/sfide">${T("{0} Sfide", [icon('swords')])}</a>
            <a class="btn big" href="#/tornei">${T("{0} Tornei", [icon('trophy')])}</a>
          </div>
        </div>
        <div class="hero-ball" aria-hidden="true"></div>
      </section>
      ${s.settings.avviso ? `<div class="notice">${icon('speakerphone')} <span>${esc(s.settings.avviso)}</span></div>` : ''}
      ${editorialBlock()}
      ${sfideHomeBlock()}
      <section>${sectionHead(T("Tornei in programma"), '<a href="#/tornei">' + T("Tutti") + '</a>')}
        ${next.length ? `<div class="grid">${next.map(tourCard).join('')}</div>` : empty(T("Nessun torneo in programma."), 'trophy')}</section>
      <section>${sectionHead(T("Corsi e lezioni in evidenza"), '<a href="#/corsi">' + T("Tutti") + '</a>')}
        ${promo.length ? `<div class="grid">${promo.map(c => courseCard(c, false)).join('')}</div>` : empty(T("Nessun corso in evidenza."), 'school')}</section>`;
  }

  // ---------- spazio editoriale della home ----------
  // Due articoli: foto (altrimenti una palla da pickleball), titolo in grassetto, testo e link facoltativo.

  const ARTICOLI = 2;
  const articolo = i => Object.assign({ titolo: '', testo: '', foto: '', link: '', linkTesto: '' }, (S().articoli || [])[i] || {});
  const safeUrl = u => (/^(https?:\/\/|mailto:|tel:|#\/)/i.test(u || '') ? u : u ? 'https://' + u : '');
  const paragraphs = t => String(t || '').split(/\n\s*\n|\n/).filter(x => x.trim()).map(x => `<p>${esc(x)}</p>`).join('');

  function editorialBlock() {
    const list = [...Array(ARTICOLI).keys()].map(articolo).filter(a => a.titolo || a.testo);
    if (!list.length) return '';
    return `<section>${sectionHead(T("In evidenza"))}<div class="articles">${list.map(a => `
      <article class="card article">
        ${a.foto ? `<img class="article-img" src="${esc(a.foto)}" alt="">` : '<div class="article-img ball" aria-hidden="true"><span class="hero-ball"></span></div>'}
        <div class="article-body">
          ${a.titolo ? `<h3>${esc(a.titolo)}</h3>` : ''}
          ${paragraphs(a.testo)}
          ${a.link ? `<a class="btn small" href="${esc(safeUrl(a.link))}" ${a.link.startsWith('#/') ? '' : 'target="_blank" rel="noopener"'}>${esc(a.linkTesto || T("Scopri di più"))} ${icon('arrow-right')}</a>` : ''}
        </div>
      </article>`).join('')}</div></section>`;
  }

  // Foto ridotta (max 1000 px) e compressa in JPEG, salvata direttamente nel database.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = 0.8, url = c.toDataURL('image/jpeg', q);
        while (url.length > 350000 && q > 0.35) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(img.src);
        resolve(url);
      };
      img.onerror = () => reject(new Error(T("Immagine non leggibile.")));
      img.src = URL.createObjectURL(file);
    });
  }

  // Logo (leghe): al massimo 256 px, trasparenza conservata (webp), qualche decina di KB.
  function shrinkLogo(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let url = c.toDataURL('image/webp', 0.85);
        if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
        URL.revokeObjectURL(img.src);
        resolve(url);
      };
      img.onerror = () => reject(new Error(T("Immagine non leggibile.")));
      img.src = URL.createObjectURL(file);
    });
  }
  const legaLogo = (l, size) => (l && l.logo ? `<img class="lega-logo" src="${l.logo}" alt="" width="${size}" height="${size}">` : '');

  function articleForm(i) {
    const a = articolo(i), foto = ui.artFoto && ui.artFoto[i] != null ? ui.artFoto[i] : a.foto;
    return `<form data-form="articolo" class="article-form"><input type="hidden" name="i" value="${i}">
      <h3>${T("Articolo {0}", [i + 1])}</h3>
      <div class="article-edit">
        <div class="article-thumb">${foto ? `<img src="${esc(foto)}" alt="">` : '<div class="ball"><span class="hero-ball"></span></div>'}</div>
        <div class="actions tight">
          <label class="btn small">${icon('photo')} ${foto ? T("Cambia foto") : T("Carica foto")}<input type="file" accept="image/*" data-change="art-foto" data-i="${i}" hidden></label>
          ${foto ? `<button type="button" class="btn small danger" data-action="art-foto-del" data-i="${i}">${T("Togli foto")}</button>` : ''}
        </div>
      </div>
      <label>${T("Titolo")}<input name="titolo" value="${esc(a.titolo)}" maxlength="120"></label>
      <label>${T("Testo")}<textarea name="testo" rows="4" maxlength="1500">${esc(a.testo)}</textarea></label>
      <div class="row">
        <label>${T("Link (facoltativo)")}<input name="link" value="${esc(a.link)}" placeholder="https://… oppure #/tornei"></label>
        <label>${T("Scritta del link")}<input name="linkTesto" value="${esc(a.linkTesto)}" placeholder="${T("Scopri di più")}"></label>
      </div>
      <div class="actions tight"><button type="button" class="btn small danger" data-action="art-clear" data-i="${i}">${T("Svuota articolo")}</button><button class="btn small primary">${T("Salva articolo")}</button></div>
    </form>`;
  }

  // ---------- prenotazioni campi ----------
  // Slot di mezz'ora: verde libero, rosso occupato, giallo selezione. Si prenota per multipli di 30 minuti.

  const BANDS = { tutto: T("Tutto il giorno"), mattina: T("Mattina · 8–13"), pomeriggio: T("Pomeriggio · 13–18"), sera: T("Sera · 18–24") };
  const DAYS = ['', T("Lunedì"), T("Martedì"), T("Mercoledì"), T("Giovedì"), T("Venerdì"), T("Sabato"), T("Domenica")];
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const fromMin = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const addMin = (hm, n) => fromMin(toMin(hm) + n);
  const dow = date => { const d = new Date(date + 'T12:00').getDay(); return d === 0 ? 7 : d; };
  const durata = (from, to) => { const n = toMin(to) - toMin(from), h = Math.floor(n / 60), m = n % 60; return (h ? h + (h === 1 ? ' ora' : ' ore') : '') + (h && m ? ' e ' : '') + (m ? m + ' minuti' : ''); };
  // Orari del giorno a mezz'ore, per le select (06:00 – 24:00).
  const HALF_HOURS = Array.from({ length: 37 }, (_, i) => fromMin(360 + i * 30));

  const isPast = (date, start) => date < todayKey() || (date === todayKey() && start <= nowHM());
  const courtName = id => { const c = S().courts.find(x => x.id === id); return c ? c.nome : T("Campo eliminato"); };
  const courtHours = (c, date) => { const o = c.orari[dow(date)]; return o && o.aperto && o.apre < o.chiude ? o : null; };
  const bookableCourts = () => S().courts.filter(c => c.visibile || isAdmin());
  const bookingAt = (courtId, date, t) => S().bookings.find(b => b.courtId === courtId && b.date === date && b.from <= t && t < b.to);
  const bookingText = b => `${courtName(b.courtId)}, ${fmtDate(b.date)} ${b.from}–${b.to}`;

  function myBookings(u) {
    return S().bookings.filter(b => b.userId === u.id && !isPast(b.date, b.to))
      .sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  }

  function bookingItem(b) {
    return `<div class="list-item">
      <div>${icon('calendar-event')} <strong>${fmtDate(b.date)}</strong> · ${b.from}–${b.to}<br><span class="muted small">${esc(courtName(b.courtId))} · ${durata(b.from, b.to)}</span></div>
      <div class="actions tight"><button class="btn small" data-action="booking-open" data-id="${b.id}">${T("Modifica")}</button>
      <button class="btn small danger" data-action="booking-delete" data-id="${b.id}">${T("Cancella")}</button></div></div>`;
  }

  // Avvisi (prenotazioni modificate o cancellate) ben visibili in cima alla home e alla pagina Prenota.
  function noticesBlock() {
    const list = (S().notifiche || []);
    if (!me() || !list.length) return '';
    return `<section class="alerts">${list.map(n => `<div class="alert">
      ${icon('bell-ringing')}<div><strong>${n.to === 'admins' ? T("Avviso per gli amministratori") : T("Avviso")}</strong><p>${esc(n.text)}</p>
      <span class="muted small">${new Date(n.at).toLocaleString(I18n.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <button class="btn small" data-action="notice-dismiss" data-id="${n.id}">${T("OK, letto")}</button></div>`).join('')}</section>`;
  }

  // Selezione in corso: { courtId, date, from, to, editId, userId, blocked }. editId = prenotazione che si sta modificando.
  function selFree(courtId, date, from, to, editId) {
    const c = S().courts.find(x => x.id === courtId), h = c && courtHours(c, date);
    if (!h || from < h.apre || to > h.chiude) return false;
    for (let t = from; t < to; t = addMin(t, 30)) {
      const b = bookingAt(courtId, date, t);
      if ((b && b.id !== editId) || isPast(date, t)) return false;
    }
    return true;
  }

  function slotClick(courtId, t) {
    const d = ui.date, sel = ui.sel;
    const keep = sel && sel.editId ? { editId: sel.editId, userId: sel.userId, blocked: sel.blocked } : {};
    if (sel && sel.courtId === courtId && sel.date === d) {
      if (t >= sel.from && t < sel.to) {
        // Tocco dentro la selezione: la prenotazione finisce in quello slot (o si annulla se era l'unico).
        if (t === sel.from && addMin(t, 30) === sel.to && !sel.editId) ui.sel = null;
        else sel.to = addMin(t, 30);
        return render();
      }
      const from = t < sel.from ? t : sel.from, to = t < sel.from ? sel.to : addMin(t, 30);
      if (selFree(courtId, d, from, to, sel.editId)) { sel.from = from; sel.to = to; return render(); }
    }
    ui.sel = Object.assign({ courtId, date: d, from: t, to: addMin(t, 30), editId: null, userId: null, blocked: '' }, keep);
    render();
  }

  function summaryPanel() {
    const sel = ui.sel, u = me();
    const legend = `<div class="legend"><span><i class="sw free"></i>${T("Libero")}</span><span><i class="sw busy"></i>${T("Occupato")}</span>
      <span><i class="sw sel"></i>${T("Selezionato")}</span><span><i class="sw off"></i>${T("Chiuso / non prenotabile")}</span></div>`;
    if (!sel) {
      return `<h3>${T("{0} La tua prenotazione", [icon('calendar-plus')])}</h3>
        <p class="muted small">${u ? 'Tocca uno slot <strong>' + T("verde") + '</strong> per iniziare, poi gli slot successivi dello stesso campo per allungare la prenotazione (a mezz’ore).' : 'Per prenotare devi <a href="#/profilo">' + T("accedere o registrarti") + '</a>.'}</p>${legend}`;
    }
    const orig = sel.editId && S().bookings.find(b => b.id === sel.editId);
    const changed = orig && (orig.courtId !== sel.courtId || orig.date !== sel.date || orig.from !== sel.from || orig.to !== sel.to || (orig.userId || '') !== (sel.userId || '') || (orig.blocked || '') !== (sel.blocked || ''));
    const canLonger = selFree(sel.courtId, sel.date, sel.from, addMin(sel.to, 30), sel.editId);
    const adminFields = isAdmin() ? `
      <label>${T("Prenotazione per")}<select name="user" data-change="sel-user"><option value="">${orig ? '—' : T("Me stesso")}</option>${playerOptions(null, sel.userId || (orig ? '' : u.id))}</select></label>
      <label>${T("Oppure blocca con motivo")}<input name="blocked" value="${esc(sel.blocked || '')}" data-change="sel-blocked" placeholder="${T("Es. manutenzione, lezione")}"></label>` : '';
    return `<h3>${icon(orig ? 'pencil' : 'calendar-plus')} ${orig ? T("Modifica prenotazione") : T("Riepilogo della prenotazione")}</h3><div class="summary-body"><div>
      ${orig ? `<p class="muted small">${T("Prenotazione di")} <strong>${esc(orig.blocked ? 'blocco: ' + orig.blocked : userName(orig.userId))}</strong>: ${T("{0}.\n        Tocca gli slot per spostarla o cambiarne la durata.", [esc(bookingText(orig))])}</p>` : ''}
      <dl class="summary">
        <dt>${T("Campo")}</dt><dd>${esc(courtName(sel.courtId))}</dd>
        <dt>${T("Giorno")}</dt><dd>${fmtDate(sel.date, true)}</dd>
        <dt>${T("Orario")}</dt><dd><strong>${sel.from} – ${sel.to}</strong></dd>
        <dt>${T("Durata")}</dt><dd>${durata(sel.from, sel.to)}</dd>
      </dl>
      <div class="actions tight">
        <button class="btn small" data-action="sel-shorter" ${toMin(sel.to) - toMin(sel.from) <= 30 ? 'disabled' : ''}>${T("− 30 min")}</button>
        <button class="btn small" data-action="sel-longer" ${canLonger ? '' : 'disabled'}>${T("+ 30 min")}</button>
      </div></div><div>
      ${adminFields}
      <div class="actions">
        ${orig ? `<button class="btn primary" data-action="booking-confirm" ${changed ? '' : 'disabled'}>${T("{0} Salva modifiche", [icon('check')])}</button>
          <button class="btn danger" data-action="booking-delete" data-id="${orig.id}">${T("{0} Cancella", [icon('trash')])}</button>`
        : `<button class="btn primary big wide" data-action="booking-confirm">${T("{0} Conferma prenotazione", [icon('check')])}</button>`}
        <button class="btn" data-action="sel-clear">${orig ? T("Chiudi") : T("Annulla")}</button>
      </div></div></div>${legend}`;
  }

  function viewBook() {
    const s = S(), d = ui.date, u = me();
    const max = addDays(todayKey(), Number(s.settings.giorniAnticipo) || 7);
    const courts = bookableCourts();
    const open = courts.map(c => ({ c, h: courtHours(c, d) }));
    const opened = open.filter(x => x.h && x.c.visibile);
    const starts = open.filter(x => x.h).map(x => x.h.apre), ends = open.filter(x => x.h).map(x => x.h.chiude);
    const rows = [];
    if (starts.length) for (let t = starts.sort()[0]; t < ends.sort().slice(-1)[0]; t = addMin(t, 30)) rows.push(t);
    // Oggi si mostrano solo gli orari non ancora passati.
    const allRows = rows.length;
    if (d === todayKey()) rows.splice(0, rows.length, ...rows.filter(t => !isPast(d, t)));
    // Fasce orarie (mattina, pomeriggio, sera) quando gli orari sono molti.
    const inBand = (t, k) => (k === 'mattina' ? t < '13:00' : k === 'pomeriggio' ? t >= '13:00' && t < '18:00' : k === 'sera' ? t >= '18:00' : true);
    const showBands = rows.length > 12;
    let band = showBands ? ui.fascia || 'tutto' : 'tutto';
    if (!rows.some(t => inBand(t, band))) band = 'tutto';
    const bandsBar = showBands ? `<div class="bands" role="group" aria-label="${T("Fascia oraria")}">${Object.entries(BANDS).map(([k, l]) =>
      `<button class="${k === band ? 'on' : ''}" data-action="band" data-band="${k}" ${rows.some(t => inBand(t, k)) ? '' : 'disabled'}>${l}</button>`).join('')}</div>` : '';
    rows.splice(0, rows.length, ...rows.filter(t => inBand(t, band)));
    const sel = ui.sel && ui.sel.date === d ? ui.sel : null;
    const freeHours = c => { const h = courtHours(c, d); if (!h || !c.visibile) return 0; let n = 0; for (let t = h.apre; t < h.chiude; t = addMin(t, 30)) if (!bookingAt(c.id, d, t) && !isPast(d, t)) n++; return n / 2; };
    // Un riquadro per campo, con gli orari in orizzontale (mezz'ore da sinistra a destra).
    const courtBox = c => {
      const h = courtHours(c, d);
      const head = `<div class="court-head"><h3>${esc(c.nome)}${!c.visibile ? ' <span class="badge">' + T("nascosto") + '</span>' : ''}</h3>
        <span class="muted small">${h ? `${T("aperto {0}–{1} ·", [h.apre, h.chiude])} <strong>${T("{0} h libere", [freeHours(c)])}</strong>` : T("chiuso in questa giornata")}</span>
        </div>`;
      if (!h || !rows.some(t => t >= h.apre && t < h.chiude)) return `<section class="card court-box closed">${head}${h ? `<p class="muted small">${band !== 'tutto' ? T("Nessun orario di questo campo in questa fascia.") : T("Per oggi gli orari di questo campo sono terminati.")}</p>` : ''}</section>`;
      // Stessa scala oraria per tutti i campi (slot della stessa larghezza, orari allineati in colonna).
      const slots = rows;
      // Riga degli orari: ogni ora intera occupa due mezz'ore.
      const labels = slots.map((t, k) => (t.endsWith(':00') || k === 0 ? `<span class="tl" style="grid-column:${k + 1} / span ${t.endsWith(':00') && k + 1 < slots.length ? 2 : 1}">${t}</span>` : '')).join('');
      const cells = [];
      for (let k = 0; k < slots.length; k++) {
        const t = slots[k], b = bookingAt(c.id, d, t);
        const inSel = sel && sel.courtId === c.id && t >= sel.from && t < sel.to;
        if (b && !(sel && sel.editId === b.id)) {
          // Prenotazione: un unico blocco rosso che copre tutti i suoi slot.
          let n = 0;
          while (k + n < slots.length && slots[k + n] < b.to) n++;
          const mine = u && b.userId === u.id, canOpen = (mine || isAdmin()) && !isPast(d, b.to);
          const label = b.blocked ? `${icon('lock')} ${esc(b.blocked)}` : mine ? T("Tua") : isAdmin() ? esc(userName(b.userId)) : T("Occupato");
          // Nelle prenotazioni brevi c'è spazio solo per l'orario (il rosso indica già che è occupato).
          const inner = n <= 2 && !mine ? `<small>${b.from}–${b.to}</small>` : `<span>${label}</span><small>${b.from}–${b.to}</small>`;
          cells.push(`<div class="slot busy ${mine ? 'mine' : ''} ${b.blocked ? 'blocked' : ''}" style="grid-column:${k + 1} / span ${n}" title="${b.blocked ? esc(b.blocked) : isAdmin() ? esc(userName(b.userId)) : T("Occupato")} ${b.from}–${b.to}">${canOpen ? `<button data-action="booking-open" data-id="${b.id}">${inner}</button>` : `<div>${inner}</div>`}</div>`);
          k += n - 1;
          continue;
        }
        const pos = `style="grid-column:${k + 1}"`;
        if (t < h.apre || t >= h.chiude) { cells.push(`<div class="slot off" ${pos} title="${T("{0} – campo chiuso", [t])}"></div>`); continue; }
        if (inSel) cells.push(`<div class="slot sel" ${pos}><button data-action="slot" data-court="${c.id}" data-t="${t}" title="${t}" aria-label="${esc(c.nome)} ${t} selezionato">${t === sel.from ? icon('check') : ''}</button></div>`);
        else if (isPast(d, t)) cells.push(`<div class="slot off past" ${pos} title="${T("{0} – orario già passato", [t])}"></div>`);
        else if (d > max || !c.visibile) cells.push(`<div class="slot off" ${pos} title="${T("{0} – non prenotabile", [t])}"></div>`);
        else cells.push(`<div class="slot free" ${pos}><button data-action="slot" data-court="${c.id}" data-t="${t}" title="${t} – ${addMin(t, 30)}" aria-label="${esc(c.nome)} ${t} libero"></button></div>`);
      }
      return `<section class="card court-box">${head}
        <div class="strip-wrap"><div class="strip" style="--n:${slots.length}">
          <div class="strip-labels">${labels}</div><div class="strip-slots">${cells.join('')}</div>
        </div></div></section>`;
    };
    return `
      ${noticesBlock()}
      <h1>${T("Prenota un campo")}</h1>
      <p class="muted">${courts.filter(c => c.visibile).length} ${T("campi ·")} <strong>${opened.length} aperti</strong> ${T("in questa giornata · slot da 30 minuti ·\n        massimo {0}", [s.settings.maxOre])} ${Number(s.settings.maxOre) === 1 ? 'ora' : 'ore'} ${T("per prenotazione · prenotabili fino a {0} giorni prima.", [s.settings.giorniAnticipo])}</p>
      <div class="date-nav">
        <button class="btn icon" data-action="day" data-delta="-1" aria-label="${T("Giorno precedente")}" ${d <= todayKey() ? 'disabled' : ''}>${icon('chevron-left')}</button>
        <span class="date-field"><span class="date-pick"><button type="button" class="btn date-btn" data-action="pick-date" aria-label="${T("Scegli la data")}">${icon('calendar')} ${itDate(d)}</button>
          <input type="date" class="date-native" value="${d}" min="${todayKey()}" max="${max}" data-change="book-date" tabindex="-1" aria-hidden="true"></span></span>
        <button class="btn icon" data-action="day" data-delta="1" aria-label="${T("Giorno successivo")}" ${d >= max ? 'disabled' : ''}>${icon('chevron-right')}</button>
        <strong class="date-label">${fmtDate(d, true)}</strong>
      </div>
      ${bandsBar}
      <div class="book-layout">
        <div class="book-grid">
        ${!courts.length ? empty(T("Nessun campo disponibile. L’amministratore può crearli da Amministrazione → Campi."), 'layout-grid')
        : !rows.length ? empty(allRows ? T("Per oggi gli orari dei campi sono terminati: scegli un altro giorno con la freccia qui sopra.") : T("In questa giornata i campi sono chiusi."), 'door-off')
        : courts.map(courtBox).join('')}
        </div>
        <aside class="card book-summary ${ui.sel ? 'active' : 'idle'}">${ui.sel && ui.sel.date !== d ? `<p class="muted small">${T("La selezione è su un altro giorno ({0}).", [fmtDate(ui.sel.date)])}</p>` : ''}${summaryPanel()}</aside>
      </div>
      ${u ? `<section>${sectionHead(T("Le tue prossime prenotazioni"))}${(() => { const m = myBookings(u); return m.length ? `<div class="list">${m.map(bookingItem).join('')}</div>` : empty(T("Nessuna prenotazione in programma."), 'calendar'); })()}</section>` : ''}`;
  }

  // ---------- prenotazioni: vista dell'amministratore ----------
  // Calendario mensile (giorni con prenotazioni cerchiati di rosso), elenco del giorno ed elenco completo.

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const monthOf = d => d.slice(0, 7);
  const monthDays = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
  const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1 + n, 1); return d.toLocaleDateString('sv').slice(0, 7); };
  const sortBookings = list => list.slice().sort((a, b) => (a.date + a.from + courtName(a.courtId)).localeCompare(b.date + b.from + courtName(b.courtId)));

  // Solo le prossime prenotazioni (da oggi in poi, escluse quelle già finite).
  const upcoming = () => S().bookings.filter(b => b.date >= todayKey() && !isPast(b.date, b.to));
  const admMonthList = m => upcoming().filter(b => monthOf(b.date) === m);

  function admBookingRow(b) {
    const u = b.userId && S().users.find(x => x.id === b.userId);
    return `<div class="list-item adm-booking ${b.blocked ? 'blocked' : ''}">
      <div><strong>${b.from}–${b.to}</strong> · ${esc(courtName(b.courtId))} <span class="muted small">(${durata(b.from, b.to)})</span><br>
        ${b.blocked ? `<span class="small">${T("{0} Bloccato: {1}", [icon('lock'), esc(b.blocked)])}</span>`
        : `<span class="small">${icon('user')} ${esc(userName(b.userId))}${u && u.tel ? ` · <a href="tel:${esc(u.tel)}">${esc(u.tel)}</a>` : ''}${u && u.email ? ` · <span class="muted">${esc(u.email)}</span>` : ''}</span>`}</div>
      <div class="actions tight"><button class="btn small" data-action="booking-open" data-id="${b.id}">${T("Modifica")}</button>
        <button class="btn small danger" data-action="booking-delete" data-id="${b.id}">${T("Cancella")}</button></div>
    </div>`;
  }

  function admDayGroups(list) {
    const days = [...new Set(list.map(b => b.date))].sort();
    return days.map(d => {
      const items = sortBookings(list.filter(b => b.date === d));
      const n = items.filter(b => !b.blocked).length;
      return `<section class="adm-day"><h3>${fmtDate(d, true)} <span class="badge ${n ? 'live' : ''}">${n} ${n === 1 ? 'prenotazione' : 'prenotazioni'}</span></h3>
        <div class="list">${items.map(admBookingRow).join('')}</div></section>`;
    }).join('');
  }

  function viewAdminBookings() {
    if (!isAdmin()) return empty(T("Area riservata agli amministratori."), 'lock');
    const cur = monthOf(todayKey());
    if (!ui.admMonth || ui.admMonth < cur) ui.admMonth = cur;
    const m = ui.admMonth;
    const list = admMonthList(m);
    const count = d => list.filter(b => b.date === d && !b.blocked).length;
    const blocks = d => list.some(b => b.date === d && b.blocked);
    const [y, mo] = m.split('-').map(Number);
    const firstDow = dow(m + '-01'), n = monthDays(m);
    const day = ui.admDay && monthOf(ui.admDay) === m && ui.admDay >= todayKey() ? ui.admDay : null;
    const cells = [];
    for (let i = 1; i < firstDow; i++) cells.push('<span class="cal-day empty"></span>');
    for (let dd = 1; dd <= n; dd++) {
      const d = `${m}-${String(dd).padStart(2, '0')}`, c = count(d);
      if (d < todayKey()) { cells.push(`<span class="cal-day past"><span class="num">${dd}</span></span>`); continue; }
      cells.push(`<button class="cal-day ${c ? 'has' : ''} ${blocks(d) ? 'blk' : ''} ${d === todayKey() ? 'today' : ''} ${d === day ? 'sel' : ''}" data-action="adm-day" data-date="${d}"
        aria-label="${T("{0}: {1} prenotazioni", [fmtDate(d, true), c])}"><span class="num">${dd}</span>${c ? `<small>${c}</small>` : ''}</button>`);
    }
    const total = list.filter(b => !b.blocked).length;
    let detail = '';
    if (ui.admAll) {
      const all = upcoming();
      detail = `<section class="card">${sectionHead(`${T("{0} Tutte le prossime prenotazioni", [icon('list')])}`,
        `<button class="btn small" data-action="adm-all-close">${T("{0} Torna al calendario", [icon('calendar')])}</button>`)}
        ${all.length ? admDayGroups(all) : empty(T("Nessuna prenotazione in programma."), 'calendar')}</section>`;
    } else if (day) {
      const items = list.filter(b => b.date === day);
      detail = `<section class="card">${sectionHead(`${icon('calendar-event')} ${fmtDate(day, true)}`)}
        ${items.length ? `<div class="list">${sortBookings(items).map(admBookingRow).join('')}</div>` : empty(T("Nessuna prenotazione in questo giorno."), 'calendar')}</section>`;
    }
    return `
      <p><a href="#/admin">${T("{0} Amministrazione", [icon('arrow-left')])}</a></p>
      ${sectionHead('<span class="h1">' + T("Prenotazioni") + '</span>', `<button class="btn primary" data-action="adm-all">${T("{0} Visualizza tutte le prenotazioni", [icon('list')])}</button>`)}
      <section class="card adm-cal">
        <div class="cal-head">
          <button class="btn icon" data-action="adm-month" data-delta="-1" aria-label="${T("Mese precedente")}" ${m <= monthOf(todayKey()) ? 'disabled' : ''}>${icon('chevron-left')}</button>
          <h2>${MESI[mo - 1]} ${y}</h2>
          <button class="btn icon" data-action="adm-month" data-delta="1" aria-label="${T("Mese successivo")}">${icon('chevron-right')}</button>
          <button class="btn small" data-action="adm-today">${T("Oggi")}</button>
          <span class="muted small cal-total">${total} ${total === 1 ? T("prossima prenotazione") : T("prossime prenotazioni")} ${T("nel mese")}</span>
        </div>
        <div class="cal-grid">${[T("Lun"), T("Mar"), T("Mer"), T("Gio"), T("Ven"), T("Sab"), T("Dom")].map(x => `<span class="cal-dow">${x}</span>`).join('')}${cells.join('')}</div>
        <div class="legend"><span><i class="sw ring"></i>${T("Giorno con prenotazioni (il numero indica quante)")}</span><span><i class="sw off"></i>${T("Solo blocchi (manutenzione, lezioni…)")}</span></div>
      </section>
      ${detail || '<p class="muted small">' + T("Tocca un giorno del calendario per vederne le prenotazioni. Sono mostrate solo le prossime prenotazioni.") + '</p>'}`;
  }

  // Conferma (nuova prenotazione o modifica) con tutti i controlli; avvisi a titolare e amministratori.
  function confirmBooking() {
    const s = S(), u = me(), sel = ui.sel;
    if (!sel) return;
    if (!u) return goProfileForLogin(T("Accedi o registrati per prenotare."));
    if (needVerified()) return;
    const c = s.courts.find(x => x.id === sel.courtId);
    if (!c || (!c.visibile && !isAdmin())) return toast(T("Questo campo non è prenotabile."), 'err');
    if (!selFree(sel.courtId, sel.date, sel.from, sel.to, sel.editId)) return toast(T("Alcuni slot non sono più liberi o il campo è chiuso: scegli un altro orario."), 'err');
    const orig = sel.editId && s.bookings.find(b => b.id === sel.editId);
    const owner = isAdmin() ? (sel.blocked ? null : sel.userId || (orig ? orig.userId : u.id)) : u.id;
    if (!isAdmin()) {
      if (toMin(sel.to) - toMin(sel.from) > Number(s.settings.maxOre) * 60) return toast(`${T("Si può prenotare al massimo per {0}", [s.settings.maxOre])} ${Number(s.settings.maxOre) === 1 ? 'ora' : 'ore'}.`, 'err');
      const same = s.bookings.filter(b => b.userId === u.id && b.date === sel.date && b.id !== sel.editId).length;
      if (same >= Number(s.settings.maxGiorno)) return toast(`${T("Hai già {0} prenotazioni in questo giorno (massimo {1}).", [same, s.settings.maxGiorno])}`, 'err');
    }
    const data = { courtId: sel.courtId, date: sel.date, from: sel.from, to: sel.to, userId: owner, blocked: isAdmin() ? (sel.blocked || '').trim() : '' };
    if (orig) {
      const before = bookingText(orig);
      if (!confirm(`Salvare le modifiche?\nPrima: ${before}\nOra: ${bookingText(data)}`)) return;
      Object.assign(orig, data);
      notifyBooking(orig, `${T("modificata: prima {0}, ora {1}", [before, bookingText(orig)])}`);
      toast(T("Prenotazione modificata."), 'ok');
    } else {
      s.bookings.push(Object.assign({ id: Store.uid('g') }, data));
      toast(data.blocked ? T("Slot bloccati.") : `${T("Prenotato {0}.", [bookingText(data)])}`, 'ok');
    }
    ui.sel = null;
    save();
  }

  function deleteBooking(id) {
    const s = S(), b = s.bookings.find(x => x.id === id);
    if (!b) return;
    if (!confirm(`${T("Cancellare")} ${b.blocked ? T("il blocco") : T("la prenotazione")} ${bookingText(b)}?`)) return;
    s.bookings = s.bookings.filter(x => x.id !== id);
    notifyBooking(b, `${T("cancellata ({0})", [bookingText(b)])}`);
    if (ui.sel && ui.sel.editId === id) ui.sel = null;
    save();
    toast(T("Prenotazione cancellata."));
  }

  // Chi cambia una prenotazione altrui avvisa il titolare; l'utente che cambia la propria avvisa gli amministratori.
  function notifyBooking(b, what) {
    const u = me();
    if (!b.userId || b.blocked) return;
    if (b.userId !== u.id) window.Cloud.notify(b.userId, `${T("La tua prenotazione è stata {0} dall’amministratore {1} {2}.", [what, u.nome, u.cognome])}`);
    else if (!isAdmin()) window.Cloud.notify('admins', `${u.nome} ${u.cognome} ha ${what.startsWith('modificata') ? 'modificato' : 'cancellato'} ${T("una prenotazione: {0}", [what.replace(/^(modificata|cancellata):? ?/, '')])}`);
  }

  // Scheda di un campo in Amministrazione: nome, visibilità e orari per ogni giorno.
  function courtForm(c) {
    const opt = v => HALF_HOURS.map(h => `<option ${h === v ? 'selected' : ''}>${h}</option>`).join('');
    return `<form data-form="court" class="court-form"><input type="hidden" name="id" value="${c.id}">
      <div class="row"><label>${T("Nome del campo")}<input name="nome" value="${esc(c.nome)}" required></label>
        <label class="check"><input type="checkbox" name="visibile" ${c.visibile ? 'checked' : ''}> ${T("Visibile e prenotabile")}</label></div>
      <table class="hours"><thead><tr><th>${T("Giorno")}</th><th>${T("Aperto")}</th><th>${T("Dalle")}</th><th>${T("Alle")}</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6, 7].map(dd => { const o = c.orari[dd]; return `<tr><td>${DAYS[dd]}</td>
        <td><input type="checkbox" name="aperto${dd}" ${o.aperto ? 'checked' : ''} aria-label="${DAYS[dd]} aperto"></td>
        <td><select name="apre${dd}" aria-label="${DAYS[dd]} apre">${opt(o.apre)}</select></td>
        <td><select name="chiude${dd}" aria-label="${DAYS[dd]} chiude">${opt(o.chiude)}</select></td></tr>`; }).join('')}
      </tbody></table>
      <div class="actions tight">
        <button type="button" class="btn small" data-action="court-copy">${T("Copia gli orari del lunedì su tutti i giorni")}</button>
        <button type="button" class="btn small danger" data-action="court-delete" data-id="${c.id}">${T("{0} Elimina campo", [icon('trash')])}</button>
        <button class="btn small primary">${T("Salva campo")}</button>
      </div></form>`;
  }

  // ---------- tornei ----------

  function viewTournaments() {
    curTour = null;
    const list = S().tournaments.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const open = list.filter(t => !t.closed), done = list.filter(t => t.closed).reverse();
    return `
      ${sectionHead('<span class="h1">' + T("Tornei") + '</span>', canTours() ? `<button class="btn primary" data-action="tour-new">${T("{0} Nuovo torneo", [icon('plus')])}</button>` : '')}
      <section>${sectionHead(T("In corso e in programma"))}
        ${open.length ? `<div class="grid">${open.map(tourCard).join('')}</div>` : empty(T("Nessun torneo in programma."), 'trophy')}</section>
      <section>${sectionHead(T("Conclusi"))}
        ${done.length ? `<div class="grid">${done.map(tourCard).join('')}</div>` : empty(T("Ancora nessun torneo concluso."), 'archive')}</section>`;
  }

  function scoreText(m) {
    if (!m.stats) return '';
    if (m.res.pa != null) return `${m.res.pa}-${m.res.pb}`;
    if (m.res.forfeit) return 'rit.';
    return m.res.sets.map(([a, b]) => `${a}-${b}`).join(' · ');
  }

  // Riga partita. names: [htmlA, htmlB]
  function matchRow(t, m, names, label) {
    const w = m.stats ? m.stats.winner : null;
    const canEdit = canTours() && !t.closed && names.ok;
    const tag = canEdit ? 'button' : 'div';
    return `<${tag} class="match ${m.stats ? 'played' : ''} ${canEdit ? 'editable' : ''}" ${canEdit ? `data-action="result" data-key="${m.key}"` : ''}>
      ${label ? `<span class="match-label">${label}</span>` : ''}
      <span class="side ${w === 'a' ? 'win' : ''}">${names[0]}</span>
      <span class="score">${m.stats ? esc(scoreText(m)) : canEdit ? icon('pencil') : 'vs'}</span>
      <span class="side right ${w === 'b' ? 'win' : ''}">${names[1]}</span>
    </${tag}>`;
  }

  function teamNames(t, m, fallback) {
    const one = (id, side) => {
      if (id == null) return `<em class="muted">${fallback ? esc(fallback[side]) : T("da definire")}</em>`;
      return entryLabel(t, id);
    };
    const names = [one(m.a, 0), one(m.b, 1)];
    names.ok = Logic.real(m.a) && Logic.real(m.b);
    return names;
  }

  function stdMatch(t, m, label) {
    if (m.bye) return `<div class="match bye"><span class="side">${entryLabel(t, m.winner)}</span><span class="score">${T("bye")}</span><span class="side right muted">${T("passa il turno")}</span></div>`;
    const fb = m.from ? [`${m.from[0]} ${labelOf(t, m.from[1])}`, `${m.from[0]} ${labelOf(t, m.from[2])}`] : null;
    return matchRow(t, m, teamNames(t, m, fb), label);
  }

  function labelOf(t, key) {
    const pm = /^P(\d+)-/.exec(key);
    if (!pm) return key;
    const m = Logic.poolMatches(t, +pm[1]).find(x => x.key === key);
    return m && m.label ? m.label : key;
  }

  function standingsTable(t, rows, qualify, individual, qset) {
    return `<div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${individual ? T("Giocatore") : T("Squadra")}</th><th title="${T("Partite")}">G</th><th title="${T("Vittorie")}">V</th><th title="${T("Sconfitte")}">P</th>${individual ? '' : '<th title="Set vinti-persi">' + T("Set") + '</th>'}<th title="${T("Punti fatti-subiti")}">${T("Punti")}</th><th title="${T("Differenza punti")}">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < qualify || (qset && qset.has(r.id)) ? 'q' : ''}">
        <td>${i + 1}</td><td class="name">${individual ? pname(t, r.id) : entryLabel(t, r.id)}</td>
        <td>${r.played}</td><td><strong>${r.w}</strong></td><td>${r.l}</td>${individual ? '' : `<td>${r.sw}-${r.sl}</td>`}<td>${r.pw}-${r.pl}</td><td>${r.pw - r.pl > 0 ? '+' : ''}${r.pw - r.pl}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // Classifica dell'americana: punti e set, ordinabile per punti fatti o set vinti.
  function americanaTable(t) {
    const crit = Logic.americanaCrit(t), sortBy = (ui.amSort || {})[t.id] || crit;
    const rows = Logic.americanaStandings(t, sortBy);
    const name = { punti: T("punti fatti"), set: T("set vinti") };
    const btn = k => `<button class="${k === sortBy ? 'on' : ''}" data-action="am-sort" data-id="${t.id}" data-sort="${k}">${Logic.AMERICANA_CRITERI[k]}</button>`;
    return `<div class="bands" role="group" aria-label="${T("Ordina la classifica")}"><span class="muted small">${T("Ordina per:")}</span> ${btn('punti')}${btn('set')}</div>
      <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${T("Giocatore")}</th><th title="${T("Partite giocate")}">G</th><th title="${T("Partite vinte")}">V</th><th title="${T("Partite perse")}">P</th><th title="${T("Set vinti")}" class="${sortBy === 'set' ? 'sorted' : ''}">${T("Set V")}</th><th title="${T("Set persi")}">${T("Set P")}</th>
        <th title="${T("Punti fatti")}" class="${sortBy === 'punti' ? 'sorted' : ''}">${T("Punti F")}</th><th title="${T("Punti subiti")}">${T("Punti S")}</th><th title="${T("Differenza punti")}">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="name">${pname(t, r.id)}</td><td>${r.played}</td><td>${r.w}</td><td>${r.l}</td>
        <td>${sortBy === 'set' ? `<strong>${r.sw}</strong>` : r.sw}</td><td>${r.sl}</td><td>${sortBy === 'punti' ? `<strong>${r.pw}</strong>` : r.pw}</td><td>${r.pl}</td>
        <td>${r.pw - r.pl > 0 ? '+' : ''}${r.pw - r.pl}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">${T("Ordinata per {0}", [name[sortBy]])}${sortBy === 'set' ? T(" (poi differenza set e punti fatti)") : T(" (poi set vinti e differenza punti)")}.
        <strong>${T("Il vincitore finale si decide per {0}", [name[crit]])}</strong>${canTours() ? T(" — si cambia nella Scheda del torneo") : ''}.</p>`;
  }

  function tabsFor(t) {
    const tabs = [['iscritti', `${T("Iscritti ({0})", [t.entries.length])}`]];
    if (t.pools) tabs.push(['gironi', t.formato === 'girone_unico' ? T("Girone") : T("Gironi")]);
    if (Logic.hasBracket(t.formato) && (t.bracket || t.pools)) tabs.push(['tabellone', T("Tabellone")]);
    if (t.americana) tabs.push(['turni', T("Turni")], ['live', T("Classifica live")]);
    if (t.fantasma) tabs.push(['fgironi', T("Gironi")], ['fko', T("Fase finale")]);
    if (t.tempo) tabs.push(['tgare', t.tempo.mode === 'rotazione' ? T("Turni") : T("Gare")], ['tclass', T("Classifica")]);
    if (t.seeds) tabs.push(['finale', T("Classifica finale")]);
    if (canTours()) tabs.push(['scheda', T("Scheda")]);
    return tabs;
  }

  function viewTournament(id) {
    const t = S().tournaments.find(x => x.id === id);
    curTour = t || null;
    if (!t) return empty(T("Torneo non trovato."), 'alert-circle');
    const u = me();
    const tabs = tabsFor(t);
    let tab = ui.tab[t.id];
    // senza sorteggio si parte dagli iscritti, poi dalla prima vista del torneo (mai dalla Scheda)
    if (!tabs.some(x => x[0] === tab)) tab = !t.seeds || tabs.length < 2 || tabs[1][0] === 'scheda' ? tabs[0][0] : tabs[1][0];
    const myEntry = u && t.entries.find(e => e.p1 === u.id || e.p2 === u.id);
    const full = t.maxIscritti && t.entries.length >= t.maxIscritti;
    const c = t.config;
    const scoring = Logic.isRotazione(t) ? `${T("gare da {0} min · {1} turni · {2} campi · compagno diverso a ogni turno", [c.minuti, c.turni, c.campi])}`
      : t.formato === 'americana_tempo' ? `${T("gare da {0} min · max {1} partite a squadra", [c.minuti, c.maxPartite])}`
      : `${c.sets == 3 ? T("2 set su 3") : T("1 set")} ai ${c.punti}${c.sets == 3 && c.puntiDecisivo != c.punti ? ` ${T("(terzo ai {0})", [c.puntiDecisivo])}` : ''}`;

    let body = '';
    if (tab === 'iscritti') body = tabEntries(t);
    else if (tab === 'gironi') body = tabPools(t);
    else if (tab === 'tabellone') body = tabBracket(t);
    else if (tab === 'turni') body = tabRounds(t);
    else if (tab === 'live') body = americanaTable(t);
    else if (tab === 'finale') body = tabFinal(t);
    else if (tab === 'fgironi') body = tabFantasmaPools(t);
    else if (tab === 'fko') body = tabFantasmaKo(t);
    else if (tab === 'tgare') body = tabTempoRounds(t);
    else if (tab === 'tclass') body = tabTempoStandings(t);
    else if (tab === 'scheda') body = tabScheda(t);

    return `
      <p><a href="#/tornei">${T("{0} Tornei", [icon('arrow-left')])}</a></p>
      <header class="tour-head">
        <div>
          <h1>${esc(t.nome)}</h1>
          <p class="muted">${icon('calendar')} ${fmtDate(t.data, true)}${t.luogo ? ' · ' + icon('map-pin') + ' ' + esc(t.luogo) : ''}</p>
          <p class="chips">${statusBadge(t)}${t.lega && legaById(t.lega) ? `<a class="chip chip-lega" href="#/leghe/${t.lega}">${legaLogo(legaById(t.lega), 20) || icon('shield')} ${esc(legaById(t.lega).nome)}</a>` : ''}${t.livelli && t.livelli.length ? `<span class="chip">${T("{0} Livelli: {1}", [icon('stairs'), esc(levelsText(t.livelli))])}</span>` : ''}<span class="chip">${esc(Logic.FORMATS[t.formato])}</span><span class="chip">${DISCIPLINE[t.disciplina]} ${GENERI[t.genere] || ''}</span>
            <span class="chip">${scoring}</span><span class="chip">${icon('list-numbers')} ${esc(pointsLabel(t))}${Logic.givesPoints(S(), t) && Number(t.coefficiente) !== 1 ? ' ×' + t.coefficiente : ''}</span></p>
          ${t.descrizione ? `<p>${esc(t.descrizione)}</p>` : ''}
        </div>
      </header>
      ${t.iscrizioniAperte && !t.seeds ? `<div class="notice ok">${icon('clipboard-check')} <span>${T("Iscrizioni aperte")}${t.maxIscritti ? ` · ${t.entries.length}/${t.maxIscritti}` : ''}.</span>
        ${myEntry ? `<strong>${T("Sei iscritto.")}</strong> <button class="btn small" data-action="tour-leave" data-id="${t.id}">${T("Ritira iscrizione")}</button>`
        : u ? `<button class="btn primary small" data-action="tour-join" data-id="${t.id}" ${full ? 'disabled' : ''}>${full ? T("Completo") : T("Iscriviti")}</button>`
        : '<a class="btn small" href="#/profilo">' + T("Accedi per iscriverti") + '</a>'}</div>` : ''}
      ${canTours() ? adminTourBar(t) : ''}
      ${pdfSections(t).length ? `<p class="pdf-row"><button type="button" class="btn small" data-action="tour-pdf" data-id="${t.id}">${T("{0} Scarica calendario (PDF)", [icon('file-download')])}</button></p>` : ''}
      ${timerBlock(t)}
      <nav class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''} ${k === 'scheda' ? 'tab-admin' : ''}" data-action="tour-tab" data-id="${t.id}" data-tab="${k}">${k === 'scheda' ? icon('adjustments') + ' ' : ''}${l}</button>`).join('')}</nav>
      <div class="tab-body">${body}</div>`;
  }

  // ---------- calendario delle gare in PDF ----------
  // Turni / gironi con campo, coppie, chi riposa e lo spazio per i punti (o il risultato, se già inserito).
  const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };

  function pdfSections(t) {
    const out = [];
    const row = (label, a, b, m) => [label, plain(a), plain(b), m.bye ? T("passa il turno") : m.stats ? scoreText(m) : ''];
    if (t.tempo) {
      const ms = Logic.tempoMatches(t), rot = t.tempo.mode === 'rotazione';
      t.tempo.rounds.forEach((rd, r) => out.push({
        title: `${T("Turno {0}", [r + 1])}`,
        rows: ms.filter(m => m.round === r).map((m, i) => row(`${T("Campo {0}", [i + 1])}`, sideName(t, m.a), sideName(t, m.b), m)),
        rest: rd.rest.map(id => plain(rot ? pname(t, id) : teamName(t, id)))
      }));
    } else if (t.americana) {
      const ms = Logic.americanaMatches(t);
      t.americana.rounds.forEach((rd, r) => out.push({
        title: `${T("Turno {0}", [r + 1])}`,
        rows: ms.filter(m => m.round === r).map((m, i) => row(`${T("Campo {0}", [i + 1])}`, sideName(t, m.a), sideName(t, m.b), m)),
        rest: rd.rest.map(id => plain(pname(t, id)))
      }));
    } else if (t.fantasma) {
      t.fantasma.pools.forEach((p, pi) => {
        const ms = Logic.fantasmaPoolMatches(t, pi);
        p.rounds.forEach((rd, r) => out.push({
          title: `${T("Girone {0} · Turno {1}", [p.name, r + 1])}`,
          rows: ms.filter(m => m.round === r).map((m, i) => row(`${T("Gara {0}", [i + 1])}`, sideName(t, m.a), sideName(t, m.b), m)),
          rest: rd.rest.map(id => plain(pname(t, id)))
        }));
      });
    } else if (t.pools) {
      t.pools.forEach((p, pi) => {
        const ms = Logic.poolMatches(t, pi), single = t.formato === 'girone_unico';
        [...new Set(ms.map(m => m.round))].forEach(r => {
          const list = ms.filter(m => m.round === r);
          const rest = p.type === 'rr' && p.teamIds.length % 2 ? p.teamIds.filter(id => !list.some(m => m.a === id || m.b === id)) : [];
          out.push({
            title: `${single ? T("Girone unico") : T("Girone ") + p.name} · ${T("Turno {0}", [r])}`,
            rows: list.map((m, i) => { const n = teamNames(t, m, m.from ? [`${m.from[0]} ${labelOf(t, m.from[1])}`, `${m.from[0]} ${labelOf(t, m.from[2])}`] : null); return row(m.label || `${T("Gara {0}", [i + 1])}`, n[0], n[1], m); }),
            rest: rest.map(id => plain(entryLabel(t, id)))
          });
        });
      });
    }
    return out.filter(x => x.rows.length);
  }

  // Le librerie per il PDF si caricano solo quando servono.
  function loadScript(src) {
    return new Promise((ok, ko) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = ko; document.head.appendChild(el); });
  }
  async function pdfLibs() {
    if (!window.jspdf) await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    if (!window.jspdf.jsPDF.API.autoTable) await loadScript('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js');
    return window.jspdf.jsPDF;
  }

  async function tourPdf(t) {
    let JsPDF;
    try { JsPDF = await pdfLibs(); } catch (e) { return toast(T("Non riesco a creare il PDF: controlla la connessione e riprova."), 'err'); }
    const doc = new JsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const green = [46, 125, 79], c = t.config;
    // Intestazione
    doc.setFillColor(...green); doc.rect(0, 0, W, 26, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text(t.nome, M, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const club = S().settings.nome;
    doc.text(`${club}${t.data ? ' · ' + fmtDate(t.data, true) : ''}${t.luogo && t.luogo !== club ? ' · ' + t.luogo : ''}`, M, 19);
    doc.setTextColor(40);
    const info = [Logic.FORMATS[t.formato], `${DISCIPLINE[t.disciplina]} ${GENERI[t.genere] || ''}`.trim(),
      Logic.isRotazione(t) ? `${T("gare da {0} min · {1} turni · {2} campi · compagno diverso a ogni turno", [c.minuti, c.turni, c.campi])}`
        : t.tempo ? `${T("gare da {0} min", [c.minuti])}` : `${c.sets == 3 ? T("2 set su 3") : T("1 set")} ai ${c.punti}`].join('  ·  ');
    const infoLines = doc.splitTextToSize(info, W - 2 * M);
    doc.setFontSize(9); doc.text(infoLines, M, 33);
    let y = 33 + infoLines.length * 4 + 7;
    const scoreHead = t.tempo ? T("Punti") : T("Risultato");
    const pairs = Logic.isRotazione(t) || t.americana || t.fantasma, side = pairs ? T("Coppia") : T("Squadra");
    const sideW = (W - 2 * M - 20 - 9 - 30) / 2;
    pdfSections(t).forEach(sec => {
      const need = 10 + (sec.rows.length + 1) * 8 + (sec.rest.length ? 7 : 0);
      if (y + need > H - 14) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...green);
      doc.text(sec.title, M, y); y += 2;
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [['', side, '', side, scoreHead]],
        body: sec.rows.map(r => [r[0], r[1], 'vs', r[2], r[3] || '____  -  ____']),
        theme: 'grid', styles: { fontSize: 10, cellPadding: 2.2, valign: 'middle', textColor: 30 },
        headStyles: { fillColor: green, textColor: 255, fontSize: 9 },
        columnStyles: { 0: { cellWidth: 20, fontStyle: 'bold' }, 1: { cellWidth: sideW }, 2: { cellWidth: 9, halign: 'center', textColor: 120 }, 3: { cellWidth: sideW }, 4: { cellWidth: 30, halign: 'center' } }
      });
      y = doc.lastAutoTable.finalY + 5;
      if (sec.rest.length) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70);
        const lines = doc.splitTextToSize(`${T("Riposa")}${sec.rest.length > 1 ? 'no' : ''}: ${sec.rest.join(', ')}`, W - 2 * M);
        doc.text(lines, M, y); y += lines.length * 4.5 + 4;
      }
      y += 3;
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`${T("{0} · calendario stampato il {1}", [t.nome, new Date().toLocaleDateString(I18n.locale)])}`, M, H - 7);
      doc.text(`${T("Pagina {0} di {1}", [i, n])}`, W - M, H - 7, { align: 'right' });
    }
    doc.save(`${T("Calendario {0}.pdf", [t.nome.replace(/[\\/:*?"<>|]+/g, ' ').trim()])}`);
  }

  // ---------- conto alla rovescia delle gare a tempo ----------
  // Condiviso: lo avvia l'organizzatore e lo vedono tutti (anche dal telefono).
  // t.timer = { min, end } in corsa (end = istante di fine), { min, left } in pausa (ms rimasti), { min } fermo.
  const mmss = ms => { const x = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };

  function timerBlock(t) {
    if (!t.tempo || !t.seeds || t.closed) return '';
    const tm = t.timer || {}, min = tm.min || t.config.minuti;
    const running = !!tm.end, paused = tm.left != null;
    if (!canTours() && !running && !paused) return '';
    const left = running ? tm.end - Date.now() : paused ? tm.left : min * 60000;
    const b = (action, label, ic, cls) => `<button type="button" class="btn ${cls || ''}" data-action="${action}" data-id="${t.id}">${icon(ic)} ${label}</button>`;
    return `<section class="card timer ${running && left <= 0 ? 'over' : ''}" data-timer data-end="${running ? tm.end : ''}">
      <div class="timer-head">${icon('clock-hour-4')} <strong>${T("Tempo di gara")}</strong>
        <button type="button" class="btn icon small" data-action="timer-full" aria-label="${T("Schermo intero")}">${icon('maximize')}</button></div>
      <div class="timer-clock" data-clock aria-live="polite">${running && left <= 0 ? T("Tempo scaduto!") : mmss(left)}</div>
      <p class="timer-state muted small" data-state>${running ? (left > 0 ? T("In corso: allo scadere terminano le partite.") : T("Fine delle partite: segnate i punti.")) : paused ? T("In pausa") : T("Pronto")}</p>
      ${canTours() ? `<div class="timer-ctl">
        ${!running && !paused ? `<label class="timer-min">${T("Minuti")}<input type="number" min="1" max="120" name="timerMin" value="${min}"></label>${b('timer-start', T("Avvia"), 'player-play', 'primary')}` : ''}
        ${running && left > 0 ? b('timer-pause', T("Pausa"), 'player-pause') : ''}
        ${paused ? b('timer-resume', T("Riprendi"), 'player-play', 'primary') : ''}
        ${running || paused ? b('timer-reset', T("Azzera"), 'rotate') : ''}
        ${b('timer-sound', T("Prova jingle"), 'music')}
      </div>` : !audioOn() ? `<div class="timer-ctl">${b('timer-sound', T("Attiva suono di fine tempo"), 'volume')}</div>` : ''}
    </section>`;
  }

  // Jingle di fine tempo, generato dal browser (nessun file audio). Sul dispositivo che ha avviato il tempo
  // suona sempre; sugli altri telefoni il browser lo consente solo dopo un tocco su "Attiva suono".
  let audio = null;
  const unlockAudio = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {} };
  const audioOn = () => !!audio;
  function note(freq, at, dur, vol, type) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.start(at); o.stop(at + dur + 0.05);
  }
  function jingle() {
    try { if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 700]); } catch (e) {}
    if (!audio) return;
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G4 = 392;
    const t0 = audio.currentTime + 0.05, q = 0.16;
    // Fanfara: tre note in salita, ripresa e accordo finale.
    [[G4, 0], [C5, 1], [E5, 2], [G5, 3], [E5, 4.5], [G5, 5.5]].forEach(([f, k]) => {
      note(f, t0 + k * q, 0.28, 0.35); note(f * 2, t0 + k * q, 0.2, 0.06, 'square');
    });
    const end = t0 + 7 * q;
    [C5, E5, G5, C6].forEach(f => note(f, end, 1.6, 0.22));
    note(C6, end + 0.05, 1.4, 0.05, 'square');
    [A5, C6, E6].forEach((f, i) => note(f, end + 1.0 + i * 0.09, 0.5, 0.12));
  }
  const rang = new Set();
  setInterval(() => {
    document.querySelectorAll('[data-timer]').forEach(el => {
      const end = Number(el.dataset.end);
      if (!end) return;
      const left = end - Date.now();
      el.querySelector('[data-clock]').textContent = left > 0 ? mmss(left) : T("Tempo scaduto!");
      if (left <= 0 && !el.classList.contains('over')) {
        el.classList.add('over');
        el.querySelector('[data-state]').textContent = T("Fine delle partite: segnate i punti.");
        const pause = el.querySelector('[data-action=timer-pause]');
        if (pause) pause.remove();
        // Suona solo se il tempo è appena scaduto (non riaprendo la pagina molto dopo).
        if (!rang.has(end) && left > -5000) { rang.add(end); jingle(); }
      }
    });
  }, 250);

  function setTimer(id, tm) { const t = tourById(id); t.timer = tm; save(); }

  const redrawable = t => ['americana', 'fantasma'].includes(t.formato) || (t.formato === 'americana_tempo' && t.config.squadre !== 'iscrizione');

  function adminTourBar(t) {
    const b = (action, label, ic, cls, extra) => `<button class="btn small ${cls || ''}" data-action="${action}" data-id="${t.id}" ${extra || ''}>${icon(ic)} ${label}</button>`;
    const out = [b('tour-edit', T("Scheda"), 'adjustments')];
    if (!t.seeds) {
      out.push(b('tour-toggle-reg', t.iscrizioniAperte ? T("Chiudi iscrizioni") : T("Apri iscrizioni"), t.iscrizioniAperte ? 'lock' : 'lock-open'));
      out.push(b('entry-add', T("Aggiungi iscritto"), 'user-plus'));
      if (!isPairs(t)) out.push(b('entry-bulk', T("Incolla elenco giocatori"), 'list'));
      out.push(b('tour-draw', T("Sorteggio / avvia"), 'arrows-shuffle', 'primary'));
    } else if (!t.closed) {
      const fs = Logic.fantasmaStage(t);
      const nextIds = Logic.fantasmaNextIds(t);
      if (nextIds && nextIds.length <= 4) {
        out.push(b('fantasma-next', T("Sorteggia coppie della finale"), 'arrows-shuffle', 'primary'));
        out.push(b('final-pairs', T("Scegli coppie della finale"), 'users-group'));
      } else if (fs === 'start') out.push(b('fantasma-next', T("Avvia fase finale (sorteggio)"), 'arrows-shuffle', 'primary'));
      else if (fs === 'next') out.push(b('fantasma-next', T("Sorteggia turno successivo"), 'arrows-shuffle', 'primary'));
      if (fs === 'final') out.push(b('final-pairs', T("Modifica coppie della finale"), 'users-group'));
      if (t.fantasma && t.fantasma.ko.length) out.push(b('fantasma-undo', T("Annulla ultimo sorteggio"), 'arrow-back-up'));
      if (t.formato === 'gironi_ko' && Logic.poolsComplete(t)) out.push(b('tour-bracket', t.bracket ? T("Rigenera tabellone") : T("Genera tabellone"), 'tournament', t.bracket ? '' : 'primary'));
      if (Logic.placements(t)) out.push(b('tour-close', T("Concludi torneo"), 'flag-check', 'primary'));
      else if (t.tempo) out.push(b('tour-close', T("Interrompi e concludi"), 'flag-check'));
      // Formule con abbinamenti a sorte: si può rifare il calendario se gli abbinamenti o i riposi non vanno bene.
      if (redrawable(t)) out.push(b('tour-redraw', T("Rigenera il tabellone e le gare"), 'refresh'));
      out.push(b('tour-undraw', T("Annulla sorteggio"), 'arrow-back-up', 'danger'));
    } else {
      out.push(b('tour-reopen', T("Riapri torneo"), 'lock-open'));
    }
    out.push(b('tour-delete', T("Elimina"), 'trash', 'danger'));
    return `<div class="admin-bar">${icon('key')} ${out.join('')}</div>`;
  }

  function tabEntries(t) {
    const rank = Logic.rankMap(S(), t);
    const pts = e => Logic.round2(Logic.entryPlayers(e).reduce((s, id) => s + (rank[id] || 0), 0));
    const list = t.seeds ? t.seeds.map(id => t.entries.find(e => e.id === id)).filter(Boolean) : t.entries.slice().sort((a, b) => pts(b) - pts(a));
    if (!list.length) return empty(T("Ancora nessun iscritto."), 'users');
    const rot = Logic.isRotazione(t), ind = !isPairs(t);
    const counts = rot ? `<p class="muted small">${['M', 'F'].map(k => `${SESSI[k] === 'Uomo' ? T("Uomini") : T("Donne")}: <strong>${list.filter(e => entrySex(e) === k).length}</strong>`).join(' · ')}</p>` : '';
    return `${counts}<div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${isPairs(t) ? T("Coppia") : T("Giocatore")}</th>${ind ? '<th>' + T("Sesso") + '</th>' : ''}${canTours() ? '<th>' + T("Livello") + '</th>' : ''}<th>${T("Punti ranking")}</th>${canTours() && !t.seeds ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((e, i) => `<tr><td>${i + 1}</td><td class="name">${entryLabel(t, e.id)}${canTours() && !isPairs(t) && (e.guest || !(S().users.find(u => u.id === e.p1) || {}).email) ? ' <span class="chip">' + T("senza account") + '</span>' : ''}</td>
        ${ind ? `<td>${SESSI[entrySex(e)] || '—'}</td>` : ''}${canTours() ? `<td>${[e.p1, e.p2].filter(Boolean).map(id => levelName(e.p2 ? (S().users.find(u => u.id === id) || {}).livello : e.livello || (S().users.find(u => u.id === id) || {}).livello)).join(' / ')}</td>` : ''}<td>${pts(e)}</td>
        ${canTours() && !t.seeds ? `<td class="right"><button class="link" data-action="entry-edit" data-id="${t.id}" data-entry="${e.id}">${T("modifica")}</button> <button class="link danger" data-action="entry-remove" data-id="${t.id}" data-entry="${e.id}">${T("rimuovi")}</button></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${t.seeds ? T("Ordine delle teste di serie usato nel sorteggio.") : T("Al sorteggio le teste di serie seguono i punti del ranking (tipologia e disciplina del torneo).")}</p>`;
  }

  function tabPools(t) {
    const single = t.formato === 'girone_unico';
    return `<div class="pools">${t.pools.map((p, pi) => {
      const st = Logic.poolStandings(t, pi);
      const ms = Logic.poolMatches(t, pi);
      const rounds = [...new Set(ms.map(m => m.round))];
      const typeCtl = canTours() && !t.closed && !single && Logic.canBeFivb(p)
        ? `<select data-change="pool-type" data-id="${t.id}" data-pool="${pi}" aria-label="${T("Formula del girone")}">${Object.entries(Logic.POOL_TYPES).map(([k, v]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`
        : `<span class="chip">${Logic.POOL_TYPES[p.type]}</span>`;
      const rest = r => (p.type === 'rr' && p.teamIds.length % 2
        ? p.teamIds.filter(id => !ms.some(m => m.round === r && (m.a === id || m.b === id))).map(id => entryLabel(t, id)) : []);
      return `<section class="card pool">
        <div class="section-head"><h3>${single ? T("Girone unico") : T("Girone ") + p.name} <span class="muted small">· ${p.teamIds.length} squadre${p.teamIds.length % 2 && p.type === 'rr' ? T(" (con bye)") : ''}</span></h3>${typeCtl}</div>
        ${standingsTable(t, st, single ? 0 : t.config.qualify)}
        ${rounds.map(r => `<h4>${T("Turno {0}", [r])}</h4>${ms.filter(m => m.round === r).map(m => stdMatch(t, m, m.label)).join('')}
          ${rest(r).length ? `<p class="muted small">${T("Riposa: {0}", [rest(r).join(', ')])}</p>` : ''}`).join('')}
      </section>`;
    }).join('')}</div>
    ${!single ? `<p class="muted small">${T("Passano il turno le prime {0} di ogni girone (evidenziate). Criteri: vittorie, scontro diretto / classifica avulsa, differenza set, differenza punti.", [t.config.qualify])}</p>` : ''}`;
  }

  function bracketColumns(t, rounds, names) {
    return `<div class="bracket">${rounds.map((round, r) => `
      <div class="round"><h4>${names(r, rounds.length)}</h4><div class="round-body">${round.map(m => stdMatch(t, m)).join('')}</div></div>`).join('')}</div>`;
  }

  function tabBracket(t) {
    if (!t.bracket) return empty(t.pools ? T("Il tabellone si genera quando tutte le partite dei gironi sono concluse.") : T("Tabellone non ancora generato."), 'tournament');
    const cm = Logic.computeMain(t);
    if (cm.type === 'single') {
      return bracketColumns(t, cm.rounds, Logic.roundName)
        + (cm.third ? `<h3>${T("Finale 3°/4° posto")}</h3>${stdMatch(t, cm.third)}` : '')
        + (cm.champion ? `<div class="champion">${T("{0} Vincitore:", [icon('trophy')])} <strong>${entryLabel(t, cm.champion)}</strong></div>` : '');
    }
    return `<h3>${T("Tabellone vincenti")}</h3>${bracketColumns(t, cm.wb, Logic.roundName)}
      <h3>${T("Tabellone perdenti")}</h3>${bracketColumns(t, cm.lb, r => `${T("Turno {0}", [r + 1])}`)}
      <h3>${T("Finalissima")}</h3>${stdMatch(t, cm.gf)}
      ${cm.champion ? `<div class="champion">${T("{0} Vincitore:", [icon('trophy')])} <strong>${entryLabel(t, cm.champion)}</strong></div>` : ''}`;
  }

  function tabRounds(t) {
    const ms = Logic.americanaMatches(t);
    return t.americana.rounds.map((rd, r) => `
      <section class="card"><h3>${T("Turno {0}", [r + 1])}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => pairRow(t, m, true, `${T("Campo {0}", [i + 1])}`)).join('')}
        ${restLine(t, rd.rest)}
      </section>`).join('');
  }

  // Gara tra coppie formate al momento (americana e fantasma).
  function pairRow(t, m, editable, label) {
    const names = [m.a.map(id => pname(t, id)).join(' + '), m.b.map(id => pname(t, id)).join(' + ')];
    names.ok = editable;
    return matchRow(t, m, names, label);
  }

  const restLine = (t, rest) => (rest.length ? `<p class="muted small">${T("{0} Riposa", [icon('coffee')])}${rest.length > 1 ? 'no' : ''}: ${rest.map(id => pname(t, id)).join(', ')}</p>` : '');

  function tabFantasmaPools(t) {
    const editable = !t.fantasma.ko.length;
    const q = new Set(Logic.fantasmaPoolsComplete(t) ? Logic.fantasmaQualifiers(t) : []);
    return `<div class="pools">${t.fantasma.pools.map((p, pi) => {
      const ms = Logic.fantasmaPoolMatches(t, pi);
      const st = Logic.fantasmaPoolStandings(t, pi);
      return `<section class="card pool">
        <h3>${T("Girone {0}", [p.name])} <span class="muted small">· ${p.ids.length} giocatori</span></h3>
        ${standingsTable(t, st, 0, true, q)}
        ${p.rounds.map((rd, r) => `<h4>${T("Turno {0}", [r + 1])}</h4>${ms.filter(m => m.round === r).map(m => pairRow(t, m, editable)).join('')}${restLine(t, rd.rest)}`).join('')}
      </section>`;
    }).join('')}</div>
    <p class="muted small">${T("Compagni e avversari sorteggiati a ogni turno")}${t.genere === 'misto' ? T(", formando quando possibile coppie miste") : ''}${T(".\n      Classifica individuale sulle medie per partita (vittorie, differenza punti, punti fatti), perché chi riposa gioca una gara in meno.\n      Alla fase finale passano i migliori {0}", [t.config.finalisti])}${q.size ? ' (evidenziati)' : ''}.</p>
    ${editable ? '' : '<p class="muted small">' + T("I risultati dei gironi si possono modificare solo annullando i sorteggi della fase finale.") + '</p>'}`;
  }

  function tabFantasmaKo(t) {
    const ko = Logic.fantasmaKo(t);
    if (!ko.length) return empty(`${T("La fase finale inizia quando tutte le gare dei gironi sono concluse: passano i migliori {0}, con un nuovo sorteggio delle coppie a ogni turno.", [t.config.finalisti])}`, 'tournament');
    const out = ko.map((rd, r) => {
      const last = r === ko.length - 1, editable = last && !t.closed;
      if (rd.final) {
        const m = rd.matches[0];
        return `<section class="card"><h3>${T("{0} Finale", [icon('trophy')])}</h3>
          <p class="muted small">${T("Gara secca tra i 4 giocatori rimasti.")}</p>
          ${pairRow(t, m, editable)}
          ${m.stats ? `<div class="champion">${T("{0} Vincitori:", [icon('trophy')])} <strong>${m[m.stats.winner].map(id => pname(t, id)).join(' e ')}</strong></div>` : ''}</section>`;
      }
      const n = rd.ids.length;
      return `<section class="card"><h3>${n === 8 ? T("Semifinali") : n === 16 ? T("Quarti di finale") : n === 32 ? T("Ottavi di finale") : T("Turno ") + (r + 1)} <span class="muted small">· ${n} giocatori</span></h3>
        <p class="muted small">${T("In ogni gara la coppia vincente passa il turno.")}</p>
        ${rd.matches.map((m, i) => pairRow(t, m, editable, `${T("Gara {0}", [i + 1])}`)).join('')}</section>`;
    }).join('');
    return out + (ko.length > 1 || !ko[0].final ? '<p class="muted small">' + T("Si possono modificare solo i risultati dell’ultimo turno sorteggiato.") + '</p>' : '');
  }

  function tabFinal(t) {
    const pl = Logic.placements(t);
    if (!pl) return empty(T("La classifica finale sarà disponibile quando tutte le partite saranno concluse."), 'hourglass');
    const rows = Object.entries(pl).sort((a, b) => a[1] - b[1]);
    const individual = Logic.isIndividual(t.formato) || Logic.isRotazione(t), pts = Logic.givesPoints(S(), t), half = t.disciplina === 'doppio' || individual || !!t.tempo;
    return `<div class="table-wrap"><table class="standings">
      <thead><tr><th>${T("Pos.")}</th><th>${individual ? T("Giocatore") : T("Squadra")}</th>${pts ? `${half ? '<th>' + T("Punti coppia") + '</th>' : ''}<th>${T("Punti a giocatore")}${Number(t.coefficiente) !== 1 ? ` (×${t.coefficiente})` : ''}</th>` : ''}</tr></thead>
      <tbody>${rows.map(([id, place]) => `<tr class="${place <= 3 ? "medal m" + place : ''}"><td>${place}°</td>
        <td class="name">${individual ? pname(t, id) : t.tempo ? teamName(t, id) : entryLabel(t, id)}</td>${pts ? `${half ? `<td>${Logic.entryPoints(S(), t, place)}</td>` : ''}<td><strong>${Logic.playerPoints(S(), t, place)}</strong></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${!pts ? T("Questo torneo non assegna punti per la classifica sociale.")
      : (half ? T("I punti in tabella sono di coppia: ogni giocatore ne riceve metà. ") : '') + (t.closed ? '' : T("I punti entrano in classifica quando l’amministratore conclude il torneo."))}</p>`;
  }

  // Squadra dell'americana a tempo: coppia iscritta o sorteggiata.
  function teamName(t, id) {
    const team = t.tempo && t.tempo.teams.find(x => x.id === id);
    return team && team.players ? team.players.map(eid => pname(t, eid)).join(' / ') : entryLabel(t, id);
  }

  function tabRotazioneRounds(t) {
    const ms = Logic.tempoMatches(t);
    const played = {};
    t.tempo.rounds.forEach(rd => rd.matches.forEach(m => m.a.concat(m.b).forEach(id => { played[id] = (played[id] || 0) + 1; })));
    const n = Object.values(played), lo = Math.min(...n), hi = Math.max(...n);
    const intro = `<p class="muted small">${T("Gare a tempo ({0} minuti) su {1} campi: conta il totale dei punti fatti.\n      A ogni turno si gioca con un compagno diverso", [t.config.minuti, t.config.campi])}${t.genere === 'misto' ? T(" (sempre uomo + donna)") : ''}.
      ${lo === hi ? `${T("Ogni giocatore gioca")} <strong>${lo}</strong> partite.` : `${T("Partite per giocatore: da {0} a {1}.", [lo, hi])}`}</p>`;
    return intro + t.tempo.rounds.map((rd, r) => `
      <section class="card"><h3>${T("Turno {0}", [r + 1])}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => pairRow(t, m, true, `${T("Campo {0}", [i + 1])}`)).join('')}
        ${rd.rest.length ? `<p class="muted small">${T("{0} Riposa", [icon('coffee')])}${rd.rest.length > 1 ? 'no' : ''}: <strong>${rd.rest.map(id => pname(t, id)).join(', ')}</strong></p>` : `<p class="muted small">${T("{0} Nessuno riposa in questo turno.", [icon('coffee')])}</p>`}
      </section>`).join('');
  }

  function tabRotazioneStandings(t) {
    const crit = Logic.rotCrit(t), sortBy = (ui.amSort || {})[t.id] || crit;
    const rows = Logic.rotazioneStandings(t, sortBy);
    const done = Logic.tempoComplete(t) || t.closed, draws = rows.some(r => r.d);
    const name = { punti: T("punti fatti"), vittorie: T("partite vinte") };
    const btn = k => `<button class="${k === sortBy ? 'on' : ''}" data-action="am-sort" data-id="${t.id}" data-sort="${k}">${Logic.ROT_CRITERI[k]}</button>`;
    const b = (k, v) => (sortBy === k ? `<strong>${v}</strong>` : v);
    return `<div class="bands" role="group" aria-label="${T("Ordina la classifica")}"><span class="muted small">${T("Ordina per:")}</span> ${btn('punti')}${btn('vittorie')}</div>
      <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${T("Giocatore")}</th><th title="${T("Partite giocate")}">G</th><th title="${T("Partite vinte")}">V</th>${draws ? '<th title="Partite pareggiate">N</th>' : ''}<th title="${T("Partite perse")}">P</th><th title="${T("Punti fatti")}">${T("Punti fatti")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${done && sortBy === crit && r.pos <= 3 ? "medal m" + r.pos : ''}"><td>${r.pos}</td><td class="name">${pname(t, r.id)}</td>
        <td>${r.played}</td><td>${b('vittorie', r.w)}</td>${draws ? `<td>${r.d}</td>` : ''}<td>${r.l}</td><td>${b('punti', r.pf)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${T("Classifica individuale: a ogni giocatore vanno i punti e le vittorie della sua coppia in ogni gara.\n      Ordinata per {0}", [name[sortBy]])}${sortBy === 'vittorie' ? T(" (poi pareggi e punti fatti)") : T(" (poi partite vinte)")}${T("; a parità, stessa posizione.")}
      <strong>${T("Il vincitore finale si decide per {0}", [name[crit]])}</strong>${canTours() ? T(" — si cambia nella Scheda del torneo") : ''}.
      ${t.closed && !Logic.tempoComplete(t) ? T("Torneo interrotto dall’organizzatore: vale la classifica al momento dello stop.") : ''}</p>`;
  }

  function tabTempoRounds(t) {
    if (t.tempo.mode === 'rotazione') return tabRotazioneRounds(t);
    const ms = Logic.tempoMatches(t);
    const intro = `<p class="muted small">${T("Gare a tempo ({0} minuti): vince chi fa più punti, il pareggio è possibile.\n      Ogni squadra gioca al massimo {1} partite.", [t.config.minuti, t.config.maxPartite])}</p>`;
    return intro + t.tempo.rounds.map((rd, r) => `
      <section class="card"><h3>${T("Turno {0}", [r + 1])}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => {
          const names = [teamName(t, m.a), teamName(t, m.b)];
          names.ok = true;
          return matchRow(t, m, names, `${T("Campo {0}", [i + 1])}`);
        }).join('')}
        ${rd.rest.length ? `<p class="muted small">${T("{0} Riposa", [icon('coffee')])}${rd.rest.length > 1 ? 'no' : ''}: ${rd.rest.map(id => teamName(t, id)).join(', ')}</p>` : ''}
      </section>`).join('');
  }

  function tabTempoStandings(t) {
    if (t.tempo.mode === 'rotazione') return tabRotazioneStandings(t);
    const rows = Logic.tempoStandings(t);
    const q = r => { const v = Logic.quoziente(r); return v === Infinity ? '∞' : v.toFixed(3).replace('.', ','); };
    const done = Logic.tempoComplete(t);
    return `<div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${T("Squadra")}</th><th title="${T("Partite")}">G</th><th title="${T("Vittorie")}">V</th><th title="${T("Pareggi")}">N</th><th title="${T("Sconfitte")}">P</th>
        <th title="${T("Punti fatti")}">${T("PF")}</th><th title="${T("Punti subiti")}">${T("PS")}</th><th title="${T("Quoziente punti")}">${T("Quoz.")}</th><th title="${T("Differenza")}">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < 3 && (done || t.closed) ? "medal m" + (i + 1) : ''}"><td>${i + 1}</td><td class="name">${teamName(t, r.id)}</td>
        <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><strong>${r.pf}</strong></td><td>${r.ps}</td><td>${q(r)}</td><td>${r.pf - r.ps > 0 ? '+' : ''}${r.pf - r.ps}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${T("Classifica per")} ${t.config.criterioTempo === 'punti' ? T("punti fatti, poi quoziente punti") : T("quoziente punti (fatti / subiti), poi punti fatti")}.
      ${t.closed && !done ? T("Torneo interrotto dall’organizzatore: vale la classifica al momento dello stop.") : ''}</p>`;
  }

  // Tutte le partite del torneo (per la finestra del risultato).
  function findMatch(t, key) {
    if (t.tempo) return Logic.tempoMatches(t).find(m => m.key === key);
    if (t.americana) return Logic.americanaMatches(t).find(m => m.key === key);
    if (t.fantasma) {
      const all = t.fantasma.pools.flatMap((_, pi) => Logic.fantasmaPoolMatches(t, pi)).concat(Logic.fantasmaKo(t).flatMap(rd => rd.matches));
      return all.find(m => m.key === key);
    }
    const out = [];
    if (t.pools) t.pools.forEach((_, pi) => out.push(...Logic.poolMatches(t, pi)));
    const cm = Logic.computeMain(t);
    if (cm && cm.type === 'single') { out.push(...cm.rounds.flat()); if (cm.third) out.push(cm.third); }
    if (cm && cm.type === 'double') out.push(...cm.wb.flat(), ...cm.lb.flat(), cm.gf);
    return out.find(m => m.key === key);
  }

  // ---------- correzione dei giocatori di una gara (americana e americana a tempo a rotazione) ----------
  // Se in campo sono andati giocatori diversi dal calendario, l'admin li corregge: il risultato resta
  // e chi riposa nel turno si ricalcola da solo.
  function roundOf(t, key) {
    const rounds = (t.tempo && t.tempo.mode === 'rotazione' && t.tempo.rounds) || (t.americana && t.americana.rounds) || [];
    const r = rounds.findIndex(rd => rd.matches.some(m => m.key === key));
    return r < 0 ? null : { r, rd: rounds[r], m: rounds[r].matches.find(m => m.key === key) };
  }
  const roundPlayers = t => (t.tempo && t.tempo.players) || t.seeds || [];

  function playersEditor(t, key) {
    const x = roundOf(t, key);
    if (!x || !canTours()) return '';
    const all = roundPlayers(t).slice().sort((a, b) => plain(pname(t, a)).localeCompare(plain(pname(t, b))));
    const sel = (name, cur) => `<select name="${name}">${all.map(id => `<option value="${id}" ${id === cur ? 'selected' : ''}>${pname(t, id)}</option>`).join('')}</select>`;
    return `<details class="players-edit"><summary>${T("{0} Hanno giocato altri giocatori? Correggi la gara", [icon('users')])}</summary>
      <p class="muted small">${T("Scegli chi ha giocato davvero in questa gara. Se scegli qualcuno di un’altra gara dello stesso turno, i due si scambiano di posto.\n        I risultati restano dove sono; chi riposa nel turno {0} si aggiorna da solo.", [x.r + 1])}</p>
      <div class="row"><label>${T("Coppia 1{0}{1}", [sel('pa1', x.m.a[0]), sel('pa2', x.m.a[1])])}</label><label>${T("Coppia 2{0}{1}", [sel('pb1', x.m.b[0]), sel('pb2', x.m.b[1])])}</label></div>
    </details>`;
  }

  // Applica la correzione. Se si sceglie chi gioca in un'altra gara dello stesso turno, i due si scambiano di posto
  // (anche i risultati delle gare restano dove sono). Restituisce { err, changed, swapped: [nomi gare toccate] }.
  function applyPlayers(t, v) {
    const x = roundOf(t, v.key);
    if (!x || !v.pa1) return { err: null, changed: false, swapped: [] };
    const want = [v.pa1, v.pa2, v.pb1, v.pb2];
    if (new Set(want).size !== 4) return { err: T("Nella gara ci sono giocatori ripetuti.") };
    const cur = x.m.a.concat(x.m.b);
    if (want.join() === cur.join()) return { err: null, changed: false, swapped: [] };
    const touched = new Set();
    want.forEach((nw, k) => {
      const old = cur[k];
      if (nw === old || cur.includes(nw)) return;
      // nw è in un'altra gara del turno: prende il posto di old là (scambio); se riposava, old va a riposo.
      x.rd.matches.forEach((o, oi) => {
        if (o.key === v.key) return;
        ['a', 'b'].forEach(side => {
          const i = o[side].indexOf(nw);
          if (i < 0) return;
          o[side] = o[side].slice(); o[side][i] = old; touched.add(oi);
          const r = t.results[o.key];
          if (r && r.a) { r.a = o.a; r.b = o.b; }
        });
      });
    });
    x.m.a = want.slice(0, 2); x.m.b = want.slice(2);
    const playing = x.rd.matches.flatMap(o => o.a.concat(o.b));
    if (new Set(playing).size !== playing.length) return { err: T("Correzione non valida: un giocatore risulterebbe in due gare.") };
    x.rd.rest = roundPlayers(t).filter(id => !playing.includes(id));
    const res = t.results[v.key];
    if (res && res.a) { res.a = x.m.a; res.b = x.m.b; }
    return { err: null, changed: true, swapped: [...touched].map(i => `${T("Campo {0}", [i + 1])}`) };
  }

  function resultDialog(t, key) {
    const m = findMatch(t, key);
    if (!m) return;
    if (t.tempo) {
      const r0 = t.results[key] || {};
      openDialog(`
        <form data-form="result">
          <input type="hidden" name="tid" value="${t.id}"><input type="hidden" name="key" value="${key}">
          <h2>${T("Risultato")}</h2>
          <p class="muted small">${T("Gara a tempo: inserisci i punti fatti da ciascuna coppia allo scadere (il pareggio è ammesso).")}</p>
          ${playersEditor(t, key)}
          <div class="score-grid">
            <span></span><strong>${sideName(t, m.a)}</strong><strong>${sideName(t, m.b)}</strong>
            <span class="muted">${T("Punti")}</span>
            <input type="number" inputmode="numeric" min="0" max="999" name="pa" value="${r0.pa != null ? r0.pa : ''}" aria-label="${T("Punti {0}", [sideName(t, m.a).replace(/<[^>]+>/g, '')])}">
            <input type="number" inputmode="numeric" min="0" max="999" name="pb" value="${r0.pb != null ? r0.pb : ''}" aria-label="${T("Punti {0}", [sideName(t, m.b).replace(/<[^>]+>/g, '')])}">
          </div>
          <p class="form-error" hidden></p>
          <div class="actions">
            ${t.results[key] ? '<button type="button" class="btn danger" data-action="result-clear">' + T("Cancella risultato") + '</button>' : ''}
            <button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button>
            <button class="btn primary">${T("Salva")}</button>
          </div>
        </form>`);
      return;
    }
    const amer = Array.isArray(m.a);
    const names = amer ? [m.a.map(id => pname(t, id)).join(' + '), m.b.map(id => pname(t, id)).join(' + ')] : [entryLabel(t, m.a), entryLabel(t, m.b)];
    const res = t.results[key] || {};
    const nSets = Number(t.config.sets) === 3 ? 3 : 1;
    const sets = res.sets || [];
    openDialog(`
      <form data-form="result">
        <input type="hidden" name="tid" value="${t.id}"><input type="hidden" name="key" value="${key}">
        <h2>${T("Risultato")}</h2>
        <p class="muted small">${Number(t.config.sets) === 3 ? T("2 set su 3") : T("Set unico")} ${T("ai {0} punti, 2 punti di scarto.", [t.config.punti])}</p>
        ${playersEditor(t, key)}
        <div class="score-grid">
          <span></span><strong>${names[0]}</strong><strong>${names[1]}</strong>
          ${Array.from({ length: nSets }, (_, i) => `<span class="muted">${T("Set {0}", [i + 1])}${i === 2 ? ` ${T("(ai {0})", [t.config.puntiDecisivo])}` : ''}</span>
            <input type="number" inputmode="numeric" min="0" max="99" name="a${i}" value="${sets[i] ? sets[i][0] : ''}" aria-label="${T("Set {0} {1}", [i + 1, names[0]])}">
            <input type="number" inputmode="numeric" min="0" max="99" name="b${i}" value="${sets[i] ? sets[i][1] : ''}" aria-label="${T("Set {0} {1}", [i + 1, names[1]])}">`).join('')}
        </div>
        ${amer ? '' : `<label>${T("Ritiro / forfait")}
          <select name="forfeit"><option value="">${T("Nessuno")}</option><option value="a" ${res.forfeit === 'a' ? 'selected' : ''}>${T("Si ritira {0}", [names[0].replace(/<[^>]+>/g, '')])}</option><option value="b" ${res.forfeit === 'b' ? 'selected' : ''}>${T("Si ritira {0}", [names[1].replace(/<[^>]+>/g, '')])}</option></select></label>`}
        <p class="form-error" hidden></p>
        <div class="actions">
          ${t.results[key] ? '<button type="button" class="btn danger" data-action="result-clear">' + T("Cancella risultato") + '</button>' : ''}
          <button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button>
          <button class="btn primary">${T("Salva")}</button>
        </div>
      </form>`);
  }

  // Nuovo torneo: la scheda in un dialogo. I tornei esistenti si modificano dal tab "Scheda".
  function tourForm(t) {
    if (t) { ui.tab[t.id] = 'scheda'; location.hash = '#/tornei/' + t.id; render(); return; }
    openDialog(tourFormHtml(null, false));
    syncTourForm();
  }

  // Tab "Scheda": tutti i parametri del torneo, modificabili (quelli bloccati dopo il sorteggio sono indicati).
  function tabScheda(t) {
    return tourFormHtml(t, true);
  }

  function tourFormHtml(t, inline) {
    const s = S(), c = t ? t.config : Logic.defaultConfig(), drawn = t && t.seeds;
    const opt = (obj, val) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === val ? 'selected' : ''}>${v}</option>`).join('');
    const pts = val => Logic.POINTS.map(p => `<option ${p == val ? 'selected' : ''}>${p}</option>`).join('');
    const fmt = t ? t.formato : 'gironi_ko';
    const sec = title => `<h3 class="form-sec">${title}</h3>`;
    return `
      <form data-form="tour" class="tour-form ${inline ? 'card scheda' : ''}" data-formato="${fmt}">
        <input type="hidden" name="id" value="${t ? t.id : ''}">
        ${inline ? `<p class="muted small">${T("{0} Qui trovi tutti i parametri del torneo. Modifica quello che serve e premi", [icon('info-circle')])} <strong>${T("Salva modifiche")}</strong>.
          ${drawn ? T("Dopo il sorteggio formula, categoria e tipo di squadre restano bloccati; per cambiarli annulla il sorteggio.") : ''}</p>` : `<h2>${T("Nuovo torneo")}</h2>`}
        ${sec(`${T("{0} Dettagli", [icon('id')])}`)}
        <label>${T("Nome")}<input name="nome" required value="${esc(t ? t.nome : '')}"></label>
        ${legaSelect(t ? t.lega : ui.newLega, T("Lega (i punti vanno solo nella classifica della lega)"))}
        <div class="row">
          <label>${T("Data")}${dateField('data', t ? t.data : '', { required: true })}</label>
          <label>${T("Luogo")}<input name="luogo" value="${esc(t ? t.luogo : s.settings.nome)}"></label>
        </div>
        ${sec(`${T("{0} Punti per la classifica", [icon('list-numbers')])}`)}
        <div class="row">
          <label>${T("Punti per la classifica sociale")}<select name="categoriaId">
            <option value="">${T("Nessun punto (non vale per la classifica)")}</option>
            ${s.categories.map(x => `<option value="${x.id}" ${t && t.categoriaId === x.id ? 'selected' : ''}>${T("Tabella “{0}”", [esc(x.nome)])}</option>`).join('')}
            <option value="custom" ${(t ? t.categoriaId === 'custom' : !!ui.newLega) ? 'selected' : ''}>${T("Tabella personalizzata per questo torneo")}</option></select></label>
          <label data-show-points>${T("Coefficiente")}<input type="number" step="0.1" min="0" name="coefficiente" value="${t ? t.coefficiente : 1}"></label>
        </div>
        <label data-show-custom>${T("Tabella punti del torneo (una riga per posizione:")} <code>posizione=punti</code>, ${T("punti di coppia)")}
          <textarea name="puntiRows" rows="4" placeholder="1=100&#10;2=80&#10;3=60&#10;5=40&#10;9=20">${t && t.puntiRows ? t.puntiRows.map(([p, v]) => `${p}=${v}`).join('\n') : !t && ui.newLega ? (S().settings.sfidePunti || Logic.SFIDE_PUNTI).map(([p, v]) => `${p}=${v}`).join('\n') : ''}</textarea></label>
        ${sec(`${T("{0} Formula", [icon('tournament')])}`)}
        <div class="row">
          <label>${T("Disciplina")}<select name="disciplina" ${drawn ? 'disabled' : ''}>${opt(DISCIPLINE, t ? t.disciplina : 'doppio')}</select></label>
          <label>${T("Categoria")}<select name="genere" ${drawn ? 'disabled' : ''}>${opt(GENERI, t ? t.genere : 'open')}</select></label>
        </div>
        <label>${T("Formula")}<select name="formato" ${drawn ? 'disabled' : ''}>${Object.entries(Logic.FORMATS).map(([k, v]) => `<option value="${k}" ${k === fmt ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${drawn ? '<p class="muted small">' + T("Formula e categoria non si possono cambiare dopo il sorteggio.") + '</p>' : ''}
        <fieldset data-hide="americana_tempo"><legend>${T("Punteggio")}</legend>
          <div class="row">
            <label>${T("Set")}<select name="sets"><option value="1" ${c.sets != 3 ? 'selected' : ''}>${T("1 set")}</option><option value="3" ${c.sets == 3 ? 'selected' : ''}>${T("2 set su 3")}</option></select></label>
            <label>${T("Punti per set")}<select name="punti">${pts(c.punti)}</select></label>
            <label data-show-sets>${T("Terzo set ai")}<select name="puntiDecisivo">${pts(c.puntiDecisivo)}</select></label>
          </div>
        </fieldset>
        <fieldset data-show="gironi_ko"><legend>${T("Gironi")}</legend>
          <div class="row">
            <label>${T("Squadre per girone")}<input type="number" min="2" max="12" name="poolSize" value="${c.poolSize}"></label>
            <label>${T("Qualificate per girone")}<input type="number" min="1" max="8" name="qualify" value="${c.qualify}"></label>
          </div>
          <label>${T("Formula dei gironi (modificabile poi girone per girone)")}<select name="poolType">${opt(Logic.POOL_TYPES, c.poolType)}</select></label>
          <p class="muted small">${T("Se gli iscritti non sono un multiplo esatto, i gironi saranno “zoppi” (es. 4-3-3) e nei gironi dispari una squadra riposa a ogni turno. La formula FIVB vale per gironi da 3 o 4.")}</p>
        </fieldset>
        <label class="check" data-show="gironi_ko,eliminazione"><input type="checkbox" name="thirdPlace" ${c.thirdPlace ? 'checked' : ''}> ${T("Finale 3°/4° posto")}</label>
        <fieldset data-show="americana_tempo"><legend>${T("Americana a tempo")}</legend>
          <label>${T("Squadre")}<select name="squadre" ${drawn ? 'disabled' : ''}>${opt(Logic.TEMPO_SQUADRE, c.squadre)}</select></label>
          <div class="row">
            <label>${T("Durata gara (minuti)")}<input type="number" min="1" max="120" name="minuti" value="${c.minuti}"></label>
            <label data-tempo="rotazione">${T("Numero dei turni")}<input type="number" min="1" max="30" name="tTurni" value="${c.turni}"></label>
            <label data-tempo="rotazione">${T("Campi disponibili")}<input type="number" min="1" max="30" name="tCampi" value="${c.campi || 3}"></label>
            <label data-tempo="iscrizione,sorteggio">${T("Partite massime per squadra")}<input type="number" min="1" max="50" name="maxPartite" value="${c.maxPartite}"></label>
          </div>
          <label data-tempo="rotazione">${T("Il vincitore finale si calcola in base a")}<select name="criterioRot">${opt(Logic.ROT_CRITERI, c.criterioRot === 'vittorie' ? 'vittorie' : 'punti')}</select></label>
          ${drawn ? '<p class="notice small" data-tempo="rotazione">' + T("Se cambi turni o campi, salva e poi premi") + ' <strong>' + T("Rigenera il tabellone e le gare") + '</strong> ' + T("per rifare il calendario.") + '</p>' : ''}
          <label data-tempo="iscrizione,sorteggio">${T("Vince chi ha")}<select name="criterioTempo">${Object.entries(Logic.TEMPO_CRITERI).map(([k, l]) => `<option value="${k}" ${c.criterioTempo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small" data-tempo="rotazione">${T("Iscrizione individuale: l’organizzatore può inserire anche giocatori non registrati (nome, cognome, sesso, livello).\n            A ogni turno ognuno gioca con un compagno diverso (nei tornei misti sempre uomo + donna); le gare sono distribuite sui campi e chi è in più riposa, a rotazione.\n            Il livello serve a bilanciare le gare. Classifica individuale per totale dei punti fatti.")}</p>
          <p class="muted small" data-tempo="iscrizione,sorteggio">${T("Vince la gara chi fa più punti allo scadere del tempo (pareggio possibile). Il calendario evita di ripetere gli avversari.\n            Il torneo termina quando le squadre hanno giocato le partite previste; l’organizzatore può anche interromperlo prima.\n            Con squadre sorteggiate, nei tornei misti si formano quando possibile coppie uomo+donna.")}</p>
        </fieldset>
        <label data-show="americana,americana_tempo,fantasma">${T("Uomini e donne negli abbinamenti (tornei open)")}<select name="vincolo">${opt(Logic.VINCOLI, c.vincolo || 'equilibrato')}</select></label>
        <fieldset data-show="fantasma"><legend>${T("Torneo fantasma")}</legend>
          <div class="row">
            <label>${T("Giocatori per girone")}<input type="number" min="4" max="32" name="poolPlayers" value="${c.poolPlayers}"></label>
            <label>${T("Turni per girone")}<input type="number" min="1" max="20" name="poolTurni" value="${c.poolTurni}"></label>
            <label>${T("Finalisti")}<select name="finalisti">${Logic.FINALISTS.map(n => `<option ${n == c.finalisti ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          </div>
          <p class="muted small">${T("Iscrizione individuale. A ogni gara il compagno viene sorteggiato (nei tornei misti si formano quando possibile coppie uomo+donna).\n            Dopo i gironi passano i migliori; nella fase finale a ogni turno nuovo sorteggio: la coppia vincente passa, quella perdente esce.\n            Con 4 giocatori rimasti si gioca la finale secca, con coppie sorteggiate o scelte dall’organizzatore.")}</p>
        </fieldset>
        <fieldset data-show="americana"><legend>${T("Americana")}</legend>
          <div class="row">
            <label>${T("Turni")}<input type="number" min="1" max="30" name="turni" value="${c.turni}"></label>
            <label>${T("Campi disponibili (0 = senza limite)")}<input type="number" min="0" max="30" name="campi" value="${c.campi}"></label>
          </div>
          <label>${T("Il vincitore finale si calcola in base a")}<select name="criterio">${Object.entries(Logic.AMERICANA_CRITERI).map(([k, l]) => `<option value="${k}" ${(c.criterio === 'punti' ? 'punti' : 'set') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">${T("Iscrizione individuale: a ogni turno le coppie cambiano, evitando di ripetere compagni e avversari. Chi è in più riposa, a rotazione.")}</p>
        </fieldset>
        ${sec(`${T("{0} Iscrizioni", [icon('users')])}`)}
        ${levelsBox(t ? t.livelli : [], T("Solo i giocatori di questi livelli possono iscriversi. Nessuna casella = aperto a tutti i livelli."))}
        <div class="row">
          <label>${T("Numero massimo iscritti (0 = nessun limite)")}<input type="number" min="0" name="maxIscritti" value="${t ? t.maxIscritti || 0 : 0}"></label>
          <label class="check"><input type="checkbox" name="iscrizioniAperte" ${!t || t.iscrizioniAperte ? 'checked' : ''}> ${T("Iscrizioni online aperte")}</label>
        </div>
        ${sec(`${T("{0} Regolamento", [icon('file-text')])}`)}
        <label>${T("Descrizione / regolamento")}<textarea name="descrizione" rows="${inline ? 5 : 3}">${esc(t ? t.descrizione : '')}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="actions">${inline ? `<button type="button" class="btn" data-action="scheda-reset" data-id="${t.id}">${T("{0} Annulla modifiche", [icon('arrow-back-up')])}</button>`
          : '<button type="button" class="btn" data-action="close-dialog">' + T("Annulla") + '</button>'}<button class="btn primary">${icon('device-floppy')} ${inline ? T("Salva modifiche") : T("Salva")}</button></div>
      </form>`;
  }

  function syncTourForm() {
    document.querySelectorAll('form.tour-form').forEach(syncOneTourForm);
  }
  function syncOneTourForm(f) {
    const fmt = f.elements.formato.value;
    f.querySelectorAll('[data-show]').forEach(el => { el.hidden = !el.dataset.show.split(',').includes(fmt); });
    f.querySelectorAll('[data-hide]').forEach(el => { el.hidden = el.dataset.hide.split(',').includes(fmt); });
    f.querySelector('[data-show-sets]').hidden = f.elements.sets.value !== '3';
    f.querySelectorAll('[data-tempo]').forEach(el => { el.hidden = !el.dataset.tempo.split(',').includes(f.elements.squadre.value); });
    const ind = Logic.isIndividual(fmt) || fmt === 'americana_tempo';
    f.elements.disciplina.disabled = ind;
    if (ind) f.elements.disciplina.value = 'doppio';
    const cat = f.elements.categoriaId.value;
    f.querySelector('[data-show-points]').hidden = !cat;
    f.querySelector('[data-show-custom]').hidden = cat !== 'custom';
  }

  function playerOptions(filter, selected) {
    return S().users.filter(filter || (() => true)).sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome))
      .map(u => `<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>${esc(u.cognome + ' ' + u.nome)}</option>`).join('');
  }

  // Controllo del sesso secondo la categoria del torneo. Restituisce un messaggio di errore o null.
  function genderError(t, ids) {
    const us = ids.filter(Boolean).map(id => S().users.find(u => u.id === id));
    if (t.genere !== 'open' && us.some(u => !u || !u.sesso)) return T("Per questo torneo il sesso del giocatore deve essere indicato nel profilo.");
    if (t.genere === 'M' && us.some(u => u.sesso !== 'M')) return T("Torneo maschile: possono iscriversi solo uomini.");
    if (t.genere === 'F' && us.some(u => u.sesso !== 'F')) return T("Torneo femminile: possono iscriversi solo donne.");
    if (t.genere === 'misto' && isPairs(t) && us.length === 2 && us[0].sesso === us[1].sesso) return T("Torneo misto: la coppia deve essere formata da un uomo e una donna.");
    return null;
  }

  // Giocatore senza account (inserito dall'organizzatore): entra anche nell'elenco generale "Utenti e giocatori",
  // così si ritrova nei tornei successivi e prende i punti in classifica. Se c'è già qualcuno con lo stesso nome si usa quello.
  const nameKey = (n, c) => `${n} ${c}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const byPref = (x, y) => (y.email ? 1 : 0) - (x.email ? 1 : 0) || (x.id < y.id ? -1 : 1);
  function playerFor(g, newId) {
    const same = S().users.filter(u => nameKey(u.nome, u.cognome) === nameKey(g.nome, g.cognome) && (!g.sesso || !u.sesso || u.sesso === g.sesso));
    if (same.length) return same.sort(byPref)[0];
    const u = { id: newId || Store.uid('u'), nome: g.nome, cognome: g.cognome, sesso: g.sesso || '', email: '', pw: '', role: 'user', tel: '' };
    S().users.push(u);
    return u;
  }

  // Iscritti "ospite" inseriti prima che finissero nell'elenco generale: si collegano a un giocatore senza account.
  // L'id del nuovo giocatore dipende dall'iscrizione, così ripetere l'operazione non crea doppioni.
  function adoptGuests() {
    let changed = false;
    S().tournaments.forEach(t => t.entries.forEach(e => {
      if (!e.guest || e.p1) return;
      e.p1 = playerFor(e.guest, 'ug' + e.id).id; e.guest = null; changed = true;
    }));
    return changed;
  }

  // Unisce i giocatori senza account con lo stesso nome e sesso (doppioni): si tiene il primo,
  // iscrizioni, prenotazioni e corsi passano a lui. Gli account registrati non vengono mai toccati.
  const localId = id => /^u[a-z0-9]/.test(id) && id.length < 24;
  function mergeDuplicates() {
    const s = S(), groups = {};
    s.users.filter(u => !u.email && localId(u.id)).forEach(u => { (groups[nameKey(u.nome, u.cognome) + '|' + (u.sesso || '')] ||= []).push(u); });
    const map = {};
    Object.values(groups).forEach(g => {
      if (g.length < 2) return;
      g.sort(byPref);
      g.slice(1).forEach(u => { map[u.id] = g[0].id; });
    });
    if (!Object.keys(map).length) return false;
    const to = id => map[id] || id;
    s.tournaments.forEach(t => t.entries.forEach(e => { e.p1 = e.p1 && to(e.p1); e.p2 = e.p2 && to(e.p2); }));
    s.bookings.forEach(b => { if (b.userId) b.userId = to(b.userId); });
    s.courses.forEach(c => { c.iscritti = [...new Set(c.iscritti.map(to))]; });
    s.users = s.users.filter(u => !map[u.id]);
    return true;
  }

  // Sistemazioni automatiche dei dati, solo per l'admin e solo con tutti i dati arrivati.
  // Una volta sola per sessione: dopo una modifica i dati tornano dal database a pezzi (una raccolta alla volta)
  // e un nuovo controllo vedrebbe dati vecchi, riscrivendo le stesse cose più volte.
  let dataFixed = false;
  function fixData() {
    if (dataFixed || !Store.ready || !isAdmin() || (window.Cloud && !Cloud.allUsers)) return false;
    dataFixed = true;
    const a = adoptGuests(), b = mergeDuplicates();
    return a || b;
  }

  // Livello di gioco facoltativo: il trattino vuol dire nessun livello.
  const levelOptions = sel => `<option value="" ${!sel ? 'selected' : ''}>— ${T("(nessun livello)")}</option>` + Object.entries(Logic.LIVELLI).map(([k, l]) => `<option value="${k}" ${Number(k) === Number(sel) ? 'selected' : ''}>${k} · ${l}</option>`).join('');

  function entryDialog(t, entry) {
    const inT = new Set(t.entries.filter(e => e !== entry).flatMap(Logic.entryPlayers));
    const free = u => !inT.has(u.id);
    const doubles = isPairs(t);
    const u = me(), self = !canTours();
    // Giocatori non registrati: solo l'organizzatore, nelle formule a iscrizione individuale.
    const guests = !self && !doubles, g = entry && entry.guest;
    const rot = Logic.isRotazione(t);
    openDialog(`
      <form data-form="entry">
        <input type="hidden" name="tid" value="${t.id}"><input type="hidden" name="eid" value="${entry ? entry.id : ''}">
        <h2>${self ? T("Iscrizione") : entry ? T("Modifica iscrizione") : T("Aggiungi iscritto")} · ${esc(t.nome)}</h2>
        ${self ? `<p>${T("Giocatore:")} <strong>${esc(userName(u.id))}</strong></p><input type="hidden" name="p1" value="${u.id}">`
        : `<label>${T("Giocatore")}<select name="p1" data-change="entry-kind" ${guests ? '' : 'required'}><option value="">—</option>
            ${guests ? `<option value="__guest" ${g ? 'selected' : ''}>${T("➕ Nuovo giocatore non registrato all’app")}</option>` : ''}${playerOptions(free, entry && entry.p1)}</select></label>
          ${guests ? `<div class="guest-fields" ${g ? '' : 'hidden'}>
            <div class="row"><label>${T("Nome")}<input name="gNome" value="${esc(g ? g.nome : '')}"></label><label>${T("Cognome")}<input name="gCognome" value="${esc(g ? g.cognome : '')}"></label></div>
            <label>${T("Sesso")}<select name="gSesso"><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${g && g.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>` : ''}
          ${rot ? `<label>${T("Livello")}<select name="livello">${levelOptions(entry && entry.livello)}</select></label>` : ''}`}
        ${doubles ? `<label>${T("Compagno/a")}<select name="p2"><option value="">${T("Da definire (cerco compagno)")}</option>${playerOptions(x => free(x) && (!self || x.id !== u.id), entry && entry.p2)}</select></label>
          <p class="muted small">${T("Il compagno deve essere registrato nell’app. Se non lo trovi, lascia “da definire”: l’organizzazione completerà la coppia.")}</p>` : ''}
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${self ? T("Conferma iscrizione") : T("Salva")}</button></div>
      </form>`);
  }

  // Elenco di giocatori incollato (es. da un messaggio): una persona per riga.
  // Le righe "donne"/"femminili" e "uomini"/"maschili" cambiano il sesso delle righe che seguono.
  function bulkDialog(t) {
    openDialog(`
      <form data-form="entry-bulk">
        <input type="hidden" name="tid" value="${t.id}">
        <h2>${T("Incolla elenco giocatori · {0}", [esc(t.nome)])}</h2>
        <label>${T("Giocatori (uno per riga: nome e cognome)")}
          <textarea name="elenco" rows="12" placeholder="${T("Donne&#10;Maria Capponi&#10;Cristina Pezzotta&#10;&#10;Uomini&#10;Marco Frosinone&#10;Ugo Marceddu")}"></textarea></label>
        <p class="muted small">${T("Puoi incollare anche un messaggio intero: le righe con “donne” o “femminili” e “uomini” o “maschili” indicano il sesso dei nomi che seguono.\n          Chi è già nell’elenco “Utenti e giocatori” viene riconosciuto dal nome; gli altri vengono aggiunti all’elenco come giocatori senza account.")}</p>
        <div class="row">
          <label>${T("Sesso (se non indicato nell’elenco)")}<select name="sesso"><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          ${Logic.isRotazione(t) ? `<label>${T("Livello")}<select name="livello">${levelOptions(null)}</select></label>` : ''}
        </div>
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Inserisci")}</button></div>
      </form>`);
  }

  const cap = w => w.split(/([\s'-])/).map(x => (x.length > 1 || /\w/.test(x) ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : x)).join('');

  const NOT_NAME = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'e', 'ed', 'con', 'per', 'che', 'non', 'se', 'su', 'ad', 'ogni', 'tutti', 'tutte',
    'turno', 'turni', 'gara', 'gare', 'torneo', 'squadra', 'squadre', 'campo', 'campi', 'giocatori', 'riposo', 'punti', 'classifica', 'minuti']);

  function parseBulk(text, defSex) {
    const out = [];
    let sex = defSex || '';
    String(text || '').split(/\r?\n/).forEach(line => {
      const l = line.replace(/^[\s\-–•*\d.)]+/, '').replace(/[\s\-–,;.:]+$/, '').trim();
      if (!l) return;
      const low = l.toLowerCase();
      if (/(?<!\p{L})(donne|femminil[ei]|ragazze|women|females?|ladies|girls|γυναίκες|γυναικες|κορίτσια|mujeres|femenino|chicas|mulheres|feminino|raparigas|femmes|filles|féminines|frauen|damen|mädchen|femei|fete|женщины|девушки)(?!\p{L})/u.test(low)) { sex = 'F'; return; }
      if (/(?<!\p{L})(uomini|maschil[ei]|ragazzi|men|males?|boys|άνδρες|ανδρες|άντρες|αντρες|αγόρια|hombres|masculino|chicos|homens|rapazes|hommes|garçons|masculins|männer|herren|jungen|bărbați|barbati|băieți|мужчины|парни)(?!\p{L})/u.test(low)) { sex = 'M'; return; }
      const parts = l.split(/\s+/);
      // Righe di testo (frasi del messaggio) e non nomi: si saltano.
      if (parts.length < 2 || parts.length > 4 || /[^\p{L}\s'’-]/u.test(l) || parts.some(w => NOT_NAME.has(w.toLowerCase()))) return;
      out.push({ nome: cap(parts[0]), cognome: cap(parts.slice(1).join(' ')), sesso: sex });
    });
    return out;
  }

  // ====================================================================
  // SFIDE
  // Un utente registrato lancia una sfida (data, ora, luogo, 1 o 2 campi, posti cercati per sesso o indifferenti,
  // massimo di persone) come gioco libero o come torneo. Gli altri si candidano; chi l'ha lanciata (o un admin)
  // conferma o rifiuta e può chiudere la sfida: chi non è stato confermato riceve un avviso.
  // I nomi dei partecipanti li vedono solo chi ha lanciato la sfida e gli admin; gli altri vedono i posti confermati.
  // Le sfide a torneo diventano un torneo vero e proprio (sezione Tornei), gestito da chi le ha lanciate.
  // ====================================================================
  const SF_FORMATI = {
    girone_unico: T("Girone unico (tutti contro tutti)"),
    gironi_ko: T("Gironi + eliminazione diretta"),
    americana: T("Americana (compagno diverso a ogni partita)"),
    americana_tempo: T("Americana a tempo (compagno diverso, gare a tempo)")
  };
  // Formule a coppie fisse: ci si candida in coppia (compagno registrato o no).
  const sfCoppie = x => x.tipo === 'torneo' && ['girone_unico', 'gironi_ko'].includes(x.formato);
  const partnerName = pa => (!pa ? '' : pa.uid ? userName(pa.uid) : `${T("{0} {1} (non registrato)", [pa.nome, pa.cognome])}`);
  const partnerSex = pa => (!pa ? '' : pa.uid ? (S().users.find(u => u.id === pa.uid) || {}).sesso || '' : pa.sesso || '');
  // Scelta del compagno: giocatore dell'elenco oppure nuovo giocatore non registrato.
  function partnerFields(exclude, label) {
    const opts = S().users.filter(u => !exclude.includes(u.id)).sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome))
      .map(u => `<option value="${u.id}">${esc(u.cognome + ' ' + u.nome)}</option>`).join('');
    return `<label>${label}<select name="pUid" data-change="partner-kind"><option value="">—</option><option value="__guest">${T("➕ Non registrato all’app")}</option>${opts}</select></label>
      <div class="partner-guest" hidden><div class="row"><label>${T("Nome")}<input name="pNome" maxlength="60"></label><label>${T("Cognome")}<input name="pCognome" maxlength="60"></label></div>
        <label>${T("Sesso")}<select name="pSesso"><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>`;
  }
  function readPartner(v) {
    if (v.pUid === '__guest') {
      const g = { nome: (v.pNome || '').trim(), cognome: (v.pCognome || '').trim(), sesso: v.pSesso || '' };
      return g.nome && g.cognome && g.sesso ? g : null;
    }
    return v.pUid ? { uid: v.pUid } : null;
  }
  const sfPast = x => isPast(x.data, x.ora || '23:59');
  const sfMine = x => !!me() && x.by === me().id;
  const sfRisp = x => (S().risp || []).filter(r => r.sid === x.id);
  const sfMyRisp = x => !!me() && (S().risp || []).find(r => r.sid === x.id && r.uid === me().id);
  const sfSeesNames = x => isAdmin() || sfMine(x);
  const sfInvitato = x => !!me() && !!x.privata && (x.invitati || []).includes(me().id);
  const sfMax = x => Number(x.max) || (x.modo === 'sesso' ? (Number(x.cercaM) || 0) + (Number(x.cercaF) || 0) : Number(x.cercaTot) || 0);
  const sfConf = x => ({ M: (x.conf && x.conf.M) || 0, F: (x.conf && x.conf.F) || 0, tot: (x.conf && x.conf.tot) || 0 });
  const sfFull = x => sfConf(x).tot >= sfMax(x);
  const sfByName = x => x.byName || userName(x.by);
  const sfWhen = x => `${T("{0} · ore", [fmtDate(x.data, true)])} ${esc(x.ora || '')}`;
  const sfTipo = x => (x.tipo === 'torneo' ? `${T("Torneo ·")} ${SF_FORMATI[x.formato] || ''}` : T("Gioco libero"));
  const SF_STATI = { attesa: [T("Da confermare"), 'warn'], confermata: [T("Confermata"), 'ok'], rifiutata: [T("Non confermata"), ''], non_confermata: [T("Non confermata"), ''], ritirata: [T("Ritirata"), ''] };
  const sfStatoBadge = r => (r ? `<span class="badge ${SF_STATI[r.stato][1]}">${SF_STATI[r.stato][0]}</span>` : '');

  // Posti cercati e confermati (lo vedono tutti, senza nomi).
  function sfSeats(x) {
    const c = sfConf(x);
    const parts = x.modo === 'sesso'
      ? [`${T("uomini")} <strong>${c.M}</strong>/${Number(x.cercaM) || 0}`, `${T("donne")} <strong>${c.F}</strong>/${Number(x.cercaF) || 0}`]
      : [`${T("persone")} <strong>${c.tot}</strong>/${Number(x.cercaTot) || 0}`];
    return `<p class="sf-seats">${T("{0} Confermati: {1}", [icon('users'), parts.join(' · ')])} <span class="muted small">${T("(massimo {0})", [sfMax(x)])}</span></p>`;
  }

  // Conteggi confermati (candidature confermate + giocatori aggiunti dall'organizzatore), salvati nella sfida.
  function sfCount(x) {
    const ok = sfRisp(x).filter(r => r.stato === 'confermata').flatMap(r => [r.sesso].concat(r.partner ? [partnerSex(r.partner)] : [])).concat((x.guests || []).map(g => g.sesso));
    return { M: ok.filter(g => g === 'M').length, F: ok.filter(g => g === 'F').length, tot: ok.length };
  }
  const sfErr = e => toast(e && e.code === 'permission-denied' ? T("Operazione non consentita.") : T("Errore di collegamento al database") + (e && e.code ? ` (${e.code})` : '') + '.', 'err');

  // Inviti alle sfide private: si scelgono gli utenti registrati (anche da un gruppo salvato).
  function invitePicker(sel) {
    const u = me(), set = new Set(sel || []);
    const people = S().users.filter(p => registered(p) && (!u || p.id !== u.id))
      .sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
    const groups = S().gruppi || [];
    return `<fieldset class="invite-box"><legend>${T("Chi inviti")}</legend>
      ${groups.length ? `<p class="small invite-groups">${T("I tuoi gruppi:")} ${groups.map(g => `<span class="chip"><button type="button" class="link" data-action="gruppo-usa" data-id="${g.id}">${icon('users-group')} ${esc(g.nome)} (${g.membri.length})</button>
        <button type="button" class="link danger" data-action="gruppo-elimina" data-id="${g.id}" title="${T("Elimina il gruppo")}" aria-label="${T("Elimina il gruppo")}">×</button></span>`).join(' ')}</p>` : ''}
      <input type="search" placeholder="${T("Cerca un giocatore")}" data-invite-filter aria-label="${T("Cerca un giocatore")}">
      <div class="invite-list">${people.map(p => `<label class="check" data-name="${esc((p.nome + ' ' + p.cognome + ' ' + p.cognome).toLowerCase())}"><input type="checkbox" name="invitati" value="${p.id}" ${set.has(p.id) ? 'checked' : ''}> ${esc(p.cognome + ' ' + p.nome)}</label>`).join('') || `<p class="muted small">${T("Nessun utente registrato.")}</p>`}</div>
      <div class="row invite-save"><label>${T("Salva gli invitati scelti come gruppo")}<input name="gruppoNome" maxlength="60" placeholder="${T("Nome del gruppo, es. Giovedì sera")}"></label>
        <button type="button" class="btn small" data-action="gruppo-salva">${T("{0} Salva gruppo", [icon('device-floppy')])}</button></div>
      <p class="muted small">${T("La sfida privata la vedono solo le persone invitate: ricevono l’avviso e possono entrare direttamente.")}</p>
    </fieldset>`;
  }
  const readInvitati = f => [...f.querySelectorAll('input[name=invitati]:checked')].map(el => el.value);

  // Avvisi per i registrati: sfide aperte (e inviti), nuovi tornei. "Non mi interessa" li nasconde.
  function notifList() {
    const u = me();
    if (!u || u.pending || !Store.ready) return [];
    const hid = new Set(S().nascosti || []), out = [];
    (S().sfide || []).forEach(x => {
      if (x.stato !== 'aperta' || sfPast(x) || sfMine(x) || sfMyRisp(x) || hid.has('s:' + x.id) || sfFull(x)) return;
      const inv = x.privata && (x.invitati || []).includes(u.id);
      if (x.privata && !inv) return;
      if (!inv && (!levelOk(x.livelli, u.id) || legaError(x.lega, [u.id]) || (x.modo === 'sesso' && !(Number(u.sesso === 'M' ? x.cercaM : x.cercaF) > 0)))) return;
      out.push({ k: 's:' + x.id, tipo: inv ? 'invito' : 'sfida', x });
    });
    (S().tournaments || []).forEach(t => {
      if (!t.iscrizioniAperte || t.seeds || t.closed || hid.has('t:' + t.id)) return;
      if (t.entries.some(e => e.p1 === u.id || e.p2 === u.id)) return;
      if (genderError(t, [u.id]) || levelError(t.livelli, [u.id]) || legaError(t.lega, [u.id])) return;
      out.push({ k: 't:' + t.id, tipo: 'torneo', t });
    });
    return out;
  }
  function notifCard(n) {
    const no = `<button class="btn small" data-action="notif-no" data-k="${n.k}">${T("Non mi interessa")}</button>`;
    if (n.tipo === 'torneo') {
      const t = n.t;
      return `<div class="notice notif">${icon('trophy')} <span><strong>${T("Nuovo torneo")}:</strong> ${esc(t.nome)} — ${fmtDate(t.data, true)}${t.luogo ? ' · ' + esc(t.luogo) : ''}</span>
        <span class="notif-btns"><a class="btn small primary" href="#/tornei/${t.id}" data-action="notif-vai">${T("Vai al torneo")}</a>${no}</span></div>`;
    }
    const x = n.x;
    return `<div class="notice notif ${n.tipo === 'invito' ? 'ok' : ''}">${icon(n.tipo === 'invito' ? 'mail-opened' : 'swords')}
      <span>${n.tipo === 'invito' ? `<strong>${T("{0} ti ha invitato a una sfida", [esc(sfByName(x))])}</strong>` : `<strong>${T("Sfida aperta")}</strong> ${T("di {0}", [esc(sfByName(x))])}`}
        — ${sfWhen(x)}${x.luogo ? ' · ' + esc(x.luogo) : ''} · ${esc(sfTipo(x))}</span>
      <span class="notif-btns"><button class="btn small primary" data-action="sf-candida" data-id="${x.id}">${T("Partecipa")}</button>${no}</span></div>`;
  }
  function notifBlock() {
    const list = notifList();
    if (!list.length) return '';
    return `<section class="notif-block">${list.slice(0, 3).map(notifCard).join('')}
      ${list.length > 3 ? `<p><button class="btn small" data-action="notifiche">${T("{0} Tutti gli avvisi ({1})", [icon('bell'), list.length])}</button></p>` : ''}</section>`;
  }

  // Avvisi (home e pagina Sfide).
  function sfideAlerts() {
    const u = me();
    if (!u || u.pending) return '';
    const out = [];
    const mine = (S().sfide || []).filter(x => sfMine(x) && !sfPast(x));
    const pend = mine.reduce((n, x) => n + sfRisp(x).filter(r => r.stato === 'attesa').length, 0);
    if (pend) out.push(`<div class="notice">${icon('swords')} <span>${T("Hai")} <strong>${pend}</strong> ${pend === 1 ? 'candidatura' : 'candidature'} ${T("da valutare per le tue sfide.")}</span> <a class="btn small" href="#/sfide">${T("Vai alle sfide")}</a></div>`);
    (S().risp || []).filter(r => r.uid === u.id && !r.visto && ['non_confermata', 'rifiutata', 'confermata'].includes(r.stato)).forEach(r => {
      const x = (S().sfide || []).find(y => y.id === r.sid);
      if (!x) return;
      const ok = r.stato === 'confermata';
      out.push(`<div class="notice ${ok ? 'ok' : 'warn-box'}" role="alert">${icon(ok ? 'circle-check' : 'alert-triangle')}
        <span>${ok ? `${T("La tua partecipazione alla sfida di")} <strong>${esc(sfByName(x))}</strong> ${T("del {0} è", [sfWhen(x)])} <strong>${T("confermata")}</strong>.`
          : `<strong>${T("Registrazione alla sfida non confermata o non più posti disponibili")}</strong> — ${T("sfida di {0} del {1}.", [esc(sfByName(x)), sfWhen(x)])}`}</span>
        <button class="btn small" data-action="sf-visto" data-id="${r.id}">${T("OK")}</button></div>`);
    });
    return out.join('');
  }

  // Blocco della home: sfide aperte a cui ci si può candidare.
  function sfideHomeBlock() {
    const list = (S().sfide || []).filter(x => x.stato === 'aperta' && !sfPast(x) && !sfFull(x) && !sfMine(x) && !sfMyRisp(x)).slice(0, 4);
    return `<section>${sectionHead(T("Sfide aperte"), '<a href="#/sfide">' + T("Tutte") + '</a>')}
      ${list.length ? `<div class="grid">${list.map(sfCard).join('')}</div>` : empty(T("Nessuna sfida aperta al momento: lanciane una tu!"), 'swords')}</section>`;
  }

  function sfCard(x) {
    const u = me(), mine = sfMine(x), my = sfMyRisp(x), past = sfPast(x);
    const risp = sfRisp(x), conf = risp.filter(r => r.stato === 'confermata'), pend = risp.filter(r => r.stato === 'attesa');
    const t = x.tid && S().tournaments.find(y => y.id === x.tid);
    const canManage = mine || isAdmin();
    const pill = x.stato === 'chiusa' ? '<span class="badge">' + T("Chiusa") + '</span>' : past ? '<span class="badge">' + T("Passata") + '</span>' : sfFull(x) ? '<span class="badge live">' + T("Completa") + '</span>' : '<span class="badge ok">' + T("Aperta") + '</span>';
    let me_ = '';
    if (my) {
      me_ = `<p>${sfStatoBadge(my)} ${['attesa', 'confermata'].includes(my.stato) && !past ? `<button class="btn small danger" data-action="sf-ritira" data-id="${my.id}">${T("Ritira la candidatura")}</button>` : ''}</p>`;
    } else if (!mine && x.stato === 'aperta' && !past) {
      me_ = !u ? '<p><a class="btn small" href="#/profilo">' + T("Accedi per partecipare") + '</a></p>'
        : sfFull(x) ? '<p class="muted small">' + T("Posti esauriti.") + '</p>'
        : `<p><button class="btn primary small" data-action="sf-candida" data-id="${x.id}">${icon('hand-finger')} ${sfCoppie(x) ? T("Partecipa con il tuo compagno/a") : T("Partecipa")}</button></p>`;
    }
    const invited = x.privata && sfSeesNames(x) ? `<p class="small muted">${icon('mail')} ${T("Invitati")}: ${(x.invitati || []).map(id => esc(userName(id))).join(', ')}</p>` : '';
    const names = sfSeesNames(x) ? `${invited}<div class="sf-people">
        <p class="small"><strong>${T("Partecipanti confermati")}</strong></p>
        <ul class="plain small"><li>${esc(sfByName(x))}${x.partner ? ` + ${esc(partnerName(x.partner))}` : ''} <span class="muted">${T("· organizzatore")}</span></li>
          ${conf.map(r => `<li>${esc(r.nome)} <span class="muted">${r.sesso}</span>${r.partner ? ` + ${esc(partnerName(r.partner))} <span class="muted">${partnerSex(r.partner)}</span>` : ''}${canManage && !x.tid ? ` <button class="link danger" data-action="sf-risp" data-id="${r.id}" data-v="rifiutata">${T("togli")}</button>` : ''}</li>`).join('')}
          ${(x.guests || []).map((g, i) => `<li>${esc(g.nome + ' ' + g.cognome)} <span class="muted">${T("{0} · non registrato", [g.sesso])}</span>${canManage && !x.tid ? ` <button class="link danger" data-action="sf-guest-del" data-id="${x.id}" data-i="${i}">${T("togli")}</button>` : ''}</li>`).join('')}</ul>
        ${pend.length ? `<p class="small"><strong>${T("Candidature da valutare")}</strong></p><ul class="plain small">${pend.map(r => `<li>${esc(r.nome)} <span class="muted">${r.sesso}</span>${r.partner ? ` + ${esc(partnerName(r.partner))} <span class="muted">${partnerSex(r.partner)}</span>` : ''}
          <button class="btn small primary" data-action="sf-risp" data-id="${r.id}" data-v="confermata">${T("Accetta")}</button>
          <button class="btn small" data-action="sf-risp" data-id="${r.id}" data-v="rifiutata">${T("Rifiuta")}</button></li>`).join('')}</ul>` : ''}
      </div>` : '';
    const manage = canManage ? `<div class="actions wrap">
        ${x.stato === 'aperta' && !x.tid ? `<button class="btn small" data-action="sf-guest" data-id="${x.id}">${T("{0} Aggiungi un non registrato", [icon('user-plus')])}</button>
          <button class="btn small primary" data-action="sf-chiudi" data-id="${x.id}">${T("{0} Chiudi la sfida", [icon('lock')])}</button>` : ''}
        ${!x.tid ? `<button class="btn small" data-action="sf-modifica" data-id="${x.id}">${T("{0} Modifica", [icon('edit')])}</button>` : ''}
        ${x.stato === 'chiusa' && !x.tid ? `<button class="btn small" data-action="sf-riapri" data-id="${x.id}">${T("{0} Riapri", [icon('lock-open')])}</button>` : ''}
        ${x.tipo === 'torneo' ? (t ? `<a class="btn small primary" href="#/tornei/${t.id}">${T("{0} Vai al torneo", [icon('trophy')])}</a>`
          : `<button class="btn small primary" data-action="sf-torneo" data-id="${x.id}">${T("{0} Crea il torneo della sfida", [icon('tournament')])}</button>`) : ''}
        <button class="btn small danger" data-action="sf-elimina" data-id="${x.id}">${T("{0} Elimina", [icon('trash')])}</button></div>` : (t ? `<p><a class="btn small" href="#/tornei/${t.id}">${T("{0} Vai al torneo", [icon('trophy')])}</a></p>` : '');
    return `<article class="card sf-card ${mine ? 'mine' : ''}">
      <p class="kicker">${pill} ${x.privata ? `<span class="badge">${icon('lock')} ${T("Privata")}</span>` : ''} ${esc(sfTipo(x))}</p>
      <h3>${sfWhen(x)}</h3>
      <p class="muted small">${icon('map-pin')} ${esc(x.luogo || '—')} · ${Number(x.campi) === 2 ? T("2 campi") : T("1 campo")} · ${T("lanciata da")} <strong>${esc(sfByName(x))}</strong></p>
      ${x.lega && legaById(x.lega) ? `<p class="small">${T("{0} Lega:", [icon('trophy')])} <a href="#/leghe/${x.lega}">${esc(legaById(x.lega).nome)}</a></p>` : ''}
      ${x.livelli && x.livelli.length ? `<p class="small">${T("{0} Livelli:", [icon('stairs')])} <strong>${esc(levelsText(x.livelli))}</strong></p>` : ''}
      ${x.nota ? `<p class="small">${esc(x.nota)}</p>` : ''}
      ${sfSeats(x)}
      ${me_}${names}${manage}
    </article>`;
  }

  function sfForm() {
    const f = ui.sfForm || {};
    const pts = [9, 11, 15, 21].map(p => `<option ${p === 11 ? 'selected' : ''}>${p}</option>`).join('');
    return `<details class="card sf-new" ${ui.sfOpen ? 'open' : ''}><summary>${icon('plus')} <strong>${T("Lancia una sfida")}</strong></summary>
      <form data-form="sfida" class="sf-form">
        <div class="row">
          <label>${T("Data")}${dateField('data', f.data || todayKey(), { required: true, min: todayKey() })}</label>
          <label>${T("Ora")}<input type="time" name="ora" required value="${f.ora || '18:00'}"></label>
          <label>${T("Campi")}<select name="campi"><option value="1">${T("1 campo")}</option><option value="2">${T("2 campi")}</option></select></label>
        </div>
        <label>${T("Luogo")}<input name="luogo" maxlength="80" placeholder="${T("Centro sportivo / indirizzo")}"></label>
        <label>${T("Chi può vederla")}<select name="vis" data-change="sf-form"><option value="pubblica">${T("Pubblica: tutti gli iscritti all’app")}</option><option value="privata">${T("Privata: solo le persone che inviti")}</option></select></label>
        <div data-sf-vis hidden>${invitePicker([])}</div>
        <label>${T("Chi cerchi")}<select name="modo" data-change="sf-form"><option value="sesso">${T("Uomini e donne (numero per sesso)")}</option><option value="indifferente">${T("Indifferente")}</option></select></label>
        <div class="row">
          <label data-sf="sesso">${T("Uomini cercati")}<input type="number" min="0" max="40" name="cercaM" value="2"></label>
          <label data-sf="sesso">${T("Donne cercate")}<input type="number" min="0" max="40" name="cercaF" value="2"></label>
          <label data-sf="indifferente" hidden>${T("Persone cercate")}<input type="number" min="1" max="80" name="cercaTot" value="3"></label>
          <label>${T("Numero massimo di persone")}<input type="number" min="1" max="80" name="max" value="4"></label>
        </div>
        <label>${T("Tipo di sfida")}<select name="tipo" data-change="sf-form"><option value="libero">${T("Gioco libero")}</option><option value="torneo">${T("Torneo")}</option></select></label>
        <fieldset data-sf="torneo" hidden><legend>${T("Torneo")}</legend>
          <label>${T("Formula")}<select name="formato" data-change="sf-form">${Object.entries(SF_FORMATI).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <div class="row">
            <label data-sf-f="gironi_ko">${T("Squadre per girone")}<input type="number" min="2" max="8" name="poolSize" value="4"></label>
            <label data-sf-f="gironi_ko">${T("Squadre che passano per girone")}<input type="number" min="1" max="4" name="qualify" value="2"></label>
            <label data-sf-f="girone_unico,gironi_ko,americana">${T("Punti per set")}<select name="punti">${pts}</select></label>
            <label data-sf-f="americana,americana_tempo">${T("Turni")}<input type="number" min="1" max="20" name="turni" value="5"></label>
            <label data-sf-f="americana_tempo">${T("Minuti per gara")}<input type="number" min="3" max="60" name="minuti" value="12"></label>
          </div>
          <div data-sf-f="girone_unico,gironi_ko">${partnerFields([me() ? me().id : ''], T("Il tuo compagno/a (le coppie restano fisse per tutto il torneo)"))}</div>
          <label data-sf-f="americana,americana_tempo">${T("Uomini e donne")}<select name="vincolo">${Object.entries(Logic.VINCOLI).map(([k, l]) => `<option value="${k}" ${k === 'equilibrato' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">${T("Nel girone unico e nei gironi le coppie sono fisse: ci si candida già in coppia (anche con un compagno non registrato). Nell’americana il compagno cambia a ogni partita.\n            Quando la sfida è pronta premi “Crea il torneo della sfida”: avrai la Scheda del torneo, gli iscritti (anche non registrati), il sorteggio delle gare e, nell’americana a tempo, il timer.")}</p>
        </fieldset>
        ${levelsBox([], T("Solo i giocatori di questi livelli possono partecipare. Nessuna casella = aperta a tutti i livelli."))}
        <div data-sf="torneo" hidden>${legaSelect(ui.sfLega || '', T("Lega (sfida a torneo della lega: partecipano solo i giocatori abilitati)"))}</div>
        <label>${T("Note (facoltative)")}<textarea name="nota" rows="2" maxlength="300"></textarea></label>
        <p class="form-error" hidden></p>
        <div class="actions"><button class="btn primary">${T("{0} Lancia la sfida", [icon('swords')])}</button></div>
      </form></details>`;
  }

  function syncSfForm() {
    const f = document.querySelector('form.sf-form');
    if (!f) return;
    const modo = f.elements.modo.value, tipo = f.elements.tipo.value, fmt = f.elements.formato.value;
    f.querySelectorAll('[data-sf]').forEach(el => { el.hidden = el.dataset.sf === 'torneo' ? tipo !== 'torneo' : el.dataset.sf !== modo; });
    f.querySelectorAll('[data-sf-f]').forEach(el => { el.hidden = !el.dataset.sfF.split(',').includes(fmt); });
    f.querySelectorAll('[data-sf-vis]').forEach(el => { el.hidden = f.elements.vis.value !== 'privata'; });
  }

  function viewSfide() {
    const u = me(), all = (S().sfide || []).filter(x => !sfPast(x) || (x.by === (u && u.id)) || isAdmin()).filter(x => x.data >= addDays(todayKey(), -7));
    const mine = all.filter(sfMine), joined = all.filter(x => !sfMine(x) && sfMyRisp(x)), others = all.filter(x => !sfMine(x) && !sfMyRisp(x) && !sfPast(x));
    const sec = (title, list, none) => `<section>${sectionHead(`${title} (${list.length})`)}${list.length ? `<div class="grid">${list.map(sfCard).join('')}</div>` : empty(none, 'swords')}</section>`;
    setTimeout(syncSfForm, 0);
    return `
      ${sfideAlerts()}
      ${sectionHead(`<span class="h1">${T("{0} Sfide", [icon('swords')])}</span>`)}
      <p class="muted">${T("Lancia una sfida e trova i giocatori che ti mancano, oppure partecipa a quelle degli altri. Chi lancia la sfida conferma i partecipanti.")}</p>
      ${u ? (u.pending ? '' : sfForm()) : `<div class="notice">${icon('info-circle')} <span>${T("Per lanciare una sfida o partecipare")} <a href="#/profilo">${T("accedi o registrati")}</a>.</span></div>`}
      ${u ? sec(T("Le mie sfide"), mine, T("Non hai sfide in programma.")) : ''}
      ${u ? sec(T("Sfide a cui partecipo"), joined, T("Nessuna candidatura.")) : ''}
      ${sec(isAdmin() ? T("Altre sfide") : T("Sfide aperte"), others, T("Nessuna sfida aperta al momento."))}`;
  }

  // Coppie per i gironi: a sorte, quando possibile uomo + donna.
  function sfPairs(ids, sexOf, misto) {
    const sh = a => a.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
    let pairs = [];
    if (misto) {
      const M = sh(ids.filter(id => sexOf(id) === 'M')), F = sh(ids.filter(id => sexOf(id) !== 'M'));
      while (M.length && F.length) pairs.push([M.pop(), F.pop()]);
      const rest = M.concat(F);
      while (rest.length) pairs.push([rest.pop(), rest.pop() || null]);
    } else {
      const l = sh(ids.slice());
      while (l.length) pairs.push([l.pop(), l.pop() || null]);
    }
    return pairs;
  }

  // Crea il torneo della sfida: partecipanti confermati + organizzatore + non registrati.
  function sfCreaTorneo(x) {
    const s = S(), c = x.cfg || {};
    const ids = [x.by].concat(sfRisp(x).filter(r => r.stato === 'confermata').map(r => r.uid));
    (x.guests || []).forEach(g => ids.push(playerFor(g).id));
    const players = [...new Set(ids)].filter(id => s.users.some(u => u.id === id));
    const sexOf = id => (s.users.find(u => u.id === id) || {}).sesso;
    const individual = x.formato === 'americana' || x.formato === 'americana_tempo';
    const config = Object.assign(Logic.defaultConfig(), {
      sets: 1, punti: Number(c.punti) || 11, puntiDecisivo: Number(c.punti) || 11, poolSize: Number(c.poolSize) || 4, qualify: Number(c.qualify) || 2,
      turni: Number(c.turni) || 5, campi: Number(x.campi) || 1, minuti: Number(c.minuti) || 12, vincolo: c.vincolo || 'equilibrato', squadre: 'rotazione', criterio: 'punti'
    });
    const t = Logic.normalize({
      id: Store.uid('t'), nome: `${T("Sfida {0} {1}", [itDate(x.data), x.ora])}${x.luogo ? ' · ' + x.luogo : ''}`, data: x.data, luogo: x.luogo || '',
      categoriaId: 'custom', puntiRows: s.settings.sfidePunti || Logic.SFIDE_PUNTI, coefficiente: 1,
      disciplina: 'doppio', genere: c.vincolo === 'misto' ? 'misto' : 'open', formato: x.formato, maxIscritti: 0, iscrizioniAperte: false,
      descrizione: x.nota || '', owner: x.by, sfida: x.id, config, entries: [], livelli: x.livelli || [], lega: x.lega || ''
    });
    if (individual) t.entries = players.map(id => ({ id: Store.uid('e'), p1: id, p2: null, guest: null, livello: null }));
    else {
      // coppie fisse: organizzatore + compagno, poi ogni coppia confermata; chi è rimasto senza compagno si abbina a sorte
      const used = new Set(), pairs = [];
      const pid = pa => (!pa ? null : pa.uid ? pa.uid : playerFor(pa).id);
      const add = (a, b) => { if (!a || used.has(a) || (b && used.has(b))) return; used.add(a); if (b) used.add(b); pairs.push([a, b]); };
      add(x.by, pid(x.partner));
      sfRisp(x).filter(r => r.stato === 'confermata').forEach(r => add(r.uid, pid(r.partner)));
      const full = pairs.filter(p => p[1]);
      const rest = pairs.filter(p => !p[1]).map(p => p[0]).concat(players.filter(id => !used.has(id)));
      t.entries = full.concat(sfPairs(rest, sexOf, true)).map(([a, b]) => ({ id: Store.uid('e'), p1: a, p2: b, guest: null, livello: null }));
    }
    s.tournaments.push(t);
    return t;
  }

  // ====================================================================
  // LEGHE
  // Una lega raccoglie tornei e sfide a torneo con una classifica propria (Tornei, Tornei challenge, Generale),
  // separata dalle altre. La crea l'admin, che sceglie gli admin di lega; admin e admin di lega aggiungono
  // tornei e sfide, abilitano i giocatori (gli altri vedono ma non partecipano) e chiudono la lega.
  // ====================================================================
  const legaById = id => (S().leghe || []).find(l => l.id === id);
  const isLegaAdmin = l => !!l && !!me() && (isAdmin() || (l.admins || []).includes(me().id));
  const myLeghe = () => (S().leghe || []).filter(l => l.stato !== 'chiusa' && isLegaAdmin(l));
  const isMembro = (l, uid) => !!l && (l.membri || []).includes(uid);
  const registered = u => !!u && u.id.length >= 20;   // account dell'app (gli UID di Firebase sono lunghi)
  const legaTornei = l => S().tournaments.filter(t => t.lega === l.id);
  // Messaggio se un giocatore non è abilitato alla lega del torneo o della sfida (null = va bene).
  function legaError(lid, uids) {
    const l = lid && legaById(lid);
    if (!l) return null;
    if (l.stato === 'chiusa') return `${T("La lega “{0}” è chiusa.", [l.nome])}`;
    const bad = uids.filter(Boolean).find(id => !isMembro(l, id));
    if (!bad) return null;
    return me() && bad === me().id ? `${T("Questa gara fa parte della lega “{0}”: partecipano solo i giocatori abilitati dall’admin della lega.", [l.nome])}`
      : `${T("{0} non è abilitato/a alla lega “{1}”.", [userName(bad), l.nome])}`;
  }
  const legaSelect = (cur, label) => {
    const list = myLeghe();
    const curL = cur && legaById(cur);
    if (curL && !list.includes(curL)) list.push(curL);
    if (!list.length) return '';
    return `<label>${label || T("Lega")}<select name="lega"><option value="">${T("Nessuna lega")}</option>${list.map(l => `<option value="${l.id}" ${l.id === cur ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>`;
  };

  function legaRanking(l, kind) {
    if (l.stato === 'chiusa' && l.finale && l.finale[kind]) return l.finale[kind];
    return Logic.ranking(S(), { lega: l.id, kind });
  }

  function viewLeghe() {
    const list = (S().leghe || []).slice().sort((a, b) => (a.stato === 'chiusa') - (b.stato === 'chiusa') || (a.nome || '').localeCompare(b.nome || ''));
    const u = me();
    return `
      ${sectionHead(`<span class="h1">${T("{0} Leghe", [icon('shield')])}</span>`, isAdmin() ? `<button class="btn primary" data-action="lega-new">${T("{0} Nuova lega", [icon('plus')])}</button>` : '')}
      <p class="muted">${T("Una lega è un insieme di tornei e sfide con una classifica tutta sua. Partecipano i giocatori abilitati dall’admin della lega; tutti possono seguirla.")}</p>
      ${list.length ? `<div class="grid">${list.map(l => {
        const n = legaTornei(l).length;
        return `<a class="card tour-card" href="#/leghe/${l.id}">${legaLogo(l, 52) || `<span class="lega-logo none">${icon('shield')}</span>`}<div class="tour-main"><h3>${esc(l.nome)}</h3>
          <p class="muted small">${n}${l.previsti ? ` di ${l.previsti}` : ''} ${n === 1 ? 'torneo' : 'tornei'} · ${(l.membri || []).length} giocatori</p>
          <p class="small">${l.stato === 'chiusa' ? '<span class="badge">' + T("Conclusa") + '</span>' : '<span class="badge ok">' + T("In corso") + '</span>'}
            ${u && isMembro(l, u.id) ? '<span class="badge live">' + T("Sei abilitato") + '</span>' : ''}${isLegaAdmin(l) && !isAdmin() ? '<span class="badge">' + T("Sei admin di lega") + '</span>' : ''}</p></div>${icon('chevron-right')}</a>`;
      }).join('')}</div>` : empty(T("Nessuna lega per ora."), 'trophy')}`;
  }

  function legaTable(l, kind) {
    const rows = legaRanking(l, kind);
    if (!rows.length) return empty(l.stato === 'chiusa' ? T("Nessun punto assegnato.") : T("La classifica si riempie quando si concludono i tornei della lega."), 'chart-bar');
    const closed = l.stato === 'chiusa';
    return `<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>${T("Giocatore")}</th><th>${T("Punti")}</th><th>${T("Tornei")}</th><th>${T("Miglior posizione")}</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${closed && i < 3 ? "medal m" + (i + 1) : ''}"><td>${i + 1}</td>
        <td class="name"><button class="link" data-action="player" data-id="${r.id}">${esc(r.nome || userName(r.id))}</button></td><td><strong>${r.total}</strong></td><td>${r.events}</td><td>${r.best ? r.best + '°' : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function viewLega(id) {
    const l = legaById(id);
    if (!l) return empty(T("Lega non trovata."), 'alert-circle');
    const mgr = isLegaAdmin(l), closed = l.stato === 'chiusa', u = me();
    const tabs = [['classifica', T("Classifica")], ['tornei', T("Tornei e sfide")], ['giocatori', `${T("Giocatori (")}${(l.membri || []).length})`]].concat(mgr ? [['gestione', T("Gestione")]] : []);
    let tab = (ui.legaTab || {})[id];
    if (!tabs.some(x => x[0] === tab)) tab = 'classifica';
    let body = '';
    if (tab === 'classifica') {
      const kind = (ui.legaKind || {})[id] || 'generale';
      const btn = (k, lab) => `<button class="${k === kind ? 'on' : ''}" data-action="lega-kind" data-id="${l.id}" data-k="${k}">${lab}</button>`;
      body = `<div class="bands" role="group">${btn('generale', T("Generale"))}${btn('tornei', T("Tornei"))}${btn('challenge', T("Tornei challenge"))}</div>
        ${closed ? `<p class="notice ok">${icon('flag-check')} <span>${T("Lega conclusa")}${l.chiusaIl ? ' il ' + fmtDate(l.chiusaIl) : ''}: <strong>${T("classifica finale")}</strong>.</span></p>` : ''}
        ${legaTable(l, kind)}
        <p class="muted small">${T("Generale = somma dei punti dei tornei e dei tornei challenge (le sfide a torneo) della lega. Ogni giocatore prende metà dei punti di coppia. I tornei della lega non contano nelle altre classifiche.")}</p>`;
    } else if (tab === 'tornei') {
      const ts = legaTornei(l).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      const sf = (S().sfide || []).filter(x => x.lega === l.id && !x.tid && !sfPast(x));
      const free = S().tournaments.filter(t => !t.lega && !t.closed);
      body = `${mgr && !closed ? `<div class="actions wrap">
          <button class="btn primary" data-action="lega-tour" data-id="${l.id}">${T("{0} Nuovo torneo della lega", [icon('plus')])}</button>
          <button class="btn" data-action="lega-sfida" data-id="${l.id}">${T("{0} Nuova sfida a torneo della lega", [icon('swords')])}</button>
          ${free.length ? `<select data-change="lega-add-tour" data-id="${l.id}" aria-label="${T("Aggiungi un torneo esistente")}"><option value="">${T("Aggiungi un torneo esistente…")}</option>${free.map(t => `<option value="${t.id}">${esc(t.nome)} · ${fmtDate(t.data)}</option>`).join('')}</select>` : ''}
        </div>` : ''}
        <p class="muted small">${ts.length}${l.previsti ? ` ${T("di {0} tornei previsti", [l.previsti])}` : ' tornei'} ${T("nella lega.")}</p>
        ${ts.length ? `<div class="grid">${ts.map(t => tourCard(t) + (mgr && !closed && !t.closed ? `<p class="small"><button class="link danger" data-action="lega-remove-tour" data-id="${t.id}">${T("togli dalla lega")}</button></p>` : '')).join('')}</div>` : empty(T("Nessun torneo ancora."), 'trophy')}
        ${sf.length ? `<h3>${T("Sfide a torneo aperte")}</h3><div class="grid">${sf.map(sfCard).join('')}</div>` : ''}`;
    } else if (tab === 'giocatori') {
      const mem = (l.membri || []).map(uid => S().users.find(x => x.id === uid)).filter(Boolean).sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
      const others = S().users.filter(x => registered(x) && !isMembro(l, x.id)).sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
      body = `${mgr && !closed ? `<div class="actions wrap"><select data-change="lega-add-membro" data-id="${l.id}" aria-label="${T("Abilita un giocatore")}"><option value="">${T("Abilita un giocatore registrato…")}</option>
          ${others.map(x => `<option value="${x.id}">${esc(x.cognome + ' ' + x.nome)}${x.livello ? ' · ' + levelName(x.livello) : ''}</option>`).join('')}</select></div>` : ''}
        ${u && !mgr ? `<p class="notice">${icon(isMembro(l, u.id) ? 'circle-check' : 'eye')} <span>${isMembro(l, u.id) ? T("Sei abilitato a giocare in questa lega.") : T("Puoi seguire la lega, ma per partecipare devi essere abilitato dall’admin della lega.")}</span></p>` : ''}
        ${mem.length ? `<ul class="plain">${mem.map(x => `<li>${esc(x.cognome + ' ' + x.nome)} <span class="muted small">${x.sesso || ''}${x.livello ? ' · ' + levelName(x.livello) : ''}</span>
          ${mgr && !closed ? ` <button class="link danger" data-action="lega-del-membro" data-id="${l.id}" data-uid="${x.id}">${T("togli")}</button>` : ''}</li>`).join('')}</ul>` : empty(T("Nessun giocatore abilitato."), 'users')}`;
    } else if (tab === 'gestione') {
      const regs = S().users.filter(registered).sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
      body = `<form data-form="lega" class="card scheda"><input type="hidden" name="id" value="${l.id}">
          <label>${T("Nome della lega")}<input name="nome" required maxlength="80" value="${esc(l.nome)}"></label>
          <label>${T("Descrizione")}<textarea name="descrizione" rows="3">${esc(l.descrizione || '')}</textarea></label>
          <label>${T("Tornei previsti (0 = non definito)")}<input type="number" min="0" max="100" name="previsti" value="${l.previsti || 0}"></label>
          <div class="lega-logo-edit"><span>${legaLogo(l, 64) || `<span class="lega-logo none">${icon('shield')}</span>`}</span>
            <label class="btn small">${icon('photo')} ${l.logo ? T("Cambia logo") : T("Carica il logo della lega")}<input type="file" accept="image/*" data-change="lega-logo" data-id="${l.id}" hidden></label>
            ${l.logo ? `<button type="button" class="btn small danger" data-action="lega-logo-del" data-id="${l.id}">${T("Togli logo")}</button>` : ''}</div>
          ${isAdmin() ? `<fieldset><legend>${T("Admin di lega")}</legend><p class="muted small">${T("Gestiscono questa lega: tornei, sfide, giocatori abilitati e chiusura.")}</p>
            ${regs.map(x => `<label class="check"><input type="checkbox" name="admins" value="${x.id}" ${(l.admins || []).includes(x.id) ? 'checked' : ''}> ${esc(x.cognome + ' ' + x.nome)}</label>`).join('')}</fieldset>` : ''}
          <div class="actions"><button class="btn primary">${T("{0} Salva", [icon('device-floppy')])}</button></div></form>
        <div class="card"><h3>${closed ? T("Lega conclusa") : T("Chiusura della lega")}</h3>
          <p class="muted small">${closed ? T("La classifica finale è congelata. Se riapri la lega torna a contare i tornei.") : T("Quando i tornei previsti sono finiti chiudi la lega: la classifica di quel momento diventa la classifica finale.")}</p>
          <div class="actions">${closed ? `<button class="btn" data-action="lega-riapri" data-id="${l.id}">${T("{0} Riapri la lega", [icon('lock-open')])}</button>`
            : `<button class="btn primary" data-action="lega-chiudi" data-id="${l.id}">${T("{0} Chiudi la lega con la classifica finale", [icon('flag-check')])}</button>`}
          ${isAdmin() ? `<button class="btn danger" data-action="lega-elimina" data-id="${l.id}">${T("{0} Elimina la lega", [icon('trash')])}</button>` : ''}</div></div>`;
    }
    return `
      <p><a href="#/leghe">${T("{0} Leghe", [icon('arrow-left')])}</a></p>
      <div class="lega-head">${legaLogo(l, 84)}<h1>${esc(l.nome)}</h1></div>
      <p class="chips">${closed ? '<span class="badge">' + T("Conclusa") + '</span>' : '<span class="badge ok">' + T("In corso") + '</span>'}<span class="chip">${legaTornei(l).length}${l.previsti ? '/' + l.previsti : ''} tornei</span>
        <span class="chip">${T("Admin di lega:")} ${(l.admins || []).length ? esc((l.admins || []).map(userName).join(', ')) : '—'}</span></p>
      ${l.descrizione ? `<p>${esc(l.descrizione)}</p>` : ''}
      <nav class="tabs">${tabs.map(([k, lab]) => `<button class="${k === tab ? 'on' : ''} ${k === 'gestione' ? 'tab-admin' : ''}" data-action="lega-tab" data-id="${l.id}" data-tab="${k}">${lab}</button>`).join('')}</nav>
      <div class="tab-body">${body}</div>`;
  }

  // ---------- classifiche ----------

  function viewRanking() {
    const s = S(), f = ui.rank;
    const list = Logic.ranking(s, f);
    const tabs = Object.entries(Logic.RANK_CATS).map(([k, l]) => `<button class="${k === f.cat ? 'on' : ''}" data-action="rank-cat" data-cat="${k}">${l}</button>`).join('');
    const tables = Object.assign(Object.fromEntries(s.categories.map(c => [c.id, c.nome])), { custom: T("Personalizzate") });
    return `
      <h1>${T("Classifica sociale")}</h1>
      <p class="muted">${T("Classifica interna del circolo: punti del piazzamento × coefficiente, solo nei tornei con punti in palio.\n        I punti delle tabelle sono di coppia: nel doppio (anche americana, fantasma e americana a tempo) ogni giocatore ne riceve metà.\n        Le classifiche")} <strong>${T("generali")}</strong> ${T("sommano tutti i tornei, Open compresi.")}</p>
      <nav class="bands rank-tabs" aria-label="${T("Categoria")}">${tabs}</nav>
      <div class="filters"><label>${T("Tabella punti")}<select data-change="rank" data-key="categoriaId">
        <option value="">${T("Tutte")}</option>${Object.entries(tables).map(([k, v]) => `<option value="${k}" ${k === f.categoriaId ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
      <h2>${Logic.RANK_CATS[f.cat]}</h2>
      ${list.length ? `<div class="table-wrap"><table class="standings ranking">
        <thead><tr><th>#</th><th>${T("Giocatore")}</th><th>${T("Punti")}</th><th>${T("Tornei")}</th><th>${T("Miglior piazz.")}</th><th>${T("Premi")}</th></tr></thead>
        <tbody>${list.map((r, i) => `<tr class="${i < 3 ? "medal m" + (i + 1) : ''}"><td>${i + 1}</td>
          <td class="name"><button class="link" data-action="player" data-id="${r.id}">${esc(userName(r.id))}</button></td>
          <td><strong>${r.total}</strong></td><td>${r.events}</td><td>${r.best}°</td>
          <td class="badges">${Premi.perfBadges(s, r.id, generalPoints(r.id))}</td></tr>`).join('')}</tbody>
      </table></div>` : empty(T("Nessun punto in questa classifica: si popola quando si concludono i tornei della categoria."), 'chart-bar')}`;
  }

  // Punti totali del giocatore (classifica generale del suo sesso), usati per i trofei.
  function generalPoints(uid) {
    const u = S().users.find(x => x.id === uid);
    const r = Logic.ranking(S(), { cat: u && u.sesso === 'F' ? 'generale_f' : 'generale_m' }).find(x => x.id === uid);
    return r ? r.total : 0;
  }

  // Sfide giocate (già passate): lanciate dal giocatore o con la sua candidatura confermata.
  // Le candidature altrui le vede solo l'admin; per gli altri contano le sfide lanciate.
  function playedSfide(uid) {
    const s = S();
    return (s.sfide || []).filter(x => sfPast(x) && (x.by === uid || (s.risp || []).some(r => r.sid === x.id && r.uid === uid && r.stato === 'confermata'))).length;
  }

  // Riquadro premi di un giocatore: stelle (fedeltà), medaglie, trofeo, racchetta.
  function premiBlock(uid, own) {
    const s = S(), m = Logic.medals(s, uid), pts = generalPoints(uid);
    const tr = Premi.trophy(s, pts), ra = Premi.racket(s, m.tornei);
    const n = playedSfide(uid);
    const st = Premi.stars(s, n);
    return `<div class="premi" data-premi="${uid}">
      <div class="premio fedelta"><div class="big-icons">${st ? (st.stelle ? Premi.starIcons(st.stelle) : '☆') : '…'}</div>
        <div><strong>${T("Fedeltà")}</strong><br><span class="small">${st ? `${Premi.starLabel(st.stelle)} · ${n} ${n === 1 ? T("sfida giocata") : T("sfide giocate")}<br><span class="muted">${own ? T("Te ne mancano") : T("Ne mancano")} ${T("{0} per la prossima stella", [st.mancano])}</span>` : T("calcolo in corso…")}</span></div></div>
      <div class="premio"><div class="big-icons medals">${m.oro || m.argento || m.bronzo ? `<span>🥇${m.oro}</span><span>🥈${m.argento}</span><span>🥉${m.bronzo}</span>` : '🎖️'}</div>
        <div><strong>${T("Medagliere")}</strong><br><span class="small">${m.oro + m.argento + m.bronzo ? `${T("{0} ori, {1} argenti, {2} bronzi", [m.oro, m.argento, m.bronzo])}` : T("nessun podio per ora")}</span></div></div>
      <div class="premio"><div class="big-icons lv${tr.livello}">🏆</div>
        <div><strong>${T("Trofeo")} ${tr.nome || '—'}</strong><br><span class="small">${pts} punti${tr.prossima != null ? ` · ${T("prossimo livello a {0}", [tr.prossima])}` : T(" · livello massimo!")}</span></div></div>
      <div class="premio"><div class="big-icons lv${ra.livello}">🏓</div>
        <div><strong>${T("Racchetta")} ${ra.nome || '—'}</strong><br><span class="small">${T("{0} tornei giocati", [m.tornei])}${ra.prossima != null ? ` · ${T("prossimo livello a {0}", [ra.prossima])}` : T(" · livello massimo!")}</span></div></div>
    </div>`;
  }

  function headerBadges(uid) {
    const s = S(), m = Logic.medals(s, uid), tr = Premi.trophy(s, generalPoints(uid)), ra = Premi.racket(s, m.tornei);
    const n = playedSfide(uid), st = Premi.stars(s, n);
    const parts = [];
    parts.push(`<span class="hb-group" title="${T("Fedeltà:")} ${st ? Premi.starLabel(st.stelle) : '…'}">${st && st.stelle ? Premi.starIcons(st.stelle) : '<span class="hb-empty">☆</span>'}</span>`);
    if (m.oro + m.argento + m.bronzo) parts.push(`<span class="hb-group" title="${T("Medagliere")}">${m.oro ? `🥇<b>${m.oro}</b>` : ''}${m.argento ? `🥈<b>${m.argento}</b>` : ''}${m.bronzo ? `🥉<b>${m.bronzo}</b>` : ''}</span>`);
    if (tr.livello) parts.push(`<span class="hb-group lv${tr.livello}" title="${T("Trofeo {0}", [tr.nome])}">🏆</span>`);
    if (ra.livello) parts.push(`<span class="hb-group lv${ra.livello}" title="${T("Racchetta {0}", [ra.nome])}">🏓</span>`);
    return parts.join('<span class="hb-sep"></span>');
  }

  // Le sfide giocate si contano dai dati già caricati: niente da caricare.
  function loadCount() {}

  function playerDialog(id) {
    const u = S().users.find(x => x.id === id);
    if (!u) return;
    const h = Logic.playerHistory(S(), id);
    const sum = Logic.playerSummary(S(), id);
    openDialog(`
      <h2>${esc(u.nome + ' ' + u.cognome)}</h2>
      <p class="muted">${SESSI[u.sesso] || ''}</p>
      ${premiBlock(id, false)}
      <h3>${T("Classifiche")}</h3>
      ${Object.keys(sum).length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>${T("Classifica")}</th><th>${T("Posizione")}</th><th>${T("Punti")}</th><th>${T("Tornei")}</th></tr></thead>
        <tbody>${Object.entries(sum).map(([k, r]) => `<tr class="${k.startsWith('generale') ? 'q' : ''}"><td class="name">${Logic.RANK_CATS[k]}</td><td><strong>${r.pos}°</strong> <span class="muted small">su ${r.of}</span></td><td>${r.total}</td><td>${r.events}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">' + T("Nessun punto in classifica.") + '</p>'}
      <h3>${T("Tornei")}</h3>
      ${h.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>${T("Torneo")}</th><th>${T("Data")}</th><th>${T("Pos.")}</th><th>${T("Punti")}</th></tr></thead>
        <tbody>${h.map(x => `<tr><td class="name"><a href="#/tornei/${x.t.id}" data-action="close-dialog">${esc(x.t.nome)}</a></td><td>${fmtDate(x.t.data)}</td><td>${x.place}°</td><td>${x.pts == null ? '—' : x.pts}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">' + T("Nessun torneo concluso.") + '</p>'}
      <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Chiudi")}</button></div>`);
    loadCount(id);
  }

  // ---------- corsi ----------

  function viewCourses() {
    const list = S().courses.slice().sort((a, b) => (b.promo - a.promo) || (a.inizio || '').localeCompare(b.inizio || ''));
    const cur = list.filter(c => (c.fine || c.inizio) >= todayKey()), past = list.filter(c => (c.fine || c.inizio) < todayKey());
    return `
      ${sectionHead('<span class="h1">' + T("Corsi e lezioni") + '</span>', isAdmin() ? `<button class="btn primary" data-action="course-new">${T("{0} Nuovo", [icon('plus')])}</button>` : '')}
      ${me() ? '' : `<div class="notice">${icon('info-circle')} <span>${T("Per iscriverti")} <a href="#/profilo">${T("accedi o registrati")}</a>.</span></div>`}
      ${cur.length ? `<div class="grid">${cur.map(c => courseCard(c, true)).join('')}</div>` : empty(T("Nessun corso in programma."), 'school')}
      ${past.length && isAdmin() ? `<section>${sectionHead(T("Conclusi"))}<div class="grid">${past.map(c => courseCard(c, true)).join('')}</div></section>` : ''}`;
  }

  function courseForm(c) {
    const v = c || { tipo: 'corso', posti: 8, prezzo: 0, promo: false };
    openDialog(`
      <form data-form="course">
        <input type="hidden" name="id" value="${c ? c.id : ''}">
        <h2>${c ? T("Modifica") : T("Nuovo corso / lezione")}</h2>
        <div class="row">
          <label>${T("Tipo")}<select name="tipo">${[['corso', T("Corso")], ['lezione', T("Lezione")], ['clinic', T("Clinic")]].map(([k, l]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>${T("Livello")}<input name="livello" value="${esc(v.livello)}" placeholder="${T("Principiante, Intermedio…")}"></label>
        </div>
        <label>${T("Titolo")}<input name="titolo" required value="${esc(v.titolo)}"></label>
        <label>${T("Descrizione")}<textarea name="descrizione" rows="3">${esc(v.descrizione)}</textarea></label>
        <div class="row">
          <label>${T("Inizio")}${dateField('inizio', v.inizio || '', { required: true })}</label>
          <label>${T("Fine")}${dateField('fine', v.fine || '')}</label>
        </div>
        <div class="row">
          <label>${T("Giorni e orario")}<input name="orario" value="${esc(v.orario)}" placeholder="${T("Mar e Gio 19:00–20:00")}"></label>
          <label>${T("Istruttore")}<input name="istruttore" value="${esc(v.istruttore)}"></label>
        </div>
        <div class="row">
          <label>${T("Posti")}<input type="number" min="1" name="posti" value="${v.posti}"></label>
          <label>${T("Prezzo (€)")}<input type="number" min="0" step="0.5" name="prezzo" value="${v.prezzo}"></label>
        </div>
        <label class="check"><input type="checkbox" name="promo" ${v.promo ? 'checked' : ''}> ${T("In evidenza (promosso in home)")}</label>
        <div class="actions">
          ${c ? `<button type="button" class="btn danger" data-action="course-delete" data-id="${c.id}">${T("Elimina")}</button>` : ''}
          <button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Salva")}</button>
        </div>
      </form>`);
  }

  // ---------- profilo e accesso ----------

  function viewProfile() {
    const u = me();
    if (!u) return viewAuth();
    const s = S();
    const courses = s.courses.filter(c => c.iscritti.includes(u.id));
    const tours = s.tournaments.filter(t => t.entries.some(e => e.p1 === u.id || e.p2 === u.id));
    return `
      <h1>${T("Ciao {0}", [esc(u.nome)])}</h1>
      <p class="muted">${esc(u.email)}${u.role === 'admin' ? ' · <span class="badge live">' + T("amministratore") + '</span>' : ''}</p>
      <section class="card">
        <h2>${T("{0} I miei premi", [icon('award')])}</h2>
        ${premiBlock(u.id, true)}
      </section>
      <div class="grid two">
        <section class="card">
          <h2>${T("{0} Le mie sfide", [icon('swords')])}</h2>
          ${(() => { const l = (s.sfide || []).filter(x => !sfPast(x) && (x.by === u.id || sfMyRisp(x))); return l.length
            ? `<ul class="plain">${l.map(x => `<li><a href="#/sfide">${fmtDate(x.data)} · ${esc(x.ora)}</a> ${x.by === u.id ? '<span class="badge">' + T("organizzata da te") + '</span>' : sfStatoBadge(sfMyRisp(x))}</li>`).join('')}</ul>`
            : '<p class="muted">' + T("Nessuna sfida in programma.") + ' <a href="#/sfide">' + T("Vai alle sfide") + '</a></p>'; })()}
        </section>
        <section class="card">
          <h2>${T("{0} I miei corsi", [icon('school')])}</h2>
          ${courses.length ? `<ul class="plain">${courses.map(c => `<li><strong>${esc(c.titolo)}</strong><br><span class="muted small">${fmtDate(c.inizio)} · ${esc(c.orario || '')}</span></li>`).join('')}</ul>` : '<p class="muted">' + T("Nessuna iscrizione.") + ' <a href="#/corsi">' + T("Scopri i corsi") + '</a></p>'}
        </section>
        <section class="card">
          <h2>${T("{0} I miei tornei", [icon('trophy')])}</h2>
          ${tours.length ? `<ul class="plain">${tours.map(t => `<li><a href="#/tornei/${t.id}">${esc(t.nome)}</a> ${statusBadge(t)}</li>`).join('')}</ul>` : '<p class="muted">' + T("Nessun torneo.") + ' <a href="#/tornei">' + T("Vedi i tornei") + '</a></p>'}
        </section>
        <section class="card">
          <h2>${T("{0} I miei dati", [icon('user')])}</h2>
          <form data-form="profile">
            <div class="row"><label>${T("Nome")}<input name="nome" required value="${esc(u.nome)}"></label><label>${T("Cognome")}<input name="cognome" required value="${esc(u.cognome)}"></label></div>
            <div class="row"><label>${T("Telefono")}<input name="tel" type="tel" value="${esc(u.tel)}"></label>
              <label>${T("Sesso")}<select name="sesso" required><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${u.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <label>${T("Livello di gioco{0}", [levelSelect('livello', u.livello, true)])}</label>
            <div class="actions"><button class="btn primary">${T("Salva")}</button></div>
          </form>
          <p class="muted small">${T("Codice utente:")} <code>${esc(u.id)}</code></p>
          <div class="actions">
            <button class="btn" data-action="theme">${T("{0} Stile grafico", [icon('palette')])}</button>
            <button class="btn danger" data-action="logout">${T("{0} Esci", [icon('logout')])}</button>
          </div>
        </section>
      </div>`;
  }

  function viewAuth() {
    const tab = ui.authTab;
    return `
      <div class="auth">
        <h1>${tab === 'login' ? T("Accedi") : T("Crea il tuo account")}</h1>
        <nav class="tabs"><button class="${tab === 'login' ? 'on' : ''}" data-action="auth-tab" data-tab="login">${T("Accedi")}</button><button class="${tab === 'register' ? 'on' : ''}" data-action="auth-tab" data-tab="register">${T("Registrati")}</button></nav>
        <section class="card">
        ${tab === 'login' ? `
          <form data-form="login">
            <label>${T("Email")}<input type="email" name="email" required autocomplete="username"></label>
            <label>${T("Password")}<input type="password" name="password" required autocomplete="current-password"></label>
            <p class="form-error" hidden></p>
            <button class="btn primary big wide">${T("Accedi")}</button>
            <p class="center"><button type="button" class="link" data-action="reset-password">${T("Password dimenticata?")}</button></p>
          </form>` : `
          <form data-form="register">
            <div class="row"><label>${T("Nome")}<input name="nome" required autocomplete="given-name"></label><label>${T("Cognome")}<input name="cognome" required autocomplete="family-name"></label></div>
            <label>${T("Email")}<input type="email" name="email" required autocomplete="email"></label>
            <label>${T("Password (almeno 6 caratteri)")}<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
            <div class="row"><label>${T("Telefono")}<input type="tel" name="tel" required autocomplete="tel"></label>
              <label>${T("Sesso")}<select name="sesso" required><option value="">—</option><option value="M">${T("Uomo")}</option><option value="F">${T("Donna")}</option></select></label></div>
            <label>${T("Il tuo livello di gioco{0}", [levelSelect('livello', null, true)])}</label>
            <p class="muted small">${T("Il sesso serve per i tornei maschili, femminili e misti; il livello per tornei e sfide riservati a certi livelli.")}</p>
            <label class="check"><input type="checkbox" required> ${T("Accetto il trattamento dei dati per la gestione di sfide, tornei e corsi.")}</label>
            <p class="form-error" hidden></p>
            <button class="btn primary big wide">${T("Registrati")}</button>
          </form>`}
        </section>
        <p class="muted small">${T("{0} Email e telefono sono visibili solo a te e agli amministratori del circolo.", [icon('shield-lock')])}</p>
      </div>`;
  }

  // ---------- amministrazione ----------

  function viewAdmin() {
    if (!isAdmin()) return empty(T("Area riservata agli amministratori."), 'lock');
    const s = S(), st = s.settings;
    const rowsText = rows => rows.map(([p, v]) => `${p}=${v}`).join('\n');
    const users = s.users.slice().sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
    return `
      <h1>${T("Amministrazione")}</h1>
      <div class="grid two">
        <section class="card">
          <h2>${T("{0} Spazio editoriale della home", [icon('news')])}</h2>
          <p class="muted small">${T("Due articoli “In evidenza” in prima pagina. Si mostrano solo quelli con titolo o testo. Senza foto compare una palla da pickleball.")}</p>
          ${[...Array(ARTICOLI).keys()].map(articleForm).join('')}
        </section>
        <section class="card">
          <h2>${T("{0} Gruppo", [icon('users-group')])}</h2>
          <form data-form="settings">
            <label>${T("Nome del gruppo")}<input name="nome" value="${esc(st.nome)}"></label>
            <label>${T("Avviso in home")}<textarea name="avviso" rows="2">${esc(st.avviso)}</textarea></label>
            <div class="actions"><button class="btn primary">${T("Salva")}</button></div>
          </form>
        </section>
        <section class="card">
          <h2>${T("{0} Tipologie di torneo e punti", [icon('list-numbers')])}</h2>
          <p class="muted small">${T("Una riga per posizione:")} <code>posizione=punti</code>${T(". Ogni riga vale fino alla successiva (es.")} <code>5=40</code> ${T("e poi")} <code>9=20</code>: ${T("dal 5° all’8° posto 40 punti).")}</p>
          ${s.categories.map(c => `<form data-form="category" class="category"><input type="hidden" name="id" value="${c.id}">
            <label>${T("Nome")}<input name="nome" value="${esc(c.nome)}"></label>
            <label>${T("Punti")}<textarea name="rows" rows="4">${rowsText(c.rows)}</textarea></label>
            <div class="actions"><button type="button" class="btn small danger" data-action="category-delete" data-id="${c.id}">${T("Elimina")}</button><button class="btn small primary">${T("Salva")}</button></div></form>`).join('')}
          <div class="actions"><button class="btn" data-action="category-add">${T("{0} Aggiungi tipologia", [icon('plus')])}</button></div>
        </section>
        <section class="card">
          <h2>${T("{0} Punti delle sfide a torneo", [icon('swords')])}</h2>
          <p class="muted small">${T("La tabella che ricevono i tornei nati dalle sfide (e i nuovi tornei di lega). Stesso formato: posizione=punti, punti di coppia. Ogni torneo si può poi modificare nella sua scheda.")}</p>
          <form data-form="sfide-punti"><label>${T("Punti")}<textarea name="rows" rows="6">${rowsText(st.sfidePunti || Logic.SFIDE_PUNTI)}</textarea></label>
            <div class="actions"><button type="button" class="btn" data-action="sfide-punti-reset">${T("Ripristina i valori iniziali")}</button><button class="btn primary">${T("Salva")}</button></div></form>
        </section>
        <section class="card">
          <h2>${T("{0} Premi fedeltà e performance", [icon('award')])}</h2>
          ${(() => { const c = Premi.cfg(s); return `<form data-form="premi">
            <label>${T("Stelle fedeltà: sfide giocate per ogni stella (separate da virgola)")}<input name="stelle" value="${c.stelle.join(', ')}" placeholder="5, 10, 20, 35, 50"></label>
            <label>${T("Dopo l’ultima soglia: una stella ogni … sfide")}<input type="number" min="1" name="passoStelle" value="${c.passoStelle}"></label>
            <p class="muted small">${T("10 stelle = ☄️ una cometa, 10 comete = 🪐 un pianeta, 10 pianeti = ☀️ un sole, 10 soli = 🌌 una galassia.")}</p>
            <label>${T("Trofei (Bronzo, Argento, Oro, Platino, Diamante): punti in classifica generale")}<input name="trofei" value="${c.trofei.join(', ')}"></label>
            <label>${T("Racchette (stessi livelli): tornei giocati")}<input name="racchette" value="${c.racchette.join(', ')}"></label>
            <p class="muted small">${T("Le medaglie 🥇🥈🥉 si assegnano da sole a ogni podio nei tornei conclusi.")}</p>
            <div class="actions"><button class="btn primary">${T("Salva premi")}</button></div></form>`; })()}
          <h3>${T("Fedeltà dei giocatori")}</h3>
          ${users.filter(u => u.email).length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>${T("Giocatore")}</th><th>${T("Sfide giocate")}</th><th>${T("Stelle")}</th></tr></thead>
            <tbody>${users.filter(u => u.email).map(u => { const n = playedSfide(u.id); const st = Premi.stars(s, n);
              return `<tr><td class="name">${esc(u.cognome + ' ' + u.nome)}</td><td>${n}</td><td>${st.stelle ? Premi.starIcons(st.stelle) : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">' + T("Nessun utente registrato.") + '</p>'}
        </section>
        <section class="card">
          <h2>${T("{0} Utenti e giocatori ({1})", [icon('users'), users.length])}</h2>
          <div class="table-wrap"><table class="standings"><thead><tr><th>${T("Nome")}</th><th>${T("Account")}</th><th>${T("Ruolo")}</th><th></th></tr></thead>
            <tbody>${users.map(u => `<tr><td class="name">${esc(u.cognome + ' ' + u.nome)}${u.sesso ? ` <span class="muted small">${u.sesso}</span>` : ''}${u.livello ? ` <span class="chip">${levelName(u.livello)}</span>` : ''}${u.tel ? `<br><span class="muted small">${esc(u.tel)}</span>` : ''}</td>
              <td class="small">${u.email ? esc(u.email) : '<span class="muted">' + T("senza account") + '</span>'}</td>
              <td>${u.email ? `<select data-change="user-role" data-id="${u.id}" ${u.id === me().id || Cloud.isMain(u.id) ? 'disabled' : ''}><option value="user">${T("Utente")}</option><option value="tornei" ${u.role === 'tornei' ? 'selected' : ''}>${T("Gestore tornei")}</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${T("Admin")}</option></select>` : '—'}</td>
              <td class="right"><button class="link" data-action="player-edit" data-id="${u.id}">${T("modifica")}</button>${u.id !== me().id ? ` <button class="link danger" data-action="user-delete" data-id="${u.id}">${T("elimina")}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
          <form data-form="player-add" class="inline-form">
            <input name="nome" placeholder="${T("Nome")}" required><input name="cognome" placeholder="${T("Cognome")}" required>
            <select name="sesso" required><option value="">${T("Sesso")}</option><option value="M">${T("Uomo")}</option><option value="F">${T("Donna")}</option></select>
            <button class="btn">${T("{0} Aggiungi giocatore", [icon('user-plus')])}</button>
          </form>
          <p class="muted small">${T("I giocatori senza account possono essere inseriti nei tornei dall’organizzazione.\n            Ruoli:")} <strong>${T("Admin")}</strong> ${T("gestisce tutto;")} <strong>${T("Gestore tornei")}</strong> ${T("crea e gestisce solo i tornei (iscritti, calendario, risultati, tempo di gara) e non vede l’amministrazione.")}</p>
        </section>
        <section class="card">
          <h2>${T("{0} Dati", [icon('database')])}</h2>
          <p class="muted small">${T("I dati sono online e condivisi con tutti. Esporta un backup ogni tanto. Dati di esempio e azzeramento non toccano gli account registrati.")}</p>
          <div class="actions wrap">
            <button class="btn" data-action="demo">${T("{0} Carica dati di esempio", [icon('flask')])}</button>
            <button class="btn" data-action="export">${T("{0} Esporta backup", [icon('download')])}</button>
            <label class="btn">${T("{0} Importa backup", [icon('upload')])}<input type="file" accept="application/json" data-change="import" hidden></label>
            <button class="btn danger" data-action="wipe">${T("{0} Azzera tutto", [icon('trash')])}</button>
          </div>
        </section>
      </div>`;
  }

  // ---------- rendering ----------

  const VIEWS = { '': viewHome, sfide: viewSfide, leghe: viewLeghe, tornei: viewTournaments, classifiche: viewRanking, corsi: viewCourses, profilo: viewProfile, admin: viewAdmin };

  let themeFor = null;
  const started = Date.now();
  setTimeout(() => { if (!Store.ready) render(); }, 12000);

  // Schermata di attesa: se il database non risponde spiega il motivo invece di restare in caricamento.
  function loadingView() {
    const c = window.Cloud, err = c && c.lastError, slow = Date.now() - started > 11000;
    if (!c && slow) return `<div class="empty">${icon('plug-connected-x')}<p><strong>${T("Impossibile collegarsi a Firebase.")}</strong><br>
      ${T("Controlla la connessione; se usi un blocco pubblicità o un antivirus che filtra i siti, prova a disattivarlo per questa pagina e ricarica.")}</p></div>`;
    if (err) return `<div class="empty">${icon('alert-triangle')}<p><strong>${T("Il database non risponde")}</strong> ${T("(codice:")} <code>${esc(err)}</code>).<br>
      ${err === 'permission-denied' ? 'Le regole di sicurezza non permettono la lettura: pubblica le regole con <code>firebase deploy --only firestore:rules</code>.'
        : err === 'not-found' || err === 'failed-precondition' ? T("Il database Firestore non risulta creato (o è in una modalità diversa da quella standard).")
        : T("Ricarica la pagina; se il problema continua comunica questo codice.")}</p></div>`;
    return `<div class="empty">${icon('loader-2')}<p>${T("Caricamento…")}${slow ? '<br><span class="small">' + T("Ci sta mettendo più del solito: controlla la connessione.") + '</span>' : ''}</p></div>`;
  }

  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const page = parts[0] || '';
    const u0 = me();
    // Stile salvato nel profilo: si applica quando l'utente accede.
    if (u0 && u0.tema && u0.id + u0.tema !== themeFor) { themeFor = u0.id + u0.tema; applyTheme(u0.tema); }
    if (fixData()) { save(); return; }
    let html;
    if (!Store.ready && page !== 'profilo') html = loadingView();
    else if (page === 'tornei' && parts[1]) html = viewTournament(parts[1]);
    else if (page === 'leghe' && parts[1]) html = viewLega(parts[1]);
    else html = (VIEWS[page] || viewHome)();
    if (page === 'profilo' && u0 && !u0.pending && Store.ready) setTimeout(() => loadCount(u0.id), 0);
    if (Store.ready || page === 'profilo') html = verifyNotice() + html;
    // chi non ha ancora indicato il livello (account creati prima dei livelli)
    if (Store.ready && u0 && !u0.pending && !u0.livello && page !== 'profilo') html = `<div class="notice">${icon('stairs')} <span>${T("Indica il tuo")} <strong>${T("livello di gioco")}</strong>: ${T("serve per tornei e sfide riservati a certi livelli.")}</span> <a class="btn small" href="#/profilo">${T("Vai al profilo")}</a></div>` + html;
    $app.innerHTML = html;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !isAdmin(); });
    const u = me();
    // Badge dell'utente al centro dell'header: stelle fedeltà, medaglie, trofeo, racchetta.
    const hb = document.getElementById('hdrBadges');
    hb.hidden = !u || !Store.ready || u.pending;
    if (!hb.hidden) {
      hb.innerHTML = headerBadges(u.id);
    }
    const nb = document.getElementById('notifBtn');
    if (nb) { const n = notifList().length; nb.hidden = !n; nb.querySelector('.notif-count').textContent = n > 9 ? '9+' : n; }
    const who = document.getElementById('who');
    who.innerHTML = u ? `<span class="avatar">${esc((u.nome[0] || '') + (u.cognome[0] || ''))}</span><span class="lbl">${esc(u.nome)}</span>` : `${icon('login-2')}<span class="lbl">${T("Accedi")}</span>`;
    if ($app.querySelector('form.tour-form')) syncTourForm();
    document.getElementById('clubName').textContent = S().settings.nome;
    document.title = S().settings.nome;
  }

  // Prenotazioni e iscrizioni richiedono l'email confermata.
  function needVerified() {
    if (isAdmin() || window.Cloud.verified) return false;
    toast(T("Prima conferma la tua email: apri il link che ti abbiamo inviato."), 'err');
    return true;
  }

  function verifyNotice() {
    const u = me();
    if (!u || !window.Cloud || window.Cloud.verified) return '';
    return `<div class="notice">${icon('mail')} <span>${T("Ti abbiamo inviato un’email a")} <strong>${esc(window.Cloud.user.email)}</strong>: ${T("apri il link per confermare l’indirizzo.\n      Finché non è confermato non puoi prenotare né iscriverti. Non la trovi? Guarda anche nello spam.")}</span>
      <button class="btn small primary" data-action="verify-check">${T("Ho confermato")}</button><button class="btn small" data-action="verify-resend">${T("Invia di nuovo")}</button></div>`;
  }

  function goProfileForLogin(msg) {
    ui.authTab = 'login';
    toast(msg || T("Accedi per continuare."));
    location.hash = '#/profilo';
  }

  function tourById(id) { const t = S().tournaments.find(x => x.id === id); if (t) curTour = t; return t; }

  // ---------- azioni ----------

  const sfById = id => (S().sfide || []).find(x => x.id === id);
  const actions = {
    lang: () => openDialog(`<h2>${icon('world')} ${T('Lingua')}</h2>
      <div class="lang-list">${Object.entries(I18n.LANGS).map(([k, l]) => `<button class="btn ${k === I18n.lang ? 'primary' : ''}" data-action="set-lang" data-l="${k}"><span class="flag">${l.flag}</span> ${l.nome}</button>`).join('')}</div>
      <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T('Chiudi')}</button></div>`),
    'set-lang': d => I18n.set(d.l),
    'lega-logo-del': d => { const l = legaById(d.id); if (l && confirm(T("Togliere il logo della lega?"))) { l.logo = ''; save(); } },
    'lega-new': () => (ui.legaLogoNew = '') || openDialog(`<form data-form="lega-new"><h2>${T("Nuova lega")}</h2>
        <label>${T("Nome della lega")}<input name="nome" required maxlength="80" placeholder="${T("Lega Amici")}"></label>
        <label>${T("Descrizione")}<textarea name="descrizione" rows="3"></textarea></label>
        <label>${T("Tornei previsti (0 = non definito)")}<input type="number" min="0" max="100" name="previsti" value="0"></label>
        <div class="lega-logo-edit"><span class="lega-logo-prev"><span class="lega-logo none">${icon('shield')}</span></span>
          <label class="btn small">${T("{0} Logo della lega (facoltativo)", [icon('photo')])}<input type="file" accept="image/*" data-change="lega-logo-new" hidden></label></div>
        <p class="muted small">${T("Dopo la creazione scegli gli admin di lega e i giocatori abilitati.")}</p>
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Crea")}</button></div></form>`),
    'lega-tab': d => { (ui.legaTab || (ui.legaTab = {}))[d.id] = d.tab; render(); },
    'lega-kind': d => { (ui.legaKind || (ui.legaKind = {}))[d.id] = d.k; render(); },
    'lega-tour': d => { ui.newLega = d.id; openDialog(tourFormHtml(null, false)); syncTourForm(); },
    'lega-sfida': d => { ui.sfLega = d.id; ui.sfOpen = true; location.hash = '#/sfide'; setTimeout(() => { const f = document.querySelector('form.sf-form'); if (f) { f.elements.tipo.value = 'torneo'; syncSfForm(); f.scrollIntoView(); } }, 50); },
    'lega-remove-tour': d => { const t = tourById(d.id); if (!t || !confirm(`${T("Togliere “{0}” dalla lega?", [t.nome])}`)) return; t.lega = ''; save(); },
    'lega-del-membro': d => { const l = legaById(d.id); if (!l || !confirm(`${T("Togliere {0} dai giocatori della lega?", [userName(d.uid)])}`)) return; l.membri = l.membri.filter(x => x !== d.uid); save(); },
    'lega-chiudi': d => {
      const l = legaById(d.id);
      if (!l) return;
      const open = legaTornei(l).filter(t => !t.closed).length;
      if (!confirm(`${T("Chiudere la lega “{0}” con la classifica finale?", [l.nome])}${open ? `\nAttenzione: ${open} ${open === 1 ? T("torneo non è concluso e non conterà") : T("tornei non sono conclusi e non conteranno")}.` : ''}`)) return;
      const snap = k => Logic.ranking(S(), { lega: l.id, kind: k }).map(r => Object.assign({}, r, { nome: userName(r.id) }));
      l.finale = { generale: snap('generale'), tornei: snap('tornei'), challenge: snap('challenge') };
      l.stato = 'chiusa'; l.chiusaIl = todayKey();
      save(); toast(T("Lega chiusa: classifica finale salvata."), 'ok');
    },
    'lega-riapri': d => { const l = legaById(d.id); if (!l || !confirm(T("Riaprire la lega? La classifica tornerà a contare i tornei."))) return; l.stato = 'aperta'; l.finale = null; save(); },
    'lega-elimina': d => {
      const l = legaById(d.id);
      if (!l || !confirm(`${T("Eliminare la lega “{0}”? I tornei restano, ma escono dalla lega (e tornano nelle classifiche normali).", [l.nome])}`)) return;
      S().tournaments.forEach(t => { if (t.lega === l.id) t.lega = ''; });
      S().leghe = S().leghe.filter(x => x.id !== l.id);
      location.hash = '#/leghe'; save();
    },
    'sf-candida': d => {
      const u = me(), x = sfById(d.id);
      if (!u) return goProfileForLogin(T("Accedi o registrati per partecipare alle sfide."));
      if (needVerified() || !x) return;
      if (!u.sesso) return toast(T("Indica il sesso nel tuo profilo per partecipare."), 'err');
      const inv = sfInvitato(x);
      const lv = inv ? '' : levelError(x.livelli, [u.id]) || legaError(x.lega, [u.id]);
      if (lv) return toast(lv, 'err');
      if (!inv && x.modo === 'sesso' && !(Number(u.sesso === 'M' ? x.cercaM : x.cercaF) > 0)) return toast(`${T("Questa sfida non cerca")} ${u.sesso === 'M' ? T("uomini") : T("donne")}.`, 'err');
      if (sfFull(x)) return toast(T("Posti esauriti."), 'err');
      if (sfCoppie(x)) {
        if (sfConf(x).tot + 2 > sfMax(x)) return toast(T("Non ci sono più posti per una coppia."), 'err');
        return openDialog(`<form data-form="sf-coppia"><input type="hidden" name="id" value="${x.id}">
          <h2>${T("Partecipa in coppia")}</h2>
          <p class="muted small">${T("In questa sfida le coppie sono fisse per tutto il torneo: indica il tuo compagno/a. Chi ha lanciato la sfida conferma la coppia.")}</p>
          ${partnerFields([u.id, x.by], T("Compagno/a"))}
          <p class="form-error" hidden></p>
          <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Invia la candidatura")}</button></div></form>`);
      }
      if (inv) return window.Cloud.applySfida(x, u, null, 'confermata').then(() => window.Cloud.bumpSfida(x.id, [u.sesso], 1))
        .then(() => { closeDialog(); toast(T("Ci sei! La tua partecipazione è confermata."), 'ok'); }).catch(sfErr);
      window.Cloud.applySfida(x, u).then(() => { closeDialog(); toast(T("Candidatura inviata: la deve confermare chi ha lanciato la sfida."), 'ok'); }).catch(sfErr);
    },
    'sf-ritira': d => {
      if (!confirm(T("Ritirare la candidatura?"))) return;
      const r = (S().risp || []).find(y => y.id === d.id), x = r && sfById(r.sid);
      window.Cloud.updateRisp(d.id, { stato: 'ritirata', at: Date.now() }).then(() => {
        // se era confermata, chi ha lanciato la sfida aggiorna i posti al prossimo cambio; l'admin o l'organizzatore lo fa subito
        if (x && (sfMine(x) || isAdmin())) window.Cloud.updateSfida(x.id, { conf: sfCount(x) });
        else if (x && x.privata && r.stato === 'confermata') window.Cloud.bumpSfida(x.id, [r.sesso].concat(r.partner ? [partnerSex(r.partner)] : []), -1).catch(() => {});
        toast(T("Candidatura ritirata."), 'ok');
      }).catch(sfErr);
    },
    'sf-risp': d => {
      const r = (S().risp || []).find(y => y.id === d.id), x = r && sfById(r.sid);
      if (!r || !x) return;
      if (d.v === 'confermata' && sfConf(x).tot + (r.partner ? 2 : 1) > sfMax(x)) return toast(`${T("Non ci sono abbastanza posti: massimo {0} persone.", [sfMax(x)])}`, 'err');
      if (d.v === 'rifiutata' && r.stato === 'confermata' && !confirm(`${T("Togliere {0} dalla sfida?", [r.nome])}`)) return;
      const next = sfRisp(x).map(y => (y.id === r.id ? Object.assign({}, y, { stato: d.v }) : y));
      const ok = next.filter(y => y.stato === 'confermata').flatMap(y => [y.sesso].concat(y.partner ? [partnerSex(y.partner)] : [])).concat((x.guests || []).map(g => g.sesso));
      window.Cloud.updateRisp(r.id, { stato: d.v, visto: false, at: Date.now() })
        .then(() => window.Cloud.updateSfida(x.id, { conf: { M: ok.filter(g => g === 'M').length, F: ok.filter(g => g === 'F').length, tot: ok.length } }))
        .then(() => toast(d.v === 'confermata' ? `${r.nome} confermato/a.` : `${T("{0} non confermato/a.", [r.nome])}`, 'ok')).catch(sfErr);
    },
    'sf-guest': d => {
      openDialog(`<form data-form="sf-guest"><input type="hidden" name="id" value="${d.id}">
        <h2>${T("Aggiungi un giocatore non registrato")}</h2>
        <div class="row"><label>${T("Nome")}<input name="nome" required maxlength="60"></label><label>${T("Cognome")}<input name="cognome" required maxlength="60"></label></div>
        <label>${T("Sesso")}<select name="sesso" required><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Aggiungi")}</button></div></form>`);
    },
    notifiche: () => {
      const list = notifList();
      openDialog(`<h2>${T("{0} Avvisi", [icon('bell')])}</h2><div class="notif-list">${list.length ? list.map(notifCard).join('') : `<p class="muted">${T("Nessun avviso.")}</p>`}</div>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Chiudi")}</button></div>`);
    },
    'notif-no': (d, el) => {
      const card = el.closest('.notif');
      if (card) card.remove();
      window.Cloud.nascondi(d.k).catch(sfErr);
      if ($dialog.open && $dialog.querySelector('.notif-list') && !$dialog.querySelector('.notif')) closeDialog();
    },
    'notif-vai': () => closeDialog(),
    'gruppo-usa': (d, el) => {
      const g = (S().gruppi || []).find(y => y.id === d.id), f = el.closest('form');
      if (!g || !f) return;
      f.querySelectorAll('input[name=invitati]').forEach(c => { if (g.membri.includes(c.value)) c.checked = true; });
      toast(T("Aggiunti gli invitati del gruppo {0}.", [g.nome]), 'ok');
    },
    'gruppo-salva': (d, el) => {
      const f = el.closest('form'), nome = (f.elements.gruppoNome.value || '').trim(), membri = readInvitati(f);
      if (!nome) return toast(T("Scrivi il nome del gruppo."), 'err');
      if (!membri.length) return toast(T("Scegli prima le persone del gruppo."), 'err');
      const old = (S().gruppi || []).find(g => g.nome.toLowerCase() === nome.toLowerCase());
      window.Cloud.saveGruppo(old ? old.id : Store.uid('g'), nome, membri).then(() => { f.elements.gruppoNome.value = ''; toast(T("Gruppo «{0}» salvato ({1} persone).", [nome, membri.length]), 'ok'); }).catch(sfErr);
    },
    'gruppo-elimina': (d, el) => {
      const g = (S().gruppi || []).find(y => y.id === d.id);
      if (!g || !confirm(T("Eliminare il gruppo «{0}»?", [g.nome]))) return;
      const chip = el.closest('.chip');
      window.Cloud.deleteGruppo(g.id).then(() => { if (chip) chip.remove(); }).catch(sfErr);
    },
    'sfide-punti-reset': () => {
      if (!confirm(T("Rimettere la tabella punti iniziale delle sfide?"))) return;
      S().settings.sfidePunti = null;
      save();
      toast(T("Punti delle sfide salvati."), 'ok');
    },
    'sf-modifica': d => {
      const x = sfById(d.id);
      if (!x || !(sfMine(x) || isAdmin())) return;
      openDialog(`<form data-form="sf-modifica"><input type="hidden" name="id" value="${x.id}">
        <h2>${T("Modifica la sfida")}</h2>
        <div class="row">
          <label>${T("Data")}${dateField('data', x.data, { required: true })}</label>
          <label>${T("Ora")}<input type="time" name="ora" required value="${esc(x.ora)}"></label>
          <label>${T("Campi")}<select name="campi"><option value="1">${T("1 campo")}</option><option value="2" ${x.campi === 2 ? 'selected' : ''}>${T("2 campi")}</option></select></label>
        </div>
        <label>${T("Luogo")}<input name="luogo" maxlength="80" value="${esc(x.luogo || '')}"></label>
        <div class="row">
          ${x.modo === 'sesso' ? `<label>${T("Uomini cercati")}<input type="number" min="0" max="40" name="cercaM" value="${Number(x.cercaM) || 0}"></label>
          <label>${T("Donne cercate")}<input type="number" min="0" max="40" name="cercaF" value="${Number(x.cercaF) || 0}"></label>`
          : `<label>${T("Persone cercate")}<input type="number" min="1" max="80" name="cercaTot" value="${Number(x.cercaTot) || 1}"></label>`}
          <label>${T("Numero massimo di persone")}<input type="number" min="1" max="80" name="max" value="${Number(x.max) || 0}"></label>
        </div>
        ${x.privata ? invitePicker(x.invitati) : levelsBox(x.livelli || [], T("Solo i giocatori di questi livelli possono partecipare. Nessuna casella = aperta a tutti i livelli."))}
        <label>${T("Note (facoltative)")}<textarea name="nota" rows="2" maxlength="300">${esc(x.nota || '')}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Salva")}</button></div></form>`);
    },
    'sf-guest-del': d => {
      const x = sfById(d.id);
      if (!x || !confirm(T("Togliere questo giocatore dalla sfida?"))) return;
      const guests = (x.guests || []).filter((_, i) => i !== Number(d.i));
      window.Cloud.updateSfida(x.id, { guests, conf: sfCount(Object.assign({}, x, { guests })) }).catch(sfErr);
    },
    'sf-chiudi': d => {
      const x = sfById(d.id);
      if (!x) return;
      const pend = sfRisp(x).filter(r => r.stato === 'attesa');
      if (!confirm(`${T("Chiudere la sfida?")}${pend.length ? `\n${pend.length} ${pend.length === 1 ? T("candidatura in attesa riceverà") : T("candidature in attesa riceveranno")} ${T("l’avviso “Registrazione alla sfida non confermata o non più posti disponibili”.")}` : ''}`)) return;
      Promise.all(pend.map(r => window.Cloud.updateRisp(r.id, { stato: 'non_confermata', visto: false, at: Date.now() })))
        .then(() => window.Cloud.updateSfida(x.id, { stato: 'chiusa' })).then(() => toast(T("Sfida chiusa."), 'ok')).catch(sfErr);
    },
    'sf-riapri': d => { window.Cloud.updateSfida(d.id, { stato: 'aperta' }).then(() => toast(T("Sfida riaperta."), 'ok')).catch(sfErr); },
    'sf-elimina': d => {
      const x = sfById(d.id);
      if (!x || !confirm(T("Eliminare la sfida? Le candidature verranno cancellate (il torneo, se creato, resta nella sezione Tornei)."))) return;
      Promise.all(sfRisp(x).map(r => window.Cloud.deleteRisp(r.id))).then(() => window.Cloud.deleteSfida(x.id)).then(() => toast(T("Sfida eliminata."), 'ok')).catch(sfErr);
    },
    'sf-torneo': d => {
      const x = sfById(d.id);
      if (!x) return;
      if (x.tid && S().tournaments.some(t => t.id === x.tid)) { location.hash = '#/tornei/' + x.tid; return; }
      const n = 1 + sfRisp(x).filter(r => r.stato === 'confermata').length + (x.guests || []).length;
      if (!confirm(`${T("Creare il torneo della sfida con {0} giocatori (tu compreso)? Potrai ancora aggiungere o togliere iscritti prima del sorteggio.", [n])}`)) return;
      const t = sfCreaTorneo(x);
      ui.tab[t.id] = 'iscritti';
      save();
      window.Cloud.updateSfida(x.id, { tid: t.id }).catch(sfErr);
      location.hash = '#/tornei/' + t.id;
      toast(T("Torneo creato: controlla gli iscritti, poi chiudi la lista e genera le gare."), 'ok');
    },
    'sf-visto': d => { window.Cloud.updateRisp(d.id, { visto: true }).catch(sfErr); },
    'tour-pdf': d => tourPdf(tourById(d.id)),
    'timer-start': d => {
      unlockAudio();
      const t = tourById(d.id), inp = document.querySelector('[data-timer] input[name=timerMin]');
      const min = Math.min(120, Math.max(1, Math.round(Number(inp && inp.value) || t.config.minuti)));
      setTimer(d.id, { min, end: Date.now() + min * 60000 });
    },
    'timer-pause': d => { const tm = tourById(d.id).timer; setTimer(d.id, { min: tm.min, left: Math.max(0, tm.end - Date.now()) }); },
    'timer-resume': d => { unlockAudio(); const tm = tourById(d.id).timer; setTimer(d.id, { min: tm.min, end: Date.now() + tm.left }); },
    'timer-reset': d => { if (!confirm(T("Azzerare il conto alla rovescia?"))) return; setTimer(d.id, { min: tourById(d.id).timer.min }); },
    'timer-sound': () => {
      unlockAudio();
      jingle();
      // Il pulsante "Attiva suono" sparisce una volta attivato.
      setTimeout(render, 300);
    },
    'timer-full': () => {
      unlockAudio();
      const el = document.querySelector('[data-timer]');
      if (!el) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    },
    'close-dialog': closeDialog,
    theme: themeDialog,
    'set-theme': d => {
      applyTheme(d.pick, true);
      const u = me();
      if (u) { u.tema = d.pick; Store.save(); }
      themeDialog();
    },
    logout: async () => { await Store.logout(); toast(T("Sei uscito.")); location.hash = '#/'; render(); },
    'verify-resend': async () => {
      try { await window.Cloud.resendVerification(); toast(T("Email inviata di nuovo."), 'ok'); } catch (e) { toast(e.message, 'err'); }
    },
    'verify-check': async () => {
      const ok = await window.Cloud.checkVerified();
      toast(ok ? T("Email confermata, grazie!") : T("Non risulta ancora confermata: apri il link nell’email e riprova."), ok ? 'ok' : 'err');
      render();
    },
    'reset-password': async () => {
      const f = document.querySelector('form[data-form=login]');
      const email = f && f.elements.email.value.trim();
      if (!email) return formError(f, T("Scrivi la tua email qui sopra, poi tocca di nuovo “Password dimenticata?”."));
      try { await Store.resetPassword(email); toast(T("Ti abbiamo inviato un’email per reimpostare la password."), 'ok'); } catch (e) { formError(f, e.message); }
    },
    'auth-tab': d => { ui.authTab = d.tab; render(); },

    day: d => { ui.date = addDays(ui.date, Number(d.delta)); render(); },
    slot: d => {
      if (!me()) return goProfileForLogin(T("Accedi o registrati per prenotare."));
      slotClick(d.court, d.t);
    },
    'sel-clear': () => { ui.sel = null; render(); },
    band: d => { ui.fascia = d.band; render(); },
    'pick-date': (d, el) => {
      const n = el.closest('.date-pick').querySelector('.date-native');
      try { n.showPicker(); } catch (e) { n.focus(); n.click(); }
    },
    'sel-shorter': () => { const x = ui.sel; if (x && toMin(x.to) - toMin(x.from) > 30) { x.to = addMin(x.to, -30); render(); } },
    'sel-longer': () => { const x = ui.sel; if (x && selFree(x.courtId, x.date, x.from, addMin(x.to, 30), x.editId)) { x.to = addMin(x.to, 30); render(); } },
    'booking-open': d => {
      const b = S().bookings.find(x => x.id === d.id);
      if (!b) return;
      ui.sel = { courtId: b.courtId, date: b.date, from: b.from, to: b.to, editId: b.id, userId: b.userId, blocked: b.blocked || '' };
      ui.date = b.date;
      if (!location.hash.startsWith('#/prenota')) location.hash = '#/prenota'; else render();
      setTimeout(() => { const el = document.querySelector('.book-summary'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 80);
    },
    'booking-confirm': () => confirmBooking(),
    'adm-month': d => { ui.admMonth = shiftMonth(ui.admMonth, Number(d.delta)); ui.admAll = false; render(); },
    'adm-today': () => { ui.admMonth = monthOf(todayKey()); ui.admDay = todayKey(); ui.admAll = false; render(); },
    'adm-day': d => { ui.admDay = d.date; ui.admAll = false; render(); setTimeout(() => { const el = document.querySelector('.adm-cal + .card'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); },
    'adm-all': () => { ui.admAll = true; render(); },
    'adm-all-close': () => { ui.admAll = false; render(); },
    'booking-delete': d => deleteBooking(d.id),
    'notice-dismiss': d => window.Cloud.dismiss(d.id),
    'art-foto-del': d => { ui.artFoto = ui.artFoto || {}; ui.artFoto[d.i] = ''; render(); },
    'art-clear': d => {
      if (!confirm(T("Svuotare questo articolo? Sparirà dalla home."))) return;
      const list = S().articoli = (S().articoli || []).slice();
      list[d.i] = { titolo: '', testo: '', foto: '', link: '', linkTesto: '' };
      if (ui.artFoto) delete ui.artFoto[d.i];
      save();
    },
    'court-copy': (d, el) => {
      const f = el.closest('form');
      [2, 3, 4, 5, 6, 7].forEach(n => {
        f.elements['aperto' + n].checked = f.elements.aperto1.checked;
        f.elements['apre' + n].value = f.elements.apre1.value;
        f.elements['chiude' + n].value = f.elements.chiude1.value;
      });
      toast(T("Orari copiati: ricordati di salvare il campo."));
    },

    'tour-tab': d => { ui.tab[d.id] = d.tab; render(); },
    'am-sort': d => { (ui.amSort || (ui.amSort = {}))[d.id] = d.sort; render(); },
    'tour-new': () => { ui.newLega = null; tourForm(null); },
    'tour-edit': d => tourForm(tourById(d.id)),
    'scheda-reset': d => { const f = $app.querySelector('form.tour-form'); if (f) delete f.dataset.dirty; render(); },
    'tour-toggle-reg': d => { const t = tourById(d.id); t.iscrizioniAperte = !t.iscrizioniAperte; save(); },
    'tour-join': d => {
      if (needVerified()) return;
      const t = tourById(d.id);
      if (isPairs(t)) return entryDialog(t, null);
      const err = genderError(t, [me().id]) || levelError(t.livelli, [me().id]) || legaError(t.lega, [me().id]);
      if (err) return toast(err, 'err');
      t.entries.push({ id: Store.uid('e'), p1: me().id, p2: null });
      save();
      toast(T("Iscrizione confermata!"), 'ok');
    },
    'tour-leave': d => {
      const t = tourById(d.id), u = me();
      if (!confirm(T("Ritirare l’iscrizione? Nel doppio viene ritirata l’intera coppia."))) return;
      t.entries = t.entries.filter(e => e.p1 !== u.id && e.p2 !== u.id);
      save();
    },
    'entry-add': d => entryDialog(tourById(d.id), null),
    'entry-bulk': d => bulkDialog(tourById(d.id)),
    'entry-edit': d => { const t = tourById(d.id); entryDialog(t, t.entries.find(e => e.id === d.entry)); },
    'entry-remove': d => {
      const t = tourById(d.id);
      if (!confirm(T("Rimuovere questa iscrizione?"))) return;
      t.entries = t.entries.filter(e => e.id !== d.entry);
      save();
    },
    'tour-draw': d => {
      const t = tourById(d.id);
      const err = Logic.drawCheck(t, t.entries.length);
      if (err) return toast(err, 'err');
      if (isPairs(t) && t.entries.some(e => !e.p2)) return toast(T("Ci sono coppie senza compagno: completale o rimuovile."), 'err');
      const sex = Object.fromEntries(t.entries.map(e => [e.id, entrySex(e)]));
      const levels = Object.fromEntries(t.entries.map(e => [e.id, e.livello || (S().users.find(u => u.id === e.p1) || {}).livello || 3]));
      if (Logic.isRotazione(t) && t.genere === 'misto') {
        const nM = t.entries.filter(e => sex[e.id] === 'M').length, nF = t.entries.filter(e => sex[e.id] === 'F').length;
        if (nM + nF < t.entries.length) return toast(T("Torneo misto: indica il sesso di tutti i giocatori."), 'err');
        if (nM < 2 || nF < 2) return toast(T("Torneo misto: servono almeno 2 uomini e 2 donne."), 'err');
      }
      if (!confirm(Logic.isRotazione(t) ? T("Chiudere le iscrizioni e creare il calendario dei turni?") : T("Chiudere le iscrizioni ed eseguire il sorteggio?"))) return;
      const rank = Logic.rankMap(S(), t);
      const pts = e => Logic.entryPlayers(e).reduce((s, id) => s + (rank[id] || 0), 0);
      const idx = new Map(t.entries.map((e, i) => [e.id, i]));
      const ids = t.entries.slice().sort((a, b) => pts(b) - pts(a) || idx.get(a.id) - idx.get(b.id)).map(e => e.id);
      t.iscrizioniAperte = false;
      Logic.startDraw(t, ids, sex, levels);
      ui.tab[t.id] = null;
      save();
      toast(Logic.isRotazione(t) ? T("Calendario dei turni creato.") : T("Sorteggio eseguito."), 'ok');
    },
    'tour-redraw': d => {
      const t = tourById(d.id);
      const played = Object.values(t.results || {}).filter(r => r && r.closed).length;
      const msg = played ? `${T("Rigenerare il tabellone e le gare? Attenzione:")} ${played === 1 ? T("verrà cancellato il risultato già inserito") : `${T("verranno cancellati i {0} risultati già inseriti", [played])}`}.`
        : T("Rigenerare il tabellone e le gare con nuovi abbinamenti e turni di riposo?");
      if (!confirm(msg)) return;
      Logic.startDraw(t, t.seeds, t.sex, t.levels);
      save();
      toast(T("Nuovo tabellone creato."), 'ok');
    },
    'tour-undraw': d => {
      if (!confirm(T("Annullare il sorteggio? Verranno cancellati gironi, tabellone e tutti i risultati."))) return;
      Logic.resetDraw(tourById(d.id));
      save();
    },
    'tour-bracket': d => {
      const t = tourById(d.id);
      if (t.bracket && !confirm(T("Rigenerare il tabellone? I risultati della fase finale verranno cancellati."))) return;
      Logic.resetBracket(t);
      Logic.generateBracket(t);
      ui.tab[t.id] = 'tabellone';
      save();
    },
    'tour-close': d => {
      const tt = tourById(d.id);
      if (tt.tempo && !Logic.tempoComplete(tt) && !confirm(T("Alcune gare non sono state giocate: interrompere il torneo? Vale la classifica attuale."))) return;
      if (!confirm(T("Concludere il torneo? I punti verranno assegnati alla classifica."))) return;
      tourById(d.id).closed = true;
      ui.tab[d.id] = 'finale';
      save();
      toast(T("Torneo concluso: classifica aggiornata."), 'ok');
    },
    'fantasma-next': d => {
      const t = tourById(d.id);
      Logic.fantasmaAdvance(t);
      ui.tab[t.id] = 'fko';
      save();
      toast(T("Sorteggio eseguito: nuove coppie formate."), 'ok');
    },
    'final-pairs': d => {
      const t = tourById(d.id);
      const last = t.fantasma.ko[t.fantasma.ko.length - 1];
      const ids = last && last.final && !Logic.fantasmaNextIds(t) ? last.ids : Logic.fantasmaNextIds(t);
      if (!ids || ids.length !== 4) return toast(T("La finale si compone con 4 giocatori."), 'err');
      const cur = last && last.final ? last.matches[0].a : null;
      const mate = cur ? cur.find(x => x !== ids[0]) || cur[1] : null;
      openDialog(`
        <form data-form="final-pairs"><input type="hidden" name="tid" value="${t.id}">
          <h2>${T("Coppie della finale")}</h2>
          <p>${T("Giocatori rimasti:")} ${ids.map(id => `<strong>${pname(t, id)}</strong>`).join(', ')}.</p>
          <input type="hidden" name="p0" value="${ids[0]}">
          <label>${T("Compagno di {0}", [pname(t, ids[0])])}<select name="mate">${ids.slice(1).map(id => `<option value="${id}" ${cur && cur.includes(ids[0]) && id === mate ? 'selected' : ''}>${pname(t, id)}${t.genere === 'misto' ? ` (${SESSI[t.sex[id]] || '?'})` : ''}</option>`).join('')}</select></label>
          <p class="muted small">${T("Gli altri due giocatori formano la coppia avversaria.")}${t.genere === 'misto' ? ` ${pname(t, ids[0])} è ${(SESSI[t.sex[ids[0]]] || '').toLowerCase()}.` : ''}</p>
          <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Conferma finale")}</button></div>
        </form>`);
    },
    'fantasma-undo': d => {
      if (!confirm(T("Annullare l’ultimo sorteggio della fase finale? I suoi risultati verranno cancellati."))) return;
      Logic.fantasmaUndo(tourById(d.id));
      save();
    },
    'tour-reopen': d => { tourById(d.id).closed = false; save(); },
    'tour-delete': d => {
      if (!confirm(T("Eliminare definitivamente il torneo?"))) return;
      S().tournaments = S().tournaments.filter(t => t.id !== d.id);
      location.hash = '#/tornei';
      save();
    },
    result: (d, el) => {
      const id = location.hash.split('/')[2];
      resultDialog(tourById(id), d.key);
    },
    'result-clear': () => {
      const f = $dialog.querySelector('form');
      const t = tourById(f.elements.tid.value);
      delete t.results[f.elements.key.value];
      closeDialog();
      save();
    },
    player: d => playerDialog(d.id),
    'rank-cat': d => { ui.rank.cat = d.cat; render(); },

    'course-new': () => courseForm(null),
    'course-edit': d => courseForm(S().courses.find(c => c.id === d.id)),
    'course-delete': d => {
      if (!confirm(T("Eliminare il corso e le relative iscrizioni?"))) return;
      S().courses = S().courses.filter(c => c.id !== d.id);
      closeDialog();
      save();
    },
    'course-join': d => {
      const u = me();
      if (!u) return goProfileForLogin(T("Accedi o registrati per iscriverti."));
      if (needVerified()) return;
      const c = S().courses.find(x => x.id === d.id);
      if (c.iscritti.length >= c.posti) return toast(T("Posti esauriti."), 'err');
      c.iscritti.push(u.id);
      save();
      toast(T("Iscrizione confermata!"), 'ok');
    },
    'course-leave': d => {
      if (!confirm(T("Annullare l’iscrizione?"))) return;
      const c = S().courses.find(x => x.id === d.id);
      c.iscritti = c.iscritti.filter(id => id !== me().id);
      save();
    },
    'course-kick': d => {
      const c = S().courses.find(x => x.id === d.id);
      c.iscritti = c.iscritti.filter(id => id !== d.user);
      save();
    },

    'court-add': () => { S().courts.push(Store.normCourt({ id: Store.uid('c'), nome: T("Campo ") + (S().courts.length + 1) })); save(); },
    'court-delete': d => {
      if (!confirm(T("Eliminare il campo? Le sue prenotazioni verranno cancellate."))) return;
      S().courts = S().courts.filter(c => c.id !== d.id);
      S().bookings = S().bookings.filter(b => b.courtId !== d.id);
      save();
    },
    'category-add': () => { S().categories.push({ id: Store.uid('cat'), nome: T("Nuova tipologia"), rows: [[1, 100], [2, 80], [3, 60], [5, 40], [9, 20]] }); save(); },
    'category-delete': d => {
      if (!confirm(T("Eliminare la tipologia? I tornei collegati non daranno più punti."))) return;
      S().categories = S().categories.filter(c => c.id !== d.id);
      save();
    },
    'player-edit': d => {
      const u = S().users.find(x => x.id === d.id);
      if (!u) return;
      openDialog(`
        <form data-form="player-edit">
          <input type="hidden" name="id" value="${u.id}">
          <h2>${T("Modifica giocatore")}</h2>
          ${u.email ? `<p class="muted small">${T("Account: {0}", [esc(u.email)])}</p>
            <div class="notice"><span>${icon('key')} <strong>${T("Password")}</strong>: ${T("per sicurezza non si può vedere né scrivere al posto dell’utente.\n              Con il pulsante gli arriva un’email con il link per sceglierne una nuova (se non la trova, guardi nello spam).")}</span>
              <button type="button" class="btn small" data-action="user-reset-pw" data-id="${u.id}">${T("{0} Invia email per cambiare la password", [icon('mail')])}</button></div>`
            : '<p class="muted small">' + T("Giocatore senza account.") + '</p>'}
          <div class="row"><label>${T("Nome")}<input name="nome" required value="${esc(u.nome)}"></label><label>${T("Cognome")}<input name="cognome" required value="${esc(u.cognome)}"></label></div>
          <label>${T("Sesso")}<select name="sesso" required><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${u.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>${T("Livello di gioco{0}", [levelSelect('livello', u.livello, false)])}</label>
          <p class="muted small">${T("Le modifiche valgono anche nei tornei e nelle classifiche in cui il giocatore compare.")}</p>
          <p class="form-error" hidden></p>
          <div class="actions"><button type="button" class="btn" data-action="close-dialog">${T("Annulla")}</button><button class="btn primary">${T("Salva")}</button></div>
        </form>`);
    },
    'user-reset-pw': async d => {
      const u = S().users.find(x => x.id === d.id);
      if (!u || !u.email) return;
      if (!confirm(`${T("Inviare a {0} l’email per cambiare la password?", [u.email])}`)) return;
      try { await Store.resetPassword(u.email); toast(`${T("Email inviata a {0}.", [u.email])}`, 'ok'); } catch (e) { toast(e.message || T("Invio non riuscito."), 'err'); }
    },
    'user-delete': d => {
      const s = S();
      if (s.tournaments.some(t => t.entries.some(e => e.p1 === d.id || e.p2 === d.id))) return toast(T("Il giocatore è iscritto a dei tornei: non si può eliminare."), 'err');
      const acc = s.users.find(u => u.id === d.id);
      if (!confirm(`${T("Eliminare {0}? Verranno cancellate anche prenotazioni e iscrizioni ai corsi.", [userName(d.id)])}${acc && acc.email ? T(" L’account di accesso va eliminato dalla console Firebase (Authentication).") : ''}`)) return;
      s.users = s.users.filter(u => u.id !== d.id);
      s.bookings = s.bookings.filter(b => b.userId !== d.id);
      s.courses.forEach(c => { c.iscritti = c.iscritti.filter(id => id !== d.id); });
      save();
    },
    demo: () => {
      if (!confirm(T("Sostituire tutti i dati (tranne gli account registrati) con quelli di esempio? I dati attuali verranno cancellati per tutti."))) return;
      Store.replace(Demo.build());
      toast(T("Dati di esempio caricati."), 'ok');
      location.hash = '#/';
      render();
    },
    export: () => {
      const blob = new Blob([JSON.stringify(S(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pickleball-backup-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    wipe: () => {
      if (!confirm(T("Cancellare TUTTI i dati (campi, tornei, corsi, prenotazioni, giocatori senza account) per tutti gli utenti?"))) return;
      if (String(prompt(T("Per confermare scrivi AZZERA")) || '').trim().toUpperCase() !== 'AZZERA') return;
      Store.replace(Store.empty());
      location.hash = '#/';
      render();
    }
  };

  const changes = {
    'lega-logo': el => {
      const l = legaById(el.dataset.id), file = el.files && el.files[0];
      if (!l || !file) return;
      shrinkLogo(file).then(url => { l.logo = url; save(); toast(T("Logo della lega salvato."), 'ok'); }).catch(e => toast(e.message, 'err'));
    },
    'lega-logo-new': el => {
      const file = el.files && el.files[0];
      if (!file) return;
      shrinkLogo(file).then(url => { ui.legaLogoNew = url; const pv = el.form.querySelector('.lega-logo-prev'); if (pv) pv.innerHTML = `<img class="lega-logo" src="${url}" alt="" width="64" height="64">`; }).catch(e => toast(e.message, 'err'));
    },
    'lega-add-tour': el => { const t = tourById(el.value), l = legaById(el.dataset.id); if (t && l) { t.lega = l.id; save(); toast(`${T("“{0}” aggiunto alla lega.", [t.nome])}`, 'ok'); } },
    'lega-add-membro': el => { const l = legaById(el.dataset.id); if (l && el.value && !l.membri.includes(el.value)) { l.membri = l.membri.concat([el.value]); save(); toast(`${T("{0} abilitato/a alla lega.", [userName(el.value)])}`, 'ok'); } },
    'sf-form': () => syncSfForm(),
    'partner-kind': el => { const g = el.form.querySelector('.partner-guest'); if (g) g.hidden = el.value !== '__guest'; },
    'entry-kind': el => { const g = el.form.querySelector('.guest-fields'); if (g) g.hidden = el.value !== '__guest'; },
    'book-date': el => { if (el.value) { ui.date = el.value; render(); } },
    'date-native': el => { const t = el.closest('.date-field').querySelector('input[data-date]'); if (t && el.value) t.value = itDate(el.value); },
    rank: el => { ui.rank[el.dataset.key] = el.value; render(); },
    'pool-type': el => {
      const t = tourById(el.dataset.id);
      if (!confirm(T("Cambiare la formula del girone? I suoi risultati verranno cancellati (e il tabellone, se generato)."))) { render(); return; }
      Logic.setPoolType(t, Number(el.dataset.pool), el.value);
      save();
    },
    'art-foto': el => {
      const file = el.files[0];
      if (!file) return;
      shrinkImage(file).then(url => { ui.artFoto = ui.artFoto || {}; ui.artFoto[el.dataset.i] = url; render(); toast(T("Foto pronta: ricordati di salvare l’articolo.")); })
        .catch(e => toast(e.message, 'err'));
    },
    'sel-user': el => { if (ui.sel) { ui.sel.userId = el.value || null; if (el.value) ui.sel.blocked = ''; render(); } },
    'sel-blocked': el => { if (ui.sel) { ui.sel.blocked = el.value.trim(); render(); } },
    'user-role': el => { const u = S().users.find(x => x.id === el.dataset.id); u.role = el.value; save(); },
    import: el => {
      const file = el.files[0];
      if (!file) return;
      file.text().then(txt => {
        const data = JSON.parse(txt);
        if (!Store.isValid(data)) throw new Error();
        if (!confirm(T("Sostituire tutti i dati con quelli del backup?"))) return;
        Store.replace(data);
        toast(T("Backup importato."), 'ok');
        render();
      }).catch(() => toast(T("File non valido."), 'err'));
    }
  };

  function formError(f, msg) {
    const p = f.querySelector('.form-error');
    if (p) { p.textContent = msg; p.hidden = false; } else toast(msg, 'err');
  }

  const num = v => (v === '' || v == null ? null : Number(v));

  // "1=100\n2=80" -> [[1, 100], [2, 80]]
  const parseRows = txt => txt.split(/\n+/).map(l => l.trim().split(/[=:;,\s]+/).map(Number))
    .filter(r => r.length >= 2 && r[0] > 0 && !isNaN(r[1])).map(r => [r[0], r[1]]).sort((a, b) => a[0] - b[0]);

  const forms = {
    'lega-new': (v, f) => {
      if (!v.nome.trim()) return formError(f, T("Scrivi il nome della lega."));
      const l = { id: Store.uid('l'), nome: v.nome.trim(), descrizione: (v.descrizione || '').trim(), previsti: Number(v.previsti) || 0, admins: [], membri: [], stato: 'aperta', logo: ui.legaLogoNew || '' };
      ui.legaLogoNew = '';
      (S().leghe || (S().leghe = [])).push(l);
      closeDialog(); location.hash = '#/leghe/' + l.id; (ui.legaTab || (ui.legaTab = {}))[l.id] = 'gestione'; save();
    },
    lega: (v, f) => {
      const l = legaById(v.id);
      if (!l || !isLegaAdmin(l)) return;
      Object.assign(l, { nome: v.nome.trim() || l.nome, descrizione: (v.descrizione || '').trim(), previsti: Number(v.previsti) || 0 });
      if (isAdmin()) l.admins = [...f.querySelectorAll('input[name=admins]:checked')].map(el => el.value);
      save(); toast(T("Lega salvata."), 'ok');
    },
    sfida: (v, f) => {
      const u = me();
      if (!u) return goProfileForLogin(T("Accedi o registrati per lanciare una sfida."));
      if (needVerified()) return;
      const n = k => Math.max(0, Math.round(Number(v[k]) || 0));
      const x = {
        byName: `${u.nome} ${u.cognome}`.trim(), data: v.data, ora: v.ora, luogo: (v.luogo || '').trim(), campi: Number(v.campi) === 2 ? 2 : 1,
        modo: v.modo === 'indifferente' ? 'indifferente' : 'sesso', cercaM: n('cercaM'), cercaF: n('cercaF'), cercaTot: n('cercaTot'), max: n('max'),
        tipo: v.tipo === 'torneo' ? 'torneo' : 'libero', formato: v.tipo === 'torneo' ? v.formato : '', nota: (v.nota || '').trim(),
        cfg: v.tipo === 'torneo' ? { poolSize: n('poolSize') || 4, qualify: n('qualify') || 2, punti: n('punti') || 11, turni: n('turni') || 5, minuti: n('minuti') || 12, vincolo: v.vincolo || 'equilibrato' } : {},
        stato: 'aperta', conf: { M: 0, F: 0, tot: 0 }, guests: [], tid: '', livelli: readLevels(f), lega: v.tipo === 'torneo' ? v.lega || '' : '',
        privata: v.vis === 'privata', invitati: v.vis === 'privata' ? readInvitati(f) : []
      };
      if (x.privata && !x.invitati.length) return formError(f, T("Scegli almeno una persona da invitare."));
      if (sfCoppie(x)) {
        const pa = readPartner(v);
        if (!pa) return formError(f, T("Indica il tuo compagno/a (per un non registrato: nome, cognome e sesso)."));
        x.partner = pa;
      }
      if (!x.data || !x.ora) return formError(f, T("Indica data e ora."));
      if (isPast(x.data, x.ora)) return formError(f, T("La data e l’ora sono già passate."));
      const sought = x.modo === 'sesso' ? x.cercaM + x.cercaF : x.cercaTot;
      if (sought < 1) return formError(f, T("Indica quante persone cerchi."));
      if (!x.max) x.max = sought;
      if (x.max < sought) return formError(f, `${T("Il numero massimo di persone non può essere minore di quelle cercate ({0}).", [sought])}`);
      window.Cloud.createSfida(Store.uid('s'), x).then(() => { ui.sfOpen = false; delete f.dataset.dirty; render(); toast(x.privata ? T("Sfida privata lanciata: gli invitati ricevono l’avviso.") : T("Sfida lanciata!"), 'ok'); }).catch(sfErr);
    },
    'sf-coppia': (v, f) => {
      const x = sfById(v.id), u = me(), pa = readPartner(v);
      if (!x || !u) return closeDialog();
      if (!pa) return formError(f, T("Indica il compagno/a (per un non registrato: nome, cognome e sesso)."));
      if (!sfInvitato(x) && pa.uid && levelError(x.livelli, [pa.uid])) return formError(f, levelError(x.livelli, [pa.uid]));
      if (!sfInvitato(x) && x.modo === 'sesso' && !(Number(partnerSex(pa) === 'M' ? x.cercaM : x.cercaF) > 0)) return formError(f, `${T("Questa sfida non cerca")} ${partnerSex(pa) === 'M' ? T("uomini") : T("donne")}.`);
      if (sfInvitato(x)) return window.Cloud.applySfida(x, u, pa, 'confermata').then(() => window.Cloud.bumpSfida(x.id, [u.sesso, partnerSex(pa)], 1))
        .then(() => { closeDialog(); toast(T("Ci sei! La tua partecipazione è confermata."), 'ok'); }).catch(sfErr);
      window.Cloud.applySfida(x, u, pa).then(() => { closeDialog(); toast(T("Candidatura della coppia inviata: la deve confermare chi ha lanciato la sfida."), 'ok'); }).catch(sfErr);
    },
    'sf-guest': (v, f) => {
      const x = sfById(v.id);
      if (!x) return closeDialog();
      if (sfFull(x)) return formError(f, `${T("Hai già raggiunto il numero massimo di persone ({0}).", [sfMax(x)])}`);
      const g = { nome: v.nome.trim(), cognome: v.cognome.trim(), sesso: v.sesso };
      if (!g.nome || !g.cognome || !g.sesso) return formError(f, T("Compila nome, cognome e sesso."));
      const guests = (x.guests || []).concat([g]);
      window.Cloud.updateSfida(x.id, { guests, conf: sfCount(Object.assign({}, x, { guests })) }).then(() => { closeDialog(); toast(T("Giocatore aggiunto."), 'ok'); }).catch(sfErr);
    },
    login: async (v, f) => {
      try {
        await Store.login(v.email, v.password);
        toast(T("Accesso effettuato."), 'ok');
        render();
      } catch (e) { formError(f, e.message); }
    },
    register: async (v, f) => {
      try {
        await Store.register(Object.assign({}, v, { tema: Temi.saved() || '' }));
        toast(T("Account creato! Controlla la posta per confermare l’email."), 'ok');
        render();
      } catch (e) { formError(f, e.message); }
    },
    profile: v => {
      Object.assign(me(), { nome: v.nome.trim(), cognome: v.cognome.trim(), tel: v.tel.trim(), sesso: v.sesso, livello: Number(v.livello) || null });
      save();
      toast(T("Dati salvati."), 'ok');
    },
    articolo: v => {
      const i = Number(v.i), list = S().articoli = (S().articoli || []).slice();
      while (list.length < ARTICOLI) list.push({ titolo: '', testo: '', foto: '', link: '', linkTesto: '' });
      const foto = ui.artFoto && ui.artFoto[i] != null ? ui.artFoto[i] : articolo(i).foto;
      list[i] = { titolo: v.titolo.trim(), testo: v.testo.trim(), foto, link: v.link.trim(), linkTesto: v.linkTesto.trim() };
      if (ui.artFoto) delete ui.artFoto[i];
      save();
      toast(T("Articolo salvato: è visibile in home."), 'ok');
    },
    court: (v, f) => {
      const c = S().courts.find(x => x.id === v.id);
      const orari = {};
      for (let dd = 1; dd <= 7; dd++) {
        const o = { aperto: f.elements['aperto' + dd].checked, apre: v['apre' + dd], chiude: v['chiude' + dd] };
        if (o.aperto && o.chiude <= o.apre) return toast(`${T("{0}: l’orario di chiusura deve essere dopo l’apertura.", [DAYS[dd]])}`, 'err');
        orari[dd] = o;
      }
      Object.assign(c, { nome: v.nome.trim() || c.nome, visibile: f.elements.visibile.checked, orari });
      save();
      toast(T("Campo salvato."), 'ok');
    },
    tour: (v, f) => {
      const s = S();
      let t = v.id ? tourById(v.id) : null;
      const formato = t && t.seeds ? t.formato : v.formato;
      const config = {
        sets: Number(v.sets), punti: Number(v.punti), puntiDecisivo: Number(v.puntiDecisivo || v.punti),
        poolSize: Number(v.poolSize) || 4, qualify: Number(v.qualify) || 1, poolType: v.poolType,
        thirdPlace: f.elements.thirdPlace.checked, criterio: v.criterio,
        turni: Number(formato === 'americana_tempo' ? v.tTurni : v.turni) || 1, campi: Number(formato === 'americana_tempo' ? v.tCampi : v.campi) || 0,
        poolPlayers: Number(v.poolPlayers) || 8, poolTurni: Number(v.poolTurni) || 1, finalisti: Number(v.finalisti) || 8,
        squadre: t && t.seeds ? t.config.squadre : f.elements.squadre.value, minuti: Number(v.minuti) || 15, maxPartite: Number(v.maxPartite) || 1,
        criterioTempo: v.criterioTempo, criterioRot: v.criterioRot || 'punti', vincolo: v.vincolo || (t ? t.config.vincolo : 'equilibrato') || 'equilibrato'
      };
      const puntiRows = parseRows(v.puntiRows || '');
      if (v.categoriaId === 'custom' && !puntiRows.length) return formError(f, T("Inserisci la tabella punti del torneo (es. 1=100)."));
      const data = {
        nome: v.nome.trim(), data: v.data, luogo: v.luogo.trim(), categoriaId: v.categoriaId, puntiRows: v.categoriaId === 'custom' ? puntiRows : null,
        coefficiente: v.coefficiente === '' ? 1 : Number(v.coefficiente),
        disciplina: t && t.seeds ? t.disciplina : Logic.isIndividual(formato) || formato === 'americana_tempo' ? 'doppio' : v.disciplina,
        genere: t && t.seeds ? t.genere : v.genere, formato, maxIscritti: Number(v.maxIscritti) || 0,
        iscrizioniAperte: f.elements.iscrizioniAperte.checked, descrizione: v.descrizione.trim(), livelli: readLevels(f),
        lega: 'lega' in v ? v.lega : (t ? t.lega || '' : '')
      };
      if (t) {
        if (t.seeds && t.formato === 'gironi_ko' && config.qualify !== t.config.qualify && t.bracket) Logic.resetBracket(t);
        Object.assign(t, data);
        Object.assign(t.config, config);
      } else {
        t = Logic.normalize(Object.assign({ id: Store.uid('t'), entries: [], config }, data));
        s.tournaments.push(t);
      }
      const fromScheda = !$dialog.open;
      closeDialog();
      location.hash = '#/tornei/' + t.id;
      save();
      if (fromScheda) toast(T("Scheda del torneo salvata."), 'ok');
    },
    'entry-bulk': (v, f) => {
      const t = tourById(v.tid);
      const list = parseBulk(v.elenco, v.sesso);
      if (!list.length) return formError(f, T("Nessun nome trovato: scrivi un giocatore per riga (nome e cognome)."));
      if (t.genere !== 'open' && list.some(x => !x.sesso)) return formError(f, T("Indica il sesso: scegline uno qui sotto oppure scrivi “Donne” e “Uomini” prima dei nomi."));
      if (t.genere === 'M' && list.some(x => x.sesso !== 'M')) return formError(f, T("Torneo maschile: l’elenco contiene delle donne."));
      if (t.genere === 'F' && list.some(x => x.sesso !== 'F')) return formError(f, T("Torneo femminile: l’elenco contiene degli uomini."));
      let added = 0, skipped = 0;
      list.forEach(x => {
        if (t.maxIscritti && t.entries.length >= t.maxIscritti) { skipped++; return; }
        const pl = playerFor(x);
        if (t.entries.some(e => e.p1 === pl.id || e.p2 === pl.id)) { skipped++; return; }
        t.entries.push({ id: Store.uid('e'), p1: pl.id, p2: null, guest: null, livello: Number(v.livello) || null });
        added++;
      });
      closeDialog();
      save();
      toast(`${T("{0} giocatori inseriti", [added])}${skipped ? `, ${T("{0} già presenti o oltre il limite", [skipped])}` : ''}.`, 'ok');
    },
    entry: (v, f) => {
      const t = tourById(v.tid);
      if (v.p1 === '__guest' && canTours()) {
        const guest = { nome: (v.gNome || '').trim(), cognome: (v.gCognome || '').trim(), sesso: v.gSesso || '' };
        if (!guest.nome || !guest.cognome) return formError(f, T("Scrivi nome e cognome del giocatore."));
        if (t.genere !== 'open' && !guest.sesso) return formError(f, T("Indica il sesso del giocatore."));
        if (t.genere === 'M' && guest.sesso !== 'M') return formError(f, T("Torneo maschile: possono iscriversi solo uomini."));
        if (t.genere === 'F' && guest.sesso !== 'F') return formError(f, T("Torneo femminile: possono iscriversi solo donne."));
        if (!v.eid && t.maxIscritti && t.entries.length >= t.maxIscritti) return formError(f, T("Numero massimo di iscritti raggiunto."));
        const pl = playerFor(guest);
        if (t.entries.some(x => x.id !== v.eid && x.p1 === pl.id)) return formError(f, T("Questo giocatore è già iscritto."));
        const data = { p1: pl.id, p2: null, guest: null, livello: Number(v.livello) || null };
        if (v.eid) Object.assign(t.entries.find(e => e.id === v.eid), data);
        else t.entries.push(Object.assign({ id: Store.uid('e') }, data));
        closeDialog();
        save();
        return toast(T("Iscrizione salvata."), 'ok');
      }
      if (!v.p1) return formError(f, T("Scegli il giocatore."));
      if (v.p2 && v.p2 === v.p1) return formError(f, T("Il compagno deve essere un’altra persona."));
      const taken = new Set(t.entries.filter(e => e.id !== v.eid).flatMap(Logic.entryPlayers));
      if (taken.has(v.p1) || (v.p2 && taken.has(v.p2))) return formError(f, T("Uno dei giocatori è già iscritto."));
      const lgErr = legaError(t.lega, [v.p1, v.p2].filter(id => id && registered(S().users.find(u => u.id === id))));
      if (lgErr && !canTours()) return formError(f, lgErr);
      if (lgErr && !confirm(lgErr + T("\nAbilitarlo/a alla lega e iscriverlo/a?"))) return;
      if (lgErr) { const lg = legaById(t.lega); [v.p1, v.p2].filter(Boolean).forEach(id => { if (registered(S().users.find(u => u.id === id)) && !lg.membri.includes(id)) lg.membri.push(id); }); }
      const lErr = levelError(t.livelli, [v.p1, v.p2]);
      if (lErr && !canTours()) return formError(f, lErr);
      if (lErr && !confirm(lErr + T("\nIscrivere comunque?"))) return;
      const gErr = genderError(t, [v.p1, v.p2]);
      if (gErr) return formError(f, gErr);
      if (!v.eid && t.maxIscritti && t.entries.length >= t.maxIscritti) return formError(f, T("Numero massimo di iscritti raggiunto."));
      const data = { p1: v.p1, p2: v.p2 || null, guest: null, livello: 'livello' in v ? Number(v.livello) || null : (v.eid && t.entries.find(e => e.id === v.eid).livello) || null };
      if (v.eid) Object.assign(t.entries.find(e => e.id === v.eid), data);
      else t.entries.push(Object.assign({ id: Store.uid('e') }, data));
      closeDialog();
      save();
      toast(canTours() ? T("Iscrizione salvata.") : T("Iscrizione confermata!"), 'ok');
    },
    result: (v, f) => {
      const t = tourById(v.tid), m = findMatch(t, v.key);
      const fix = applyPlayers(t, v);
      if (fix.err) return formError(f, fix.err);
      const also = fix.swapped && fix.swapped.length ? ` ${T("Scambio fatto anche in: {0}.", [fix.swapped.join(', ')])}` : '';
      const done = msg => { closeDialog(); save(); if (msg) toast(msg + also, 'ok'); };
      if (t.tempo) {
        const pa = num(v.pa), pb = num(v.pb);
        if (pa == null && pb == null && (fix.changed || !t.results[v.key])) return fix.changed ? done(T("Giocatori della gara corretti.")) : formError(f, T("Inserisci i punti di entrambe le coppie."));
        if (pa == null || pb == null || pa < 0 || pb < 0 || !Number.isInteger(pa) || !Number.isInteger(pb)) return formError(f, T("Inserisci i punti di entrambe le coppie."));
        const mm = findMatch(t, v.key);
        t.results[v.key] = { a: mm.a, b: mm.b, pa, pb, closed: true };
        if (fix.changed) return done(T("Giocatori e risultato salvati."));
        return done('');
      }
      const n = Number(t.config.sets) === 3 ? 3 : 1, sets = [];
      if (fix.changed && ![...Array(n).keys()].some(i => num(v['a' + i]) != null || num(v['b' + i]) != null) && !t.results[v.key]) return done(T("Giocatori della gara corretti."));
      for (let i = 0; i < n; i++) {
        const a = num(v['a' + i]), b = num(v['b' + i]);
        if (a == null && b == null) continue;
        if (a == null || b == null) return formError(f, `${T("Completa il set {0}.", [i + 1])}`);
        sets.push([a, b]);
      }
      const forfeit = v.forfeit || null;
      const err = Logic.validateResult(sets, forfeit, t.config);
      if (err) return formError(f, err);
      t.results[v.key] = Array.isArray(m.a) ? { sets, closed: true } : { a: m.a, b: m.b, sets: forfeit ? [] : sets, forfeit, closed: true };
      closeDialog();
      save();
    },
    'final-pairs': v => {
      const t = tourById(v.tid);
      const last = t.fantasma.ko[t.fantasma.ko.length - 1];
      const redo = last && last.final && !Logic.fantasmaNextIds(t);
      const ids = redo ? last.ids : Logic.fantasmaNextIds(t);
      const a = [v.p0, v.mate], b = ids.filter(id => !a.includes(id));
      if (redo) Logic.fantasmaSetFinal(t, [a, b]); else Logic.fantasmaAdvance(t, [a, b]);
      ui.tab[t.id] = 'fko';
      closeDialog();
      save();
      toast(T("Finale composta."), 'ok');
    },
    course: (v, f) => {
      const s = S();
      const data = {
        tipo: v.tipo, livello: v.livello.trim(), titolo: v.titolo.trim(), descrizione: v.descrizione.trim(), inizio: v.inizio, fine: v.fine || v.inizio,
        orario: v.orario.trim(), istruttore: v.istruttore.trim(), posti: Number(v.posti) || 1, prezzo: Number(v.prezzo) || 0, promo: f.elements.promo.checked
      };
      if (v.id) Object.assign(s.courses.find(c => c.id === v.id), data);
      else s.courses.push(Object.assign({ id: Store.uid('k'), iscritti: [] }, data));
      closeDialog();
      save();
    },
    settings: v => {
      Object.assign(S().settings, { nome: v.nome.trim() || T("Pickleball Club"), avviso: v.avviso.trim() });
      save();
      toast(T("Impostazioni salvate."), 'ok');
    },
    premi: v => {
      const nums = t => String(t || '').split(/[,;\s]+/).map(Number).filter(x => x > 0).sort((a, b) => a - b);
      S().settings.premi = { stelle: nums(v.stelle), passoStelle: Math.max(1, Number(v.passoStelle) || 1), trofei: nums(v.trofei).slice(0, 5), racchette: nums(v.racchette).slice(0, 5) };
      ui.counts = Object.assign({}, ui.counts);
      save();
      toast(T("Premi salvati."), 'ok');
    },
    'sfide-punti': (v, f) => {
      const rows = parseRows(v.rows);
      if (!rows || !rows.length) return toast(T("Inserisci almeno una riga, es. 1=100."), 'err');
      S().settings.sfidePunti = rows;
      save();
      toast(T("Punti delle sfide salvati."), 'ok');
    },
    'sf-modifica': (v, f) => {
      const x = sfById(v.id);
      if (!x || !(sfMine(x) || isAdmin())) return closeDialog();
      const n = k => Math.max(0, Math.round(Number(v[k]) || 0));
      const ch = { data: v.data, ora: v.ora, luogo: (v.luogo || '').trim(), campi: Number(v.campi) === 2 ? 2 : 1,
        cercaM: n('cercaM'), cercaF: n('cercaF'), cercaTot: n('cercaTot'), max: n('max'), nota: (v.nota || '').trim(), livelli: x.privata ? x.livelli || [] : readLevels(f) };
      if (x.privata) { ch.invitati = readInvitati(f); if (!ch.invitati.length) return formError(f, T("Scegli almeno una persona da invitare.")); }
      if (!ch.data || !ch.ora) return formError(f, T("Indica data e ora."));
      const sought = x.modo === 'sesso' ? ch.cercaM + ch.cercaF : ch.cercaTot;
      if (sought < 1) return formError(f, T("Indica quante persone cerchi."));
      if (!ch.max) ch.max = sought;
      if (ch.max < sought) return formError(f, `${T("Il numero massimo di persone non può essere minore di quelle cercate ({0}).", [sought])}`);
      window.Cloud.updateSfida(x.id, ch).then(() => { closeDialog(); toast(T("Sfida aggiornata."), 'ok'); }).catch(sfErr);
    },
    category: v => {
      Object.assign(S().categories.find(c => c.id === v.id), { nome: v.nome.trim() || T("Tipologia"), rows: parseRows(v.rows) });
      save();
      toast(T("Tipologia salvata."), 'ok');
    },
    'player-edit': (v, f) => {
      const u = S().users.find(x => x.id === v.id);
      const nome = v.nome.trim(), cognome = v.cognome.trim();
      if (!u) return closeDialog();
      if (!nome || !cognome || !v.sesso) return formError(f, T("Compila nome, cognome e sesso."));
      const other = S().users.find(x => x.id !== u.id && !x.email && !u.email && nameKey(x.nome, x.cognome) === nameKey(nome, cognome) && x.sesso === v.sesso);
      if (other && !confirm(`${T("C’è già {0} {1} nell’elenco: i due verranno uniti in un solo giocatore. Continuare?", [nome, cognome])}`)) return;
      Object.assign(u, { nome, cognome, sesso: v.sesso, livello: Number(v.livello) || null });
      closeDialog();
      save();
      toast(T("Giocatore aggiornato."), 'ok');
    },
    'player-add': (v, f) => {
      S().users.push({ id: Store.uid('u'), nome: v.nome.trim(), cognome: v.cognome.trim(), sesso: v.sesso, email: '', pw: '', role: 'user', tel: '' });
      f.reset();
      save();
      toast(T("Giocatore aggiunto."), 'ok');
    }
  };

  // Azioni consentite senza essere amministratori.
  const PUBLIC = new Set(['lang', 'set-lang', 'am-sort', 'tour-pdf', 'pick-date', 'timer-sound', 'timer-full', 'rank-cat', 'close-dialog', 'theme', 'set-theme', 'logout', 'reset-password', 'verify-resend', 'verify-check', 'auth-tab', 'day', 'band', 'slot', 'sel-clear', 'sel-shorter', 'sel-longer', 'booking-open', 'booking-confirm', 'booking-delete', 'notice-dismiss', 'tour-tab', 'tour-join', 'tour-leave', 'player', 'course-join', 'course-leave']);
  const PUBLIC_FORMS = new Set(['login', 'register', 'profile', 'entry']);
  // Azioni e moduli del gestore tornei.
  const TOUR = new Set(['tour-new', 'tour-edit', 'tour-toggle-reg', 'entry-add', 'entry-edit', 'entry-remove', 'entry-bulk', 'tour-draw', 'tour-undraw',
    'tour-redraw', 'tour-bracket', 'tour-close', 'tour-reopen', 'tour-delete', 'fantasma-next', 'fantasma-undo', 'final-pairs', 'result', 'result-clear',
    'timer-start', 'timer-pause', 'timer-resume', 'timer-reset']);
  const TOUR_FORMS = new Set(['tour', 'entry-bulk', 'result', 'final-pairs']);
  // Sfide: i controlli (accesso, chi organizza) sono nelle azioni e nelle regole del database.
  const SFIDE = new Set(['sf-candida', 'sf-ritira', 'sf-risp', 'sf-guest', 'sf-guest-del', 'sf-chiudi', 'sf-riapri', 'sf-elimina', 'sf-torneo', 'sf-visto', 'sf-modifica', 'notifiche', 'notif-no', 'notif-vai', 'gruppo-usa', 'gruppo-salva', 'gruppo-elimina']);
  const SFIDE_FORMS = new Set(['sfida', 'sf-guest', 'sf-coppia', 'lega', 'sf-modifica']);
  ['lega-tab', 'lega-kind', 'lega-tour', 'lega-sfida', 'lega-remove-tour', 'lega-del-membro', 'lega-chiudi', 'lega-riapri'].forEach(a => SFIDE.add(a));

  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('date-native')) { try { e.target.showPicker(); } catch (err) {} return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (!actions[a]) return;
    if (TOUR.has(a)) { curTour = null; if (el.dataset.id) tourById(el.dataset.id); else if (location.hash.startsWith('#/tornei/')) tourById(location.hash.split('/')[2]); }
    if (!PUBLIC.has(a) && !isAdmin() && !(TOUR.has(a) && canTours()) && !SFIDE.has(a)) return;
    if (el.tagName !== 'A') e.preventDefault();
    if (a === 'close-dialog' && el.tagName === 'A') closeDialog();
    else actions[a](el.dataset, el, e);
  });

  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
    if (e.target.closest('form.tour-form')) syncTourForm();
  });

  // Modifiche non ancora salvate nella scheda: gli aggiornamenti dal database aspettano il salvataggio.
  document.addEventListener('input', e => {
    const f = e.target.closest && e.target.closest('form.scheda, form.sf-form');
    if (f) f.dataset.dirty = '1';
    if (e.target.matches && e.target.matches('[data-invite-filter]')) {
      const q = e.target.value.trim().toLowerCase();
      e.target.closest('.invite-box').querySelectorAll('.invite-list label').forEach(l => { l.hidden = !!q && !l.dataset.name.includes(q); });
    }
  });
  document.addEventListener('change', e => { const f = e.target.closest && e.target.closest('form.sf-form'); if (f) f.dataset.dirty = '1'; });

  document.addEventListener('submit', e => {
    const f = e.target, name = f.dataset.form;
    if (!forms[name]) return;
    e.preventDefault();
    if (TOUR_FORMS.has(name)) { curTour = null; const id = (f.elements.tid && f.elements.tid.value) || (name === 'tour' && f.elements.id && f.elements.id.value); if (id) tourById(id); }
    // un admin di lega crea i tornei della sua lega
    const legaTour = name === 'tour' && f.elements.lega && myLeghe().some(l => l.id === f.elements.lega.value);
    if (!PUBLIC_FORMS.has(name) && !isAdmin() && !(TOUR_FORMS.has(name) && (canTours() || legaTour)) && !SFIDE_FORMS.has(name)) return;
    const v = Object.fromEntries(new FormData(f));
    // Date scritte gg/mm/aaaa -> AAAA-MM-GG.
    for (const el of f.querySelectorAll('input[data-date]')) {
      if (!el.value.trim()) { v[el.name] = ''; continue; }
      const iso = parseItDate(el.value);
      if (!iso) { formError(f, `${T("Data non valida: scrivi nel formato gg/mm/aaaa (es. {0}).", [itDate(todayKey())])}`); el.focus(); return; }
      v[el.name] = iso;
    }
    forms[name](v, f);
  });

  $dialog.addEventListener('click', e => { if (e.target === $dialog) closeDialog(); });
  $dialog.addEventListener('close', () => { if (pendingRender) refresh(); });
  $app.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) refresh(); }, 0));
  window.addEventListener('hashchange', () => { closeDialog(); render(); window.scrollTo(0, 0); });

  render();

  return { render, refresh, toast, error: cloudError };
})();
window.App = App;
