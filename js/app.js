// Interfaccia: pagine, dialoghi e azioni.
const App = (() => {
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('dialog');
  const S = () => Store.state;
  const me = () => Store.current();
  const isAdmin = () => { const u = me(); return !!u && u.role === 'admin'; };
  // Gestore tornei: gestisce i tornei (anche l'admin lo è), senza accesso al resto dell'amministrazione.
  const canTours = () => isAdmin() || (!!me() && me().role === 'tornei');

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayKey = () => new Date().toLocaleDateString('sv');
  const nowHM = () => new Date().toTimeString().slice(0, 5);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); };
  const fmtDate = (d, long) => (d ? new Date(d + 'T12:00').toLocaleDateString('it-IT', long
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
      <span class="date-pick"><button type="button" class="btn icon" data-action="pick-date" aria-label="Apri il calendario">${icon('calendar')}</button>
        <input type="date" class="date-native" value="${iso || ''}" data-change="date-native" tabindex="-1" aria-hidden="true" ${o.min ? `min="${o.min}"` : ''}></span></span>`;
  }
  const money = n => (Number(n) ? `€ ${Number(n).toLocaleString('it-IT')}` : 'Gratuito');

  const DISCIPLINE = { singolo: 'Singolo', doppio: 'Doppio' };
  const GENERI = { open: 'Open', M: 'Maschile', F: 'Femminile', misto: 'Misto' };
  const SESSI = { M: 'Uomo', F: 'Donna' };
  // Iscrizione a coppie fisse (doppio classico); americana e fantasma sono individuali.
  const isPairs = t => t.disciplina === 'doppio' && !Logic.individualEntry(t);

  const ui = { sel: null, date: todayKey(), tab: {}, rank: { cat: 'generale_m', categoriaId: '' }, counts: {}, admMonth: null, admDay: null, admAll: false, authTab: 'login' };

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
    if (isPairs(t)) names.push(e.p2 ? userName(e.p2) : '<em>compagno da definire</em>');
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
    toast(code === 'permission-denied' ? 'Operazione non consentita (forse lo slot è già stato prenotato o le iscrizioni sono chiuse).'
      : 'Errore di collegamento al database' + (code ? ` (${code})` : '') + '.', 'err');
  }

  // ---------- temi ----------

  const applyTheme = (th, save) => Temi.apply(th, save);

  function themeDialog() {
    const cur = document.documentElement.dataset.theme || Temi.DEFAULT;
    Temi.loadAll();
    const scroll = $dialog.open ? ($dialog.querySelector('.theme-grid') || {}).scrollTop : 0;
    openDialog(`
      <h2>${icon('palette')} Scegli il tuo stile</h2>
      <p class="muted small">Colori, caratteri e decorazioni cambiano in tutta l’app. Tocca un tema per provarlo.</p>
      <div class="theme-grid">
        ${Object.entries(Temi.LIST).map(([k, v]) => `
          <button type="button" class="theme-card ${k === cur ? 'on' : ''}" data-action="set-theme" data-pick="${k}" aria-pressed="${k === cur}">
            <span class="tp" data-theme="${k}">
              <span class="tp-top"><i></i><i></i></span>
              <span class="tp-hero">Aa</span>
              <span class="tp-slots"><i class="f"></i><i class="f"></i><i class="b"></i><i class="s"></i><i class="f"></i></span>
            </span>
            <strong>${v.nome}</strong><small>${v.desc}</small>
          </button>`).join('')}
      </div>
      <p class="muted small">${me() ? 'La scelta viene salvata nel tuo profilo.' : 'La scelta vale per questo dispositivo. Accedi per salvarla nel profilo.'}</p>
      <div class="actions"><button type="button" class="btn" data-action="close-dialog">Chiudi</button></div>`);
    const g = $dialog.querySelector('.theme-grid');
    if (g && scroll) g.scrollTop = scroll;
  }

  // ---------- dialoghi ----------

  function openDialog(html) {
    $dialog.innerHTML = `<div class="dialog-body">${html}</div>`;
    if (!$dialog.open) $dialog.showModal();
    const first = $dialog.querySelector('input:not([type=hidden]), select, textarea');
    if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
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
    if (t.categoriaId === 'custom') return 'punti personalizzati';
    const cat = S().categories.find(c => c.id === t.categoriaId);
    return cat ? cat.nome : 'senza punti in classifica';
  }

  // Nome del giocatore iscritto (formule individuali).
  const pname = (t, id) => { const e = t.entries.find(x => x.id === id); return esc(e ? guestName(e) || userName(e.p1) : '—'); };
  // Lato di una gara: squadra (id) oppure coppia del turno ([id, id]).
  const sideName = (t, side) => (Array.isArray(side) ? side.map(id => pname(t, id)).join(' + ') : teamName(t, side));

  function tourCard(t) {
    return `
      <a class="card tour-card" href="#/tornei/${t.id}">
        <div class="tour-date"><strong>${t.data ? new Date(t.data + 'T12:00').getDate() : '?'}</strong><small>${t.data ? new Date(t.data + 'T12:00').toLocaleDateString('it-IT', { month: 'short' }) : ''}</small></div>
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
        ${c.promo ? `<span class="ribbon">${icon('star')} In evidenza</span>` : ''}
        <p class="kicker">${c.tipo === 'lezione' ? 'Lezione' : c.tipo === 'clinic' ? 'Clinic' : 'Corso'} · ${esc(c.livello || 'Tutti i livelli')}</p>
        <h3>${esc(c.titolo)}</h3>
        ${full ? `<p>${esc(c.descrizione)}</p>` : ''}
        <ul class="facts">
          <li>${icon('calendar')} ${fmtDate(c.inizio)}${c.fine && c.fine !== c.inizio ? ' → ' + fmtDate(c.fine) : ''}</li>
          ${c.orario ? `<li>${icon('clock')} ${esc(c.orario)}</li>` : ''}
          ${c.istruttore ? `<li>${icon('user-star')} ${esc(c.istruttore)}</li>` : ''}
          <li>${icon('ticket')} ${money(c.prezzo)}</li>
          <li>${icon('users')} ${left ? `${left} posti liberi su ${c.posti}` : 'Completo'}</li>
        </ul>
        <div class="actions">
          ${!full ? `<a class="btn" href="#/corsi">Dettagli</a>` : ''}
          ${full && !past ? (mine
            ? `<span class="badge done">${icon('check')} Sei iscritto</span><button class="btn" data-action="course-leave" data-id="${c.id}">Annulla iscrizione</button>`
            : `<button class="btn primary" data-action="course-join" data-id="${c.id}" ${left ? '' : 'disabled'}>Iscriviti</button>`) : ''}
          ${full && isAdmin() ? `<button class="btn" data-action="course-edit" data-id="${c.id}">${icon('pencil')} Modifica</button>` : ''}
        </div>
        ${full && isAdmin() ? `<details class="enrolled"><summary>Iscritti (${n})</summary>${n ? `<ol>${c.iscritti.map(id => `<li>${esc(userName(id))} <button class="link danger" data-action="course-kick" data-id="${c.id}" data-user="${id}">rimuovi</button></li>`).join('')}</ol>` : '<p class="muted small">Nessun iscritto.</p>'}</details>` : ''}
      </article>`;
  }

  // ---------- home ----------

  function viewHome() {
    const s = S(), u = me();
    const next = s.tournaments.filter(t => !t.closed).sort((a, b) => (a.data || '').localeCompare(b.data || '')).slice(0, 4);
    const promo = s.courses.filter(c => c.promo && (c.fine || c.inizio) >= todayKey());
    const mine = u ? myBookings(u).slice(0, 3) : [];
    return `
      ${noticesBlock()}
      <section class="hero">
        <div>
          <p class="kicker">${u ? `Ciao ${esc(u.nome)}!` : 'Benvenuto'}</p>
          <h1>${esc(s.settings.nome)}</h1>
          <p>Prenota un campo, iscriviti a tornei e corsi, segui classifiche e risultati.</p>
          <div class="actions">
            <a class="btn primary big" href="#/prenota">${icon('calendar-plus')} Prenota un campo</a>
            <a class="btn big" href="#/tornei">${icon('trophy')} Tornei</a>
          </div>
        </div>
        <div class="hero-ball" aria-hidden="true"></div>
      </section>
      ${s.settings.avviso ? `<div class="notice">${icon('speakerphone')} <span>${esc(s.settings.avviso)}</span></div>` : ''}
      ${editorialBlock()}
      ${u ? `<section>${sectionHead('Le tue prossime prenotazioni', '<a href="#/profilo">Tutte</a>')}
        ${mine.length ? `<div class="list">${mine.map(bookingItem).join('')}</div>` : empty('Nessuna prenotazione in programma.', 'calendar')}</section>` : ''}
      <section>${sectionHead('Tornei in programma', '<a href="#/tornei">Tutti</a>')}
        ${next.length ? `<div class="grid">${next.map(tourCard).join('')}</div>` : empty('Nessun torneo in programma.', 'trophy')}</section>
      <section>${sectionHead('Corsi e lezioni in evidenza', '<a href="#/corsi">Tutti</a>')}
        ${promo.length ? `<div class="grid">${promo.map(c => courseCard(c, false)).join('')}</div>` : empty('Nessun corso in evidenza.', 'school')}</section>`;
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
    return `<section>${sectionHead('In evidenza')}<div class="articles">${list.map(a => `
      <article class="card article">
        ${a.foto ? `<img class="article-img" src="${esc(a.foto)}" alt="">` : '<div class="article-img ball" aria-hidden="true"><span class="hero-ball"></span></div>'}
        <div class="article-body">
          ${a.titolo ? `<h3>${esc(a.titolo)}</h3>` : ''}
          ${paragraphs(a.testo)}
          ${a.link ? `<a class="btn small" href="${esc(safeUrl(a.link))}" ${a.link.startsWith('#/') ? '' : 'target="_blank" rel="noopener"'}>${esc(a.linkTesto || 'Scopri di più')} ${icon('arrow-right')}</a>` : ''}
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
      img.onerror = () => reject(new Error('Immagine non leggibile.'));
      img.src = URL.createObjectURL(file);
    });
  }

  function articleForm(i) {
    const a = articolo(i), foto = ui.artFoto && ui.artFoto[i] != null ? ui.artFoto[i] : a.foto;
    return `<form data-form="articolo" class="article-form"><input type="hidden" name="i" value="${i}">
      <h3>Articolo ${i + 1}</h3>
      <div class="article-edit">
        <div class="article-thumb">${foto ? `<img src="${esc(foto)}" alt="">` : '<div class="ball"><span class="hero-ball"></span></div>'}</div>
        <div class="actions tight">
          <label class="btn small">${icon('photo')} ${foto ? 'Cambia foto' : 'Carica foto'}<input type="file" accept="image/*" data-change="art-foto" data-i="${i}" hidden></label>
          ${foto ? `<button type="button" class="btn small danger" data-action="art-foto-del" data-i="${i}">Togli foto</button>` : ''}
        </div>
      </div>
      <label>Titolo<input name="titolo" value="${esc(a.titolo)}" maxlength="120"></label>
      <label>Testo<textarea name="testo" rows="4" maxlength="1500">${esc(a.testo)}</textarea></label>
      <div class="row">
        <label>Link (facoltativo)<input name="link" value="${esc(a.link)}" placeholder="https://… oppure #/tornei"></label>
        <label>Scritta del link<input name="linkTesto" value="${esc(a.linkTesto)}" placeholder="Scopri di più"></label>
      </div>
      <div class="actions tight"><button type="button" class="btn small danger" data-action="art-clear" data-i="${i}">Svuota articolo</button><button class="btn small primary">Salva articolo</button></div>
    </form>`;
  }

  // ---------- prenotazioni campi ----------
  // Slot di mezz'ora: verde libero, rosso occupato, giallo selezione. Si prenota per multipli di 30 minuti.

  const BANDS = { tutto: 'Tutto il giorno', mattina: 'Mattina · 8–13', pomeriggio: 'Pomeriggio · 13–18', sera: 'Sera · 18–24' };
  const DAYS = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
  const fromMin = n => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  const addMin = (hm, n) => fromMin(toMin(hm) + n);
  const dow = date => { const d = new Date(date + 'T12:00').getDay(); return d === 0 ? 7 : d; };
  const durata = (from, to) => { const n = toMin(to) - toMin(from), h = Math.floor(n / 60), m = n % 60; return (h ? h + (h === 1 ? ' ora' : ' ore') : '') + (h && m ? ' e ' : '') + (m ? m + ' minuti' : ''); };
  // Orari del giorno a mezz'ore, per le select (06:00 – 24:00).
  const HALF_HOURS = Array.from({ length: 37 }, (_, i) => fromMin(360 + i * 30));

  const isPast = (date, start) => date < todayKey() || (date === todayKey() && start <= nowHM());
  const courtName = id => { const c = S().courts.find(x => x.id === id); return c ? c.nome : 'Campo eliminato'; };
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
      <div class="actions tight"><button class="btn small" data-action="booking-open" data-id="${b.id}">Modifica</button>
      <button class="btn small danger" data-action="booking-delete" data-id="${b.id}">Cancella</button></div></div>`;
  }

  // Avvisi (prenotazioni modificate o cancellate) ben visibili in cima alla home e alla pagina Prenota.
  function noticesBlock() {
    const list = (S().notifiche || []);
    if (!me() || !list.length) return '';
    return `<section class="alerts">${list.map(n => `<div class="alert">
      ${icon('bell-ringing')}<div><strong>${n.to === 'admins' ? 'Avviso per gli amministratori' : 'Avviso'}</strong><p>${esc(n.text)}</p>
      <span class="muted small">${new Date(n.at).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
      <button class="btn small" data-action="notice-dismiss" data-id="${n.id}">OK, letto</button></div>`).join('')}</section>`;
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
    const legend = `<div class="legend"><span><i class="sw free"></i>Libero</span><span><i class="sw busy"></i>Occupato</span>
      <span><i class="sw sel"></i>Selezionato</span><span><i class="sw off"></i>Chiuso / non prenotabile</span></div>`;
    if (!sel) {
      return `<h3>${icon('calendar-plus')} La tua prenotazione</h3>
        <p class="muted small">${u ? 'Tocca uno slot <strong>verde</strong> per iniziare, poi gli slot successivi dello stesso campo per allungare la prenotazione (a mezz’ore).' : 'Per prenotare devi <a href="#/profilo">accedere o registrarti</a>.'}</p>${legend}`;
    }
    const orig = sel.editId && S().bookings.find(b => b.id === sel.editId);
    const changed = orig && (orig.courtId !== sel.courtId || orig.date !== sel.date || orig.from !== sel.from || orig.to !== sel.to || (orig.userId || '') !== (sel.userId || '') || (orig.blocked || '') !== (sel.blocked || ''));
    const canLonger = selFree(sel.courtId, sel.date, sel.from, addMin(sel.to, 30), sel.editId);
    const adminFields = isAdmin() ? `
      <label>Prenotazione per<select name="user" data-change="sel-user"><option value="">${orig ? '—' : 'Me stesso'}</option>${playerOptions(null, sel.userId || (orig ? '' : u.id))}</select></label>
      <label>Oppure blocca con motivo<input name="blocked" value="${esc(sel.blocked || '')}" data-change="sel-blocked" placeholder="Es. manutenzione, lezione"></label>` : '';
    return `<h3>${icon(orig ? 'pencil' : 'calendar-plus')} ${orig ? 'Modifica prenotazione' : 'Riepilogo della prenotazione'}</h3><div class="summary-body"><div>
      ${orig ? `<p class="muted small">Prenotazione di <strong>${esc(orig.blocked ? 'blocco: ' + orig.blocked : userName(orig.userId))}</strong>: ${esc(bookingText(orig))}.
        Tocca gli slot per spostarla o cambiarne la durata.</p>` : ''}
      <dl class="summary">
        <dt>Campo</dt><dd>${esc(courtName(sel.courtId))}</dd>
        <dt>Giorno</dt><dd>${fmtDate(sel.date, true)}</dd>
        <dt>Orario</dt><dd><strong>${sel.from} – ${sel.to}</strong></dd>
        <dt>Durata</dt><dd>${durata(sel.from, sel.to)}</dd>
      </dl>
      <div class="actions tight">
        <button class="btn small" data-action="sel-shorter" ${toMin(sel.to) - toMin(sel.from) <= 30 ? 'disabled' : ''}>− 30 min</button>
        <button class="btn small" data-action="sel-longer" ${canLonger ? '' : 'disabled'}>+ 30 min</button>
      </div></div><div>
      ${adminFields}
      <div class="actions">
        ${orig ? `<button class="btn primary" data-action="booking-confirm" ${changed ? '' : 'disabled'}>${icon('check')} Salva modifiche</button>
          <button class="btn danger" data-action="booking-delete" data-id="${orig.id}">${icon('trash')} Cancella</button>`
        : `<button class="btn primary big wide" data-action="booking-confirm">${icon('check')} Conferma prenotazione</button>`}
        <button class="btn" data-action="sel-clear">${orig ? 'Chiudi' : 'Annulla'}</button>
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
    const bandsBar = showBands ? `<div class="bands" role="group" aria-label="Fascia oraria">${Object.entries(BANDS).map(([k, l]) =>
      `<button class="${k === band ? 'on' : ''}" data-action="band" data-band="${k}" ${rows.some(t => inBand(t, k)) ? '' : 'disabled'}>${l}</button>`).join('')}</div>` : '';
    rows.splice(0, rows.length, ...rows.filter(t => inBand(t, band)));
    const sel = ui.sel && ui.sel.date === d ? ui.sel : null;
    const freeHours = c => { const h = courtHours(c, d); if (!h || !c.visibile) return 0; let n = 0; for (let t = h.apre; t < h.chiude; t = addMin(t, 30)) if (!bookingAt(c.id, d, t) && !isPast(d, t)) n++; return n / 2; };
    // Un riquadro per campo, con gli orari in orizzontale (mezz'ore da sinistra a destra).
    const courtBox = c => {
      const h = courtHours(c, d);
      const head = `<div class="court-head"><h3>${esc(c.nome)}${!c.visibile ? ' <span class="badge">nascosto</span>' : ''}</h3>
        <span class="muted small">${h ? `aperto ${h.apre}–${h.chiude} · <strong>${freeHours(c)} h libere</strong>` : 'chiuso in questa giornata'}</span>
        </div>`;
      if (!h || !rows.some(t => t >= h.apre && t < h.chiude)) return `<section class="card court-box closed">${head}${h ? `<p class="muted small">${band !== 'tutto' ? 'Nessun orario di questo campo in questa fascia.' : 'Per oggi gli orari di questo campo sono terminati.'}</p>` : ''}</section>`;
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
          const label = b.blocked ? `${icon('lock')} ${esc(b.blocked)}` : mine ? 'Tua' : isAdmin() ? esc(userName(b.userId)) : 'Occupato';
          // Nelle prenotazioni brevi c'è spazio solo per l'orario (il rosso indica già che è occupato).
          const inner = n <= 2 && !mine ? `<small>${b.from}–${b.to}</small>` : `<span>${label}</span><small>${b.from}–${b.to}</small>`;
          cells.push(`<div class="slot busy ${mine ? 'mine' : ''} ${b.blocked ? 'blocked' : ''}" style="grid-column:${k + 1} / span ${n}" title="${b.blocked ? esc(b.blocked) : isAdmin() ? esc(userName(b.userId)) : 'Occupato'} ${b.from}–${b.to}">${canOpen ? `<button data-action="booking-open" data-id="${b.id}">${inner}</button>` : `<div>${inner}</div>`}</div>`);
          k += n - 1;
          continue;
        }
        const pos = `style="grid-column:${k + 1}"`;
        if (t < h.apre || t >= h.chiude) { cells.push(`<div class="slot off" ${pos} title="${t} – campo chiuso"></div>`); continue; }
        if (inSel) cells.push(`<div class="slot sel" ${pos}><button data-action="slot" data-court="${c.id}" data-t="${t}" title="${t}" aria-label="${esc(c.nome)} ${t} selezionato">${t === sel.from ? icon('check') : ''}</button></div>`);
        else if (isPast(d, t)) cells.push(`<div class="slot off past" ${pos} title="${t} – orario già passato"></div>`);
        else if (d > max || !c.visibile) cells.push(`<div class="slot off" ${pos} title="${t} – non prenotabile"></div>`);
        else cells.push(`<div class="slot free" ${pos}><button data-action="slot" data-court="${c.id}" data-t="${t}" title="${t} – ${addMin(t, 30)}" aria-label="${esc(c.nome)} ${t} libero"></button></div>`);
      }
      return `<section class="card court-box">${head}
        <div class="strip-wrap"><div class="strip" style="--n:${slots.length}">
          <div class="strip-labels">${labels}</div><div class="strip-slots">${cells.join('')}</div>
        </div></div></section>`;
    };
    return `
      ${noticesBlock()}
      <h1>Prenota un campo</h1>
      <p class="muted">${courts.filter(c => c.visibile).length} campi · <strong>${opened.length} aperti</strong> in questa giornata · slot da 30 minuti ·
        massimo ${s.settings.maxOre} ${Number(s.settings.maxOre) === 1 ? 'ora' : 'ore'} per prenotazione · prenotabili fino a ${s.settings.giorniAnticipo} giorni prima.</p>
      <div class="date-nav">
        <button class="btn icon" data-action="day" data-delta="-1" aria-label="Giorno precedente" ${d <= todayKey() ? 'disabled' : ''}>${icon('chevron-left')}</button>
        <span class="date-field"><span class="date-pick"><button type="button" class="btn date-btn" data-action="pick-date" aria-label="Scegli la data">${icon('calendar')} ${itDate(d)}</button>
          <input type="date" class="date-native" value="${d}" min="${todayKey()}" max="${max}" data-change="book-date" tabindex="-1" aria-hidden="true"></span></span>
        <button class="btn icon" data-action="day" data-delta="1" aria-label="Giorno successivo" ${d >= max ? 'disabled' : ''}>${icon('chevron-right')}</button>
        <strong class="date-label">${fmtDate(d, true)}</strong>
      </div>
      ${bandsBar}
      <div class="book-layout">
        <div class="book-grid">
        ${!courts.length ? empty('Nessun campo disponibile. L’amministratore può crearli da Amministrazione → Campi.', 'layout-grid')
        : !rows.length ? empty(allRows ? 'Per oggi gli orari dei campi sono terminati: scegli un altro giorno con la freccia qui sopra.' : 'In questa giornata i campi sono chiusi.', 'door-off')
        : courts.map(courtBox).join('')}
        </div>
        <aside class="card book-summary ${ui.sel ? 'active' : 'idle'}">${ui.sel && ui.sel.date !== d ? `<p class="muted small">La selezione è su un altro giorno (${fmtDate(ui.sel.date)}).</p>` : ''}${summaryPanel()}</aside>
      </div>
      ${u ? `<section>${sectionHead('Le tue prossime prenotazioni')}${(() => { const m = myBookings(u); return m.length ? `<div class="list">${m.map(bookingItem).join('')}</div>` : empty('Nessuna prenotazione in programma.', 'calendar'); })()}</section>` : ''}`;
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
        ${b.blocked ? `<span class="small">${icon('lock')} Bloccato: ${esc(b.blocked)}</span>`
        : `<span class="small">${icon('user')} ${esc(userName(b.userId))}${u && u.tel ? ` · <a href="tel:${esc(u.tel)}">${esc(u.tel)}</a>` : ''}${u && u.email ? ` · <span class="muted">${esc(u.email)}</span>` : ''}</span>`}</div>
      <div class="actions tight"><button class="btn small" data-action="booking-open" data-id="${b.id}">Modifica</button>
        <button class="btn small danger" data-action="booking-delete" data-id="${b.id}">Cancella</button></div>
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
    if (!isAdmin()) return empty('Area riservata agli amministratori.', 'lock');
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
        aria-label="${fmtDate(d, true)}: ${c} prenotazioni"><span class="num">${dd}</span>${c ? `<small>${c}</small>` : ''}</button>`);
    }
    const total = list.filter(b => !b.blocked).length;
    let detail = '';
    if (ui.admAll) {
      const all = upcoming();
      detail = `<section class="card">${sectionHead(`${icon('list')} Tutte le prossime prenotazioni`,
        `<button class="btn small" data-action="adm-all-close">${icon('calendar')} Torna al calendario</button>`)}
        ${all.length ? admDayGroups(all) : empty('Nessuna prenotazione in programma.', 'calendar')}</section>`;
    } else if (day) {
      const items = list.filter(b => b.date === day);
      detail = `<section class="card">${sectionHead(`${icon('calendar-event')} ${fmtDate(day, true)}`)}
        ${items.length ? `<div class="list">${sortBookings(items).map(admBookingRow).join('')}</div>` : empty('Nessuna prenotazione in questo giorno.', 'calendar')}</section>`;
    }
    return `
      <p><a href="#/admin">${icon('arrow-left')} Amministrazione</a></p>
      ${sectionHead('<span class="h1">Prenotazioni</span>', `<button class="btn primary" data-action="adm-all">${icon('list')} Visualizza tutte le prenotazioni</button>`)}
      <section class="card adm-cal">
        <div class="cal-head">
          <button class="btn icon" data-action="adm-month" data-delta="-1" aria-label="Mese precedente" ${m <= monthOf(todayKey()) ? 'disabled' : ''}>${icon('chevron-left')}</button>
          <h2>${MESI[mo - 1]} ${y}</h2>
          <button class="btn icon" data-action="adm-month" data-delta="1" aria-label="Mese successivo">${icon('chevron-right')}</button>
          <button class="btn small" data-action="adm-today">Oggi</button>
          <span class="muted small cal-total">${total} ${total === 1 ? 'prossima prenotazione' : 'prossime prenotazioni'} nel mese</span>
        </div>
        <div class="cal-grid">${['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(x => `<span class="cal-dow">${x}</span>`).join('')}${cells.join('')}</div>
        <div class="legend"><span><i class="sw ring"></i>Giorno con prenotazioni (il numero indica quante)</span><span><i class="sw off"></i>Solo blocchi (manutenzione, lezioni…)</span></div>
      </section>
      ${detail || '<p class="muted small">Tocca un giorno del calendario per vederne le prenotazioni. Sono mostrate solo le prossime prenotazioni.</p>'}`;
  }

  // Conferma (nuova prenotazione o modifica) con tutti i controlli; avvisi a titolare e amministratori.
  function confirmBooking() {
    const s = S(), u = me(), sel = ui.sel;
    if (!sel) return;
    if (!u) return goProfileForLogin('Accedi o registrati per prenotare.');
    if (needVerified()) return;
    const c = s.courts.find(x => x.id === sel.courtId);
    if (!c || (!c.visibile && !isAdmin())) return toast('Questo campo non è prenotabile.', 'err');
    if (!selFree(sel.courtId, sel.date, sel.from, sel.to, sel.editId)) return toast('Alcuni slot non sono più liberi o il campo è chiuso: scegli un altro orario.', 'err');
    const orig = sel.editId && s.bookings.find(b => b.id === sel.editId);
    const owner = isAdmin() ? (sel.blocked ? null : sel.userId || (orig ? orig.userId : u.id)) : u.id;
    if (!isAdmin()) {
      if (toMin(sel.to) - toMin(sel.from) > Number(s.settings.maxOre) * 60) return toast(`Si può prenotare al massimo per ${s.settings.maxOre} ${Number(s.settings.maxOre) === 1 ? 'ora' : 'ore'}.`, 'err');
      const same = s.bookings.filter(b => b.userId === u.id && b.date === sel.date && b.id !== sel.editId).length;
      if (same >= Number(s.settings.maxGiorno)) return toast(`Hai già ${same} prenotazioni in questo giorno (massimo ${s.settings.maxGiorno}).`, 'err');
    }
    const data = { courtId: sel.courtId, date: sel.date, from: sel.from, to: sel.to, userId: owner, blocked: isAdmin() ? (sel.blocked || '').trim() : '' };
    if (orig) {
      const before = bookingText(orig);
      if (!confirm(`Salvare le modifiche?\nPrima: ${before}\nOra: ${bookingText(data)}`)) return;
      Object.assign(orig, data);
      notifyBooking(orig, `modificata: prima ${before}, ora ${bookingText(orig)}`);
      toast('Prenotazione modificata.', 'ok');
    } else {
      s.bookings.push(Object.assign({ id: Store.uid('g') }, data));
      toast(data.blocked ? 'Slot bloccati.' : `Prenotato ${bookingText(data)}.`, 'ok');
    }
    ui.sel = null;
    save();
  }

  function deleteBooking(id) {
    const s = S(), b = s.bookings.find(x => x.id === id);
    if (!b) return;
    if (!confirm(`Cancellare ${b.blocked ? 'il blocco' : 'la prenotazione'} ${bookingText(b)}?`)) return;
    s.bookings = s.bookings.filter(x => x.id !== id);
    notifyBooking(b, `cancellata (${bookingText(b)})`);
    if (ui.sel && ui.sel.editId === id) ui.sel = null;
    save();
    toast('Prenotazione cancellata.');
  }

  // Chi cambia una prenotazione altrui avvisa il titolare; l'utente che cambia la propria avvisa gli amministratori.
  function notifyBooking(b, what) {
    const u = me();
    if (!b.userId || b.blocked) return;
    if (b.userId !== u.id) window.Cloud.notify(b.userId, `La tua prenotazione è stata ${what} dall’amministratore ${u.nome} ${u.cognome}.`);
    else if (!isAdmin()) window.Cloud.notify('admins', `${u.nome} ${u.cognome} ha ${what.startsWith('modificata') ? 'modificato' : 'cancellato'} una prenotazione: ${what.replace(/^(modificata|cancellata):? ?/, '')}`);
  }

  // Scheda di un campo in Amministrazione: nome, visibilità e orari per ogni giorno.
  function courtForm(c) {
    const opt = v => HALF_HOURS.map(h => `<option ${h === v ? 'selected' : ''}>${h}</option>`).join('');
    return `<form data-form="court" class="court-form"><input type="hidden" name="id" value="${c.id}">
      <div class="row"><label>Nome del campo<input name="nome" value="${esc(c.nome)}" required></label>
        <label class="check"><input type="checkbox" name="visibile" ${c.visibile ? 'checked' : ''}> Visibile e prenotabile</label></div>
      <table class="hours"><thead><tr><th>Giorno</th><th>Aperto</th><th>Dalle</th><th>Alle</th></tr></thead><tbody>
      ${[1, 2, 3, 4, 5, 6, 7].map(dd => { const o = c.orari[dd]; return `<tr><td>${DAYS[dd]}</td>
        <td><input type="checkbox" name="aperto${dd}" ${o.aperto ? 'checked' : ''} aria-label="${DAYS[dd]} aperto"></td>
        <td><select name="apre${dd}" aria-label="${DAYS[dd]} apre">${opt(o.apre)}</select></td>
        <td><select name="chiude${dd}" aria-label="${DAYS[dd]} chiude">${opt(o.chiude)}</select></td></tr>`; }).join('')}
      </tbody></table>
      <div class="actions tight">
        <button type="button" class="btn small" data-action="court-copy">Copia gli orari del lunedì su tutti i giorni</button>
        <button type="button" class="btn small danger" data-action="court-delete" data-id="${c.id}">${icon('trash')} Elimina campo</button>
        <button class="btn small primary">Salva campo</button>
      </div></form>`;
  }

  // ---------- tornei ----------

  function viewTournaments() {
    const list = S().tournaments.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
    const open = list.filter(t => !t.closed), done = list.filter(t => t.closed).reverse();
    return `
      ${sectionHead('<span class="h1">Tornei</span>', canTours() ? `<button class="btn primary" data-action="tour-new">${icon('plus')} Nuovo torneo</button>` : '')}
      <section>${sectionHead('In corso e in programma')}
        ${open.length ? `<div class="grid">${open.map(tourCard).join('')}</div>` : empty('Nessun torneo in programma.', 'trophy')}</section>
      <section>${sectionHead('Conclusi')}
        ${done.length ? `<div class="grid">${done.map(tourCard).join('')}</div>` : empty('Ancora nessun torneo concluso.', 'archive')}</section>`;
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
      if (id == null) return `<em class="muted">${fallback ? esc(fallback[side]) : 'da definire'}</em>`;
      return entryLabel(t, id);
    };
    const names = [one(m.a, 0), one(m.b, 1)];
    names.ok = Logic.real(m.a) && Logic.real(m.b);
    return names;
  }

  function stdMatch(t, m, label) {
    if (m.bye) return `<div class="match bye"><span class="side">${entryLabel(t, m.winner)}</span><span class="score">bye</span><span class="side right muted">passa il turno</span></div>`;
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
      <thead><tr><th>#</th><th>${individual ? 'Giocatore' : 'Squadra'}</th><th title="Partite">G</th><th title="Vittorie">V</th><th title="Sconfitte">P</th>${individual ? '' : '<th title="Set vinti-persi">Set</th>'}<th title="Punti fatti-subiti">Punti</th><th title="Differenza punti">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < qualify || (qset && qset.has(r.id)) ? 'q' : ''}">
        <td>${i + 1}</td><td class="name">${individual ? pname(t, r.id) : entryLabel(t, r.id)}</td>
        <td>${r.played}</td><td><strong>${r.w}</strong></td><td>${r.l}</td>${individual ? '' : `<td>${r.sw}-${r.sl}</td>`}<td>${r.pw}-${r.pl}</td><td>${r.pw - r.pl > 0 ? '+' : ''}${r.pw - r.pl}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  // Classifica dell'americana: punti e set, ordinabile per punti fatti o set vinti.
  function americanaTable(t) {
    const crit = Logic.americanaCrit(t), sortBy = (ui.amSort || {})[t.id] || crit;
    const rows = Logic.americanaStandings(t, sortBy);
    const name = { punti: 'punti fatti', set: 'set vinti' };
    const btn = k => `<button class="${k === sortBy ? 'on' : ''}" data-action="am-sort" data-id="${t.id}" data-sort="${k}">${Logic.AMERICANA_CRITERI[k]}</button>`;
    return `<div class="bands" role="group" aria-label="Ordina la classifica"><span class="muted small">Ordina per:</span> ${btn('punti')}${btn('set')}</div>
      <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>Giocatore</th><th title="Partite giocate">G</th><th title="Partite vinte">V</th><th title="Partite perse">P</th><th title="Set vinti" class="${sortBy === 'set' ? 'sorted' : ''}">Set V</th><th title="Set persi">Set P</th>
        <th title="Punti fatti" class="${sortBy === 'punti' ? 'sorted' : ''}">Punti F</th><th title="Punti subiti">Punti S</th><th title="Differenza punti">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="name">${pname(t, r.id)}</td><td>${r.played}</td><td>${r.w}</td><td>${r.l}</td>
        <td>${sortBy === 'set' ? `<strong>${r.sw}</strong>` : r.sw}</td><td>${r.sl}</td><td>${sortBy === 'punti' ? `<strong>${r.pw}</strong>` : r.pw}</td><td>${r.pl}</td>
        <td>${r.pw - r.pl > 0 ? '+' : ''}${r.pw - r.pl}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Ordinata per ${name[sortBy]}${sortBy === 'set' ? ' (poi differenza set e punti fatti)' : ' (poi set vinti e differenza punti)'}.
        <strong>Il vincitore finale si decide per ${name[crit]}</strong>${canTours() ? ' — si cambia nella Scheda del torneo' : ''}.</p>`;
  }

  function tabsFor(t) {
    const tabs = [['iscritti', `Iscritti (${t.entries.length})`]];
    if (t.pools) tabs.push(['gironi', t.formato === 'girone_unico' ? 'Girone' : 'Gironi']);
    if (Logic.hasBracket(t.formato) && (t.bracket || t.pools)) tabs.push(['tabellone', 'Tabellone']);
    if (t.americana) tabs.push(['turni', 'Turni'], ['live', 'Classifica live']);
    if (t.fantasma) tabs.push(['fgironi', 'Gironi'], ['fko', 'Fase finale']);
    if (t.tempo) tabs.push(['tgare', t.tempo.mode === 'rotazione' ? 'Turni' : 'Gare'], ['tclass', 'Classifica']);
    if (t.seeds) tabs.push(['finale', 'Classifica finale']);
    if (canTours()) tabs.push(['scheda', 'Scheda']);
    return tabs;
  }

  function viewTournament(id) {
    const t = S().tournaments.find(x => x.id === id);
    if (!t) return empty('Torneo non trovato.', 'alert-circle');
    const u = me();
    const tabs = tabsFor(t);
    let tab = ui.tab[t.id];
    if (!tabs.some(x => x[0] === tab)) tab = tabs[tabs.length > 1 ? 1 : 0][0];
    const myEntry = u && t.entries.find(e => e.p1 === u.id || e.p2 === u.id);
    const full = t.maxIscritti && t.entries.length >= t.maxIscritti;
    const c = t.config;
    const scoring = Logic.isRotazione(t) ? `gare da ${c.minuti} min · ${c.turni} turni · ${c.campi} campi · compagno diverso a ogni turno`
      : t.formato === 'americana_tempo' ? `gare da ${c.minuti} min · max ${c.maxPartite} partite a squadra`
      : `${c.sets == 3 ? '2 set su 3' : '1 set'} ai ${c.punti}${c.sets == 3 && c.puntiDecisivo != c.punti ? ` (terzo ai ${c.puntiDecisivo})` : ''}`;

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
      <p><a href="#/tornei">${icon('arrow-left')} Tornei</a></p>
      <header class="tour-head">
        <div>
          <h1>${esc(t.nome)}</h1>
          <p class="muted">${icon('calendar')} ${fmtDate(t.data, true)}${t.luogo ? ' · ' + icon('map-pin') + ' ' + esc(t.luogo) : ''}</p>
          <p class="chips">${statusBadge(t)}<span class="chip">${esc(Logic.FORMATS[t.formato])}</span><span class="chip">${DISCIPLINE[t.disciplina]} ${GENERI[t.genere] || ''}</span>
            <span class="chip">${scoring}</span><span class="chip">${icon('list-numbers')} ${esc(pointsLabel(t))}${Logic.givesPoints(S(), t) && Number(t.coefficiente) !== 1 ? ' ×' + t.coefficiente : ''}</span></p>
          ${t.descrizione ? `<p>${esc(t.descrizione)}</p>` : ''}
        </div>
      </header>
      ${t.iscrizioniAperte && !t.seeds ? `<div class="notice ok">${icon('clipboard-check')} <span>Iscrizioni aperte${t.maxIscritti ? ` · ${t.entries.length}/${t.maxIscritti}` : ''}.</span>
        ${myEntry ? `<strong>Sei iscritto.</strong> <button class="btn small" data-action="tour-leave" data-id="${t.id}">Ritira iscrizione</button>`
        : u ? `<button class="btn primary small" data-action="tour-join" data-id="${t.id}" ${full ? 'disabled' : ''}>${full ? 'Completo' : 'Iscriviti'}</button>`
        : '<a class="btn small" href="#/profilo">Accedi per iscriverti</a>'}</div>` : ''}
      ${canTours() ? adminTourBar(t) : ''}
      ${pdfSections(t).length ? `<p class="pdf-row"><button type="button" class="btn small" data-action="tour-pdf" data-id="${t.id}">${icon('file-download')} Scarica calendario (PDF)</button></p>` : ''}
      ${timerBlock(t)}
      <nav class="tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'on' : ''} ${k === 'scheda' ? 'tab-admin' : ''}" data-action="tour-tab" data-id="${t.id}" data-tab="${k}">${k === 'scheda' ? icon('adjustments') + ' ' : ''}${l}</button>`).join('')}</nav>
      <div class="tab-body">${body}</div>`;
  }

  // ---------- calendario delle gare in PDF ----------
  // Turni / gironi con campo, coppie, chi riposa e lo spazio per i punti (o il risultato, se già inserito).
  const plain = h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };

  function pdfSections(t) {
    const out = [];
    const row = (label, a, b, m) => [label, plain(a), plain(b), m.bye ? 'passa il turno' : m.stats ? scoreText(m) : ''];
    if (t.tempo) {
      const ms = Logic.tempoMatches(t), rot = t.tempo.mode === 'rotazione';
      t.tempo.rounds.forEach((rd, r) => out.push({
        title: `Turno ${r + 1}`,
        rows: ms.filter(m => m.round === r).map((m, i) => row(`Campo ${i + 1}`, sideName(t, m.a), sideName(t, m.b), m)),
        rest: rd.rest.map(id => plain(rot ? pname(t, id) : teamName(t, id)))
      }));
    } else if (t.americana) {
      const ms = Logic.americanaMatches(t);
      t.americana.rounds.forEach((rd, r) => out.push({
        title: `Turno ${r + 1}`,
        rows: ms.filter(m => m.round === r).map((m, i) => row(`Campo ${i + 1}`, sideName(t, m.a), sideName(t, m.b), m)),
        rest: rd.rest.map(id => plain(pname(t, id)))
      }));
    } else if (t.fantasma) {
      t.fantasma.pools.forEach((p, pi) => {
        const ms = Logic.fantasmaPoolMatches(t, pi);
        p.rounds.forEach((rd, r) => out.push({
          title: `Girone ${p.name} · Turno ${r + 1}`,
          rows: ms.filter(m => m.round === r).map((m, i) => row(`Gara ${i + 1}`, sideName(t, m.a), sideName(t, m.b), m)),
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
            title: `${single ? 'Girone unico' : 'Girone ' + p.name} · Turno ${r}`,
            rows: list.map((m, i) => { const n = teamNames(t, m, m.from ? [`${m.from[0]} ${labelOf(t, m.from[1])}`, `${m.from[0]} ${labelOf(t, m.from[2])}`] : null); return row(m.label || `Gara ${i + 1}`, n[0], n[1], m); }),
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
    try { JsPDF = await pdfLibs(); } catch (e) { return toast('Non riesco a creare il PDF: controlla la connessione e riprova.', 'err'); }
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
      Logic.isRotazione(t) ? `gare da ${c.minuti} min · ${c.turni} turni · ${c.campi} campi · compagno diverso a ogni turno`
        : t.tempo ? `gare da ${c.minuti} min` : `${c.sets == 3 ? '2 set su 3' : '1 set'} ai ${c.punti}`].join('  ·  ');
    const infoLines = doc.splitTextToSize(info, W - 2 * M);
    doc.setFontSize(9); doc.text(infoLines, M, 33);
    let y = 33 + infoLines.length * 4 + 7;
    const scoreHead = t.tempo ? 'Punti' : 'Risultato';
    const pairs = Logic.isRotazione(t) || t.americana || t.fantasma, side = pairs ? 'Coppia' : 'Squadra';
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
        const lines = doc.splitTextToSize(`Riposa${sec.rest.length > 1 ? 'no' : ''}: ${sec.rest.join(', ')}`, W - 2 * M);
        doc.text(lines, M, y); y += lines.length * 4.5 + 4;
      }
      y += 3;
    });
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130);
      doc.text(`${t.nome} · calendario stampato il ${new Date().toLocaleDateString('it-IT')}`, M, H - 7);
      doc.text(`Pagina ${i} di ${n}`, W - M, H - 7, { align: 'right' });
    }
    doc.save(`Calendario ${t.nome.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pdf`);
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
      <div class="timer-head">${icon('clock-hour-4')} <strong>Tempo di gara</strong>
        <button type="button" class="btn icon small" data-action="timer-full" aria-label="Schermo intero">${icon('maximize')}</button></div>
      <div class="timer-clock" data-clock aria-live="polite">${running && left <= 0 ? 'Tempo scaduto!' : mmss(left)}</div>
      <p class="timer-state muted small" data-state>${running ? (left > 0 ? 'In corso: allo scadere terminano le partite.' : 'Fine delle partite: segnate i punti.') : paused ? 'In pausa' : 'Pronto'}</p>
      ${canTours() ? `<div class="timer-ctl">
        ${!running && !paused ? `<label class="timer-min">Minuti<input type="number" min="1" max="120" name="timerMin" value="${min}"></label>${b('timer-start', 'Avvia', 'player-play', 'primary')}` : ''}
        ${running && left > 0 ? b('timer-pause', 'Pausa', 'player-pause') : ''}
        ${paused ? b('timer-resume', 'Riprendi', 'player-play', 'primary') : ''}
        ${running || paused ? b('timer-reset', 'Azzera', 'rotate') : ''}
        ${b('timer-sound', 'Prova jingle', 'music')}
      </div>` : !audioOn() ? `<div class="timer-ctl">${b('timer-sound', 'Attiva suono di fine tempo', 'volume')}</div>` : ''}
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
      el.querySelector('[data-clock]').textContent = left > 0 ? mmss(left) : 'Tempo scaduto!';
      if (left <= 0 && !el.classList.contains('over')) {
        el.classList.add('over');
        el.querySelector('[data-state]').textContent = 'Fine delle partite: segnate i punti.';
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
    const out = [b('tour-edit', 'Scheda', 'adjustments')];
    if (!t.seeds) {
      out.push(b('tour-toggle-reg', t.iscrizioniAperte ? 'Chiudi iscrizioni' : 'Apri iscrizioni', t.iscrizioniAperte ? 'lock' : 'lock-open'));
      out.push(b('entry-add', 'Aggiungi iscritto', 'user-plus'));
      if (!isPairs(t)) out.push(b('entry-bulk', 'Incolla elenco giocatori', 'list'));
      out.push(b('tour-draw', 'Sorteggio / avvia', 'arrows-shuffle', 'primary'));
    } else if (!t.closed) {
      const fs = Logic.fantasmaStage(t);
      const nextIds = Logic.fantasmaNextIds(t);
      if (nextIds && nextIds.length <= 4) {
        out.push(b('fantasma-next', 'Sorteggia coppie della finale', 'arrows-shuffle', 'primary'));
        out.push(b('final-pairs', 'Scegli coppie della finale', 'users-group'));
      } else if (fs === 'start') out.push(b('fantasma-next', 'Avvia fase finale (sorteggio)', 'arrows-shuffle', 'primary'));
      else if (fs === 'next') out.push(b('fantasma-next', 'Sorteggia turno successivo', 'arrows-shuffle', 'primary'));
      if (fs === 'final') out.push(b('final-pairs', 'Modifica coppie della finale', 'users-group'));
      if (t.fantasma && t.fantasma.ko.length) out.push(b('fantasma-undo', 'Annulla ultimo sorteggio', 'arrow-back-up'));
      if (t.formato === 'gironi_ko' && Logic.poolsComplete(t)) out.push(b('tour-bracket', t.bracket ? 'Rigenera tabellone' : 'Genera tabellone', 'tournament', t.bracket ? '' : 'primary'));
      if (Logic.placements(t)) out.push(b('tour-close', 'Concludi torneo', 'flag-check', 'primary'));
      else if (t.tempo) out.push(b('tour-close', 'Interrompi e concludi', 'flag-check'));
      // Formule con abbinamenti a sorte: si può rifare il calendario se gli abbinamenti o i riposi non vanno bene.
      if (redrawable(t)) out.push(b('tour-redraw', 'Rigenera il tabellone e le gare', 'refresh'));
      out.push(b('tour-undraw', 'Annulla sorteggio', 'arrow-back-up', 'danger'));
    } else {
      out.push(b('tour-reopen', 'Riapri torneo', 'lock-open'));
    }
    out.push(b('tour-delete', 'Elimina', 'trash', 'danger'));
    return `<div class="admin-bar">${icon('key')} ${out.join('')}</div>`;
  }

  function tabEntries(t) {
    const rank = Logic.rankMap(S(), t);
    const pts = e => Logic.round2(Logic.entryPlayers(e).reduce((s, id) => s + (rank[id] || 0), 0));
    const list = t.seeds ? t.seeds.map(id => t.entries.find(e => e.id === id)).filter(Boolean) : t.entries.slice().sort((a, b) => pts(b) - pts(a));
    if (!list.length) return empty('Ancora nessun iscritto.', 'users');
    const rot = Logic.isRotazione(t), ind = !isPairs(t);
    const counts = rot ? `<p class="muted small">${['M', 'F'].map(k => `${SESSI[k] === 'Uomo' ? 'Uomini' : 'Donne'}: <strong>${list.filter(e => entrySex(e) === k).length}</strong>`).join(' · ')}</p>` : '';
    return `${counts}<div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>${isPairs(t) ? 'Coppia' : 'Giocatore'}</th>${ind ? '<th>Sesso</th>' : ''}${rot && canTours() ? '<th>Livello</th>' : ''}<th>Punti ranking</th>${canTours() && !t.seeds ? '<th></th>' : ''}</tr></thead>
      <tbody>${list.map((e, i) => `<tr><td>${i + 1}</td><td class="name">${entryLabel(t, e.id)}${canTours() && !isPairs(t) && (e.guest || !(S().users.find(u => u.id === e.p1) || {}).email) ? ' <span class="chip">senza account</span>' : ''}</td>
        ${ind ? `<td>${SESSI[entrySex(e)] || '—'}</td>` : ''}${rot && canTours() ? `<td>${Logic.LIVELLI[e.livello] || '—'}</td>` : ''}<td>${pts(e)}</td>
        ${canTours() && !t.seeds ? `<td class="right"><button class="link" data-action="entry-edit" data-id="${t.id}" data-entry="${e.id}">modifica</button> <button class="link danger" data-action="entry-remove" data-id="${t.id}" data-entry="${e.id}">rimuovi</button></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${t.seeds ? 'Ordine delle teste di serie usato nel sorteggio.' : 'Al sorteggio le teste di serie seguono i punti del ranking (tipologia e disciplina del torneo).'}</p>`;
  }

  function tabPools(t) {
    const single = t.formato === 'girone_unico';
    return `<div class="pools">${t.pools.map((p, pi) => {
      const st = Logic.poolStandings(t, pi);
      const ms = Logic.poolMatches(t, pi);
      const rounds = [...new Set(ms.map(m => m.round))];
      const typeCtl = canTours() && !t.closed && !single && Logic.canBeFivb(p)
        ? `<select data-change="pool-type" data-id="${t.id}" data-pool="${pi}" aria-label="Formula del girone">${Object.entries(Logic.POOL_TYPES).map(([k, v]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`
        : `<span class="chip">${Logic.POOL_TYPES[p.type]}</span>`;
      const rest = r => (p.type === 'rr' && p.teamIds.length % 2
        ? p.teamIds.filter(id => !ms.some(m => m.round === r && (m.a === id || m.b === id))).map(id => entryLabel(t, id)) : []);
      return `<section class="card pool">
        <div class="section-head"><h3>${single ? 'Girone unico' : 'Girone ' + p.name} <span class="muted small">· ${p.teamIds.length} squadre${p.teamIds.length % 2 && p.type === 'rr' ? ' (con bye)' : ''}</span></h3>${typeCtl}</div>
        ${standingsTable(t, st, single ? 0 : t.config.qualify)}
        ${rounds.map(r => `<h4>Turno ${r}</h4>${ms.filter(m => m.round === r).map(m => stdMatch(t, m, m.label)).join('')}
          ${rest(r).length ? `<p class="muted small">Riposa: ${rest(r).join(', ')}</p>` : ''}`).join('')}
      </section>`;
    }).join('')}</div>
    ${!single ? `<p class="muted small">Passano il turno le prime ${t.config.qualify} di ogni girone (evidenziate). Criteri: vittorie, scontro diretto / classifica avulsa, differenza set, differenza punti.</p>` : ''}`;
  }

  function bracketColumns(t, rounds, names) {
    return `<div class="bracket">${rounds.map((round, r) => `
      <div class="round"><h4>${names(r, rounds.length)}</h4><div class="round-body">${round.map(m => stdMatch(t, m)).join('')}</div></div>`).join('')}</div>`;
  }

  function tabBracket(t) {
    if (!t.bracket) return empty(t.pools ? 'Il tabellone si genera quando tutte le partite dei gironi sono concluse.' : 'Tabellone non ancora generato.', 'tournament');
    const cm = Logic.computeMain(t);
    if (cm.type === 'single') {
      return bracketColumns(t, cm.rounds, Logic.roundName)
        + (cm.third ? `<h3>Finale 3°/4° posto</h3>${stdMatch(t, cm.third)}` : '')
        + (cm.champion ? `<div class="champion">${icon('trophy')} Vincitore: <strong>${entryLabel(t, cm.champion)}</strong></div>` : '');
    }
    return `<h3>Tabellone vincenti</h3>${bracketColumns(t, cm.wb, Logic.roundName)}
      <h3>Tabellone perdenti</h3>${bracketColumns(t, cm.lb, r => `Turno ${r + 1}`)}
      <h3>Finalissima</h3>${stdMatch(t, cm.gf)}
      ${cm.champion ? `<div class="champion">${icon('trophy')} Vincitore: <strong>${entryLabel(t, cm.champion)}</strong></div>` : ''}`;
  }

  function tabRounds(t) {
    const ms = Logic.americanaMatches(t);
    return t.americana.rounds.map((rd, r) => `
      <section class="card"><h3>Turno ${r + 1}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => pairRow(t, m, true, `Campo ${i + 1}`)).join('')}
        ${restLine(t, rd.rest)}
      </section>`).join('');
  }

  // Gara tra coppie formate al momento (americana e fantasma).
  function pairRow(t, m, editable, label) {
    const names = [m.a.map(id => pname(t, id)).join(' + '), m.b.map(id => pname(t, id)).join(' + ')];
    names.ok = editable;
    return matchRow(t, m, names, label);
  }

  const restLine = (t, rest) => (rest.length ? `<p class="muted small">${icon('coffee')} Riposa${rest.length > 1 ? 'no' : ''}: ${rest.map(id => pname(t, id)).join(', ')}</p>` : '');

  function tabFantasmaPools(t) {
    const editable = !t.fantasma.ko.length;
    const q = new Set(Logic.fantasmaPoolsComplete(t) ? Logic.fantasmaQualifiers(t) : []);
    return `<div class="pools">${t.fantasma.pools.map((p, pi) => {
      const ms = Logic.fantasmaPoolMatches(t, pi);
      const st = Logic.fantasmaPoolStandings(t, pi);
      return `<section class="card pool">
        <h3>Girone ${p.name} <span class="muted small">· ${p.ids.length} giocatori</span></h3>
        ${standingsTable(t, st, 0, true, q)}
        ${p.rounds.map((rd, r) => `<h4>Turno ${r + 1}</h4>${ms.filter(m => m.round === r).map(m => pairRow(t, m, editable)).join('')}${restLine(t, rd.rest)}`).join('')}
      </section>`;
    }).join('')}</div>
    <p class="muted small">Compagni e avversari sorteggiati a ogni turno${t.genere === 'misto' ? ', formando quando possibile coppie miste' : ''}.
      Classifica individuale sulle medie per partita (vittorie, differenza punti, punti fatti), perché chi riposa gioca una gara in meno.
      Alla fase finale passano i migliori ${t.config.finalisti}${q.size ? ' (evidenziati)' : ''}.</p>
    ${editable ? '' : '<p class="muted small">I risultati dei gironi si possono modificare solo annullando i sorteggi della fase finale.</p>'}`;
  }

  function tabFantasmaKo(t) {
    const ko = Logic.fantasmaKo(t);
    if (!ko.length) return empty(`La fase finale inizia quando tutte le gare dei gironi sono concluse: passano i migliori ${t.config.finalisti}, con un nuovo sorteggio delle coppie a ogni turno.`, 'tournament');
    const out = ko.map((rd, r) => {
      const last = r === ko.length - 1, editable = last && !t.closed;
      if (rd.final) {
        const m = rd.matches[0];
        return `<section class="card"><h3>${icon('trophy')} Finale</h3>
          <p class="muted small">Gara secca tra i 4 giocatori rimasti.</p>
          ${pairRow(t, m, editable)}
          ${m.stats ? `<div class="champion">${icon('trophy')} Vincitori: <strong>${m[m.stats.winner].map(id => pname(t, id)).join(' e ')}</strong></div>` : ''}</section>`;
      }
      const n = rd.ids.length;
      return `<section class="card"><h3>${n === 8 ? 'Semifinali' : n === 16 ? 'Quarti di finale' : n === 32 ? 'Ottavi di finale' : 'Turno ' + (r + 1)} <span class="muted small">· ${n} giocatori</span></h3>
        <p class="muted small">In ogni gara la coppia vincente passa il turno.</p>
        ${rd.matches.map((m, i) => pairRow(t, m, editable, `Gara ${i + 1}`)).join('')}</section>`;
    }).join('');
    return out + (ko.length > 1 || !ko[0].final ? '<p class="muted small">Si possono modificare solo i risultati dell’ultimo turno sorteggiato.</p>' : '');
  }

  function tabFinal(t) {
    const pl = Logic.placements(t);
    if (!pl) return empty('La classifica finale sarà disponibile quando tutte le partite saranno concluse.', 'hourglass');
    const rows = Object.entries(pl).sort((a, b) => a[1] - b[1]);
    const individual = Logic.isIndividual(t.formato) || Logic.isRotazione(t), pts = Logic.givesPoints(S(), t), half = t.disciplina === 'doppio' || individual || !!t.tempo;
    return `<div class="table-wrap"><table class="standings">
      <thead><tr><th>Pos.</th><th>${individual ? 'Giocatore' : 'Squadra'}</th>${pts ? `${half ? '<th>Punti coppia</th>' : ''}<th>Punti a giocatore${Number(t.coefficiente) !== 1 ? ` (×${t.coefficiente})` : ''}</th>` : ''}</tr></thead>
      <tbody>${rows.map(([id, place]) => `<tr class="${place <= 3 ? 'medal m' + place : ''}"><td>${place}°</td>
        <td class="name">${individual ? pname(t, id) : t.tempo ? teamName(t, id) : entryLabel(t, id)}</td>${pts ? `${half ? `<td>${Logic.entryPoints(S(), t, place)}</td>` : ''}<td><strong>${Logic.playerPoints(S(), t, place)}</strong></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">${!pts ? 'Questo torneo non assegna punti per la classifica sociale.'
      : (half ? 'I punti in tabella sono di coppia: ogni giocatore ne riceve metà. ' : '') + (t.closed ? '' : 'I punti entrano in classifica quando l’amministratore conclude il torneo.')}</p>`;
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
    const intro = `<p class="muted small">Gare a tempo (${t.config.minuti} minuti) su ${t.config.campi} campi: conta il totale dei punti fatti.
      A ogni turno si gioca con un compagno diverso${t.genere === 'misto' ? ' (sempre uomo + donna)' : ''}.
      ${lo === hi ? `Ogni giocatore gioca <strong>${lo}</strong> partite.` : `Partite per giocatore: da ${lo} a ${hi}.`}</p>`;
    return intro + t.tempo.rounds.map((rd, r) => `
      <section class="card"><h3>Turno ${r + 1}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => pairRow(t, m, true, `Campo ${i + 1}`)).join('')}
        ${rd.rest.length ? `<p class="muted small">${icon('coffee')} Riposa${rd.rest.length > 1 ? 'no' : ''}: <strong>${rd.rest.map(id => pname(t, id)).join(', ')}</strong></p>` : `<p class="muted small">${icon('coffee')} Nessuno riposa in questo turno.</p>`}
      </section>`).join('');
  }

  function tabRotazioneStandings(t) {
    const crit = Logic.rotCrit(t), sortBy = (ui.amSort || {})[t.id] || crit;
    const rows = Logic.rotazioneStandings(t, sortBy);
    const done = Logic.tempoComplete(t) || t.closed, draws = rows.some(r => r.d);
    const name = { punti: 'punti fatti', vittorie: 'partite vinte' };
    const btn = k => `<button class="${k === sortBy ? 'on' : ''}" data-action="am-sort" data-id="${t.id}" data-sort="${k}">${Logic.ROT_CRITERI[k]}</button>`;
    const b = (k, v) => (sortBy === k ? `<strong>${v}</strong>` : v);
    return `<div class="bands" role="group" aria-label="Ordina la classifica"><span class="muted small">Ordina per:</span> ${btn('punti')}${btn('vittorie')}</div>
      <div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>Giocatore</th><th title="Partite giocate">G</th><th title="Partite vinte">V</th>${draws ? '<th title="Partite pareggiate">N</th>' : ''}<th title="Partite perse">P</th><th title="Punti fatti">Punti fatti</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${done && sortBy === crit && r.pos <= 3 ? 'medal m' + r.pos : ''}"><td>${r.pos}</td><td class="name">${pname(t, r.id)}</td>
        <td>${r.played}</td><td>${b('vittorie', r.w)}</td>${draws ? `<td>${r.d}</td>` : ''}<td>${r.l}</td><td>${b('punti', r.pf)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">Classifica individuale: a ogni giocatore vanno i punti e le vittorie della sua coppia in ogni gara.
      Ordinata per ${name[sortBy]}${sortBy === 'vittorie' ? ' (poi pareggi e punti fatti)' : ' (poi partite vinte)'}; a parità, stessa posizione.
      <strong>Il vincitore finale si decide per ${name[crit]}</strong>${canTours() ? ' — si cambia nella Scheda del torneo' : ''}.
      ${t.closed && !Logic.tempoComplete(t) ? 'Torneo interrotto dall’organizzatore: vale la classifica al momento dello stop.' : ''}</p>`;
  }

  function tabTempoRounds(t) {
    if (t.tempo.mode === 'rotazione') return tabRotazioneRounds(t);
    const ms = Logic.tempoMatches(t);
    const intro = `<p class="muted small">Gare a tempo (${t.config.minuti} minuti): vince chi fa più punti, il pareggio è possibile.
      Ogni squadra gioca al massimo ${t.config.maxPartite} partite.</p>`;
    return intro + t.tempo.rounds.map((rd, r) => `
      <section class="card"><h3>Turno ${r + 1}</h3>
        ${ms.filter(m => m.round === r).map((m, i) => {
          const names = [teamName(t, m.a), teamName(t, m.b)];
          names.ok = true;
          return matchRow(t, m, names, `Campo ${i + 1}`);
        }).join('')}
        ${rd.rest.length ? `<p class="muted small">${icon('coffee')} Riposa${rd.rest.length > 1 ? 'no' : ''}: ${rd.rest.map(id => teamName(t, id)).join(', ')}</p>` : ''}
      </section>`).join('');
  }

  function tabTempoStandings(t) {
    if (t.tempo.mode === 'rotazione') return tabRotazioneStandings(t);
    const rows = Logic.tempoStandings(t);
    const q = r => { const v = Logic.quoziente(r); return v === Infinity ? '∞' : v.toFixed(3).replace('.', ','); };
    const done = Logic.tempoComplete(t);
    return `<div class="table-wrap"><table class="standings">
      <thead><tr><th>#</th><th>Squadra</th><th title="Partite">G</th><th title="Vittorie">V</th><th title="Pareggi">N</th><th title="Sconfitte">P</th>
        <th title="Punti fatti">PF</th><th title="Punti subiti">PS</th><th title="Quoziente punti">Quoz.</th><th title="Differenza">+/-</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${i < 3 && (done || t.closed) ? 'medal m' + (i + 1) : ''}"><td>${i + 1}</td><td class="name">${teamName(t, r.id)}</td>
        <td>${r.played}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><strong>${r.pf}</strong></td><td>${r.ps}</td><td>${q(r)}</td><td>${r.pf - r.ps > 0 ? '+' : ''}${r.pf - r.ps}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">Classifica per ${t.config.criterioTempo === 'punti' ? 'punti fatti, poi quoziente punti' : 'quoziente punti (fatti / subiti), poi punti fatti'}.
      ${t.closed && !done ? 'Torneo interrotto dall’organizzatore: vale la classifica al momento dello stop.' : ''}</p>`;
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
    return `<details class="players-edit"><summary>${icon('users')} Hanno giocato altri giocatori? Correggi la gara</summary>
      <p class="muted small">Scegli chi ha giocato davvero in questa gara. Se scegli qualcuno di un’altra gara dello stesso turno, i due si scambiano di posto.
        I risultati restano dove sono; chi riposa nel turno ${x.r + 1} si aggiorna da solo.</p>
      <div class="row"><label>Coppia 1${sel('pa1', x.m.a[0])}${sel('pa2', x.m.a[1])}</label><label>Coppia 2${sel('pb1', x.m.b[0])}${sel('pb2', x.m.b[1])}</label></div>
    </details>`;
  }

  // Applica la correzione. Se si sceglie chi gioca in un'altra gara dello stesso turno, i due si scambiano di posto
  // (anche i risultati delle gare restano dove sono). Restituisce { err, changed, swapped: [nomi gare toccate] }.
  function applyPlayers(t, v) {
    const x = roundOf(t, v.key);
    if (!x || !v.pa1) return { err: null, changed: false, swapped: [] };
    const want = [v.pa1, v.pa2, v.pb1, v.pb2];
    if (new Set(want).size !== 4) return { err: 'Nella gara ci sono giocatori ripetuti.' };
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
    if (new Set(playing).size !== playing.length) return { err: 'Correzione non valida: un giocatore risulterebbe in due gare.' };
    x.rd.rest = roundPlayers(t).filter(id => !playing.includes(id));
    const res = t.results[v.key];
    if (res && res.a) { res.a = x.m.a; res.b = x.m.b; }
    return { err: null, changed: true, swapped: [...touched].map(i => `Campo ${i + 1}`) };
  }

  function resultDialog(t, key) {
    const m = findMatch(t, key);
    if (!m) return;
    if (t.tempo) {
      const r0 = t.results[key] || {};
      openDialog(`
        <form data-form="result">
          <input type="hidden" name="tid" value="${t.id}"><input type="hidden" name="key" value="${key}">
          <h2>Risultato</h2>
          <p class="muted small">Gara a tempo: inserisci i punti fatti da ciascuna coppia allo scadere (il pareggio è ammesso).</p>
          ${playersEditor(t, key)}
          <div class="score-grid">
            <span></span><strong>${sideName(t, m.a)}</strong><strong>${sideName(t, m.b)}</strong>
            <span class="muted">Punti</span>
            <input type="number" inputmode="numeric" min="0" max="999" name="pa" value="${r0.pa != null ? r0.pa : ''}" aria-label="Punti ${sideName(t, m.a).replace(/<[^>]+>/g, '')}">
            <input type="number" inputmode="numeric" min="0" max="999" name="pb" value="${r0.pb != null ? r0.pb : ''}" aria-label="Punti ${sideName(t, m.b).replace(/<[^>]+>/g, '')}">
          </div>
          <p class="form-error" hidden></p>
          <div class="actions">
            ${t.results[key] ? '<button type="button" class="btn danger" data-action="result-clear">Cancella risultato</button>' : ''}
            <button type="button" class="btn" data-action="close-dialog">Annulla</button>
            <button class="btn primary">Salva</button>
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
        <h2>Risultato</h2>
        <p class="muted small">${Number(t.config.sets) === 3 ? '2 set su 3' : 'Set unico'} ai ${t.config.punti} punti, 2 punti di scarto.</p>
        ${playersEditor(t, key)}
        <div class="score-grid">
          <span></span><strong>${names[0]}</strong><strong>${names[1]}</strong>
          ${Array.from({ length: nSets }, (_, i) => `<span class="muted">Set ${i + 1}${i === 2 ? ` (ai ${t.config.puntiDecisivo})` : ''}</span>
            <input type="number" inputmode="numeric" min="0" max="99" name="a${i}" value="${sets[i] ? sets[i][0] : ''}" aria-label="Set ${i + 1} ${names[0]}">
            <input type="number" inputmode="numeric" min="0" max="99" name="b${i}" value="${sets[i] ? sets[i][1] : ''}" aria-label="Set ${i + 1} ${names[1]}">`).join('')}
        </div>
        ${amer ? '' : `<label>Ritiro / forfait
          <select name="forfeit"><option value="">Nessuno</option><option value="a" ${res.forfeit === 'a' ? 'selected' : ''}>Si ritira ${names[0].replace(/<[^>]+>/g, '')}</option><option value="b" ${res.forfeit === 'b' ? 'selected' : ''}>Si ritira ${names[1].replace(/<[^>]+>/g, '')}</option></select></label>`}
        <p class="form-error" hidden></p>
        <div class="actions">
          ${t.results[key] ? '<button type="button" class="btn danger" data-action="result-clear">Cancella risultato</button>' : ''}
          <button type="button" class="btn" data-action="close-dialog">Annulla</button>
          <button class="btn primary">Salva</button>
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
        ${inline ? `<p class="muted small">${icon('info-circle')} Qui trovi tutti i parametri del torneo. Modifica quello che serve e premi <strong>Salva modifiche</strong>.
          ${drawn ? 'Dopo il sorteggio formula, categoria e tipo di squadre restano bloccati; per cambiarli annulla il sorteggio.' : ''}</p>` : `<h2>Nuovo torneo</h2>`}
        ${sec(`${icon('id')} Dettagli`)}
        <label>Nome<input name="nome" required value="${esc(t ? t.nome : '')}"></label>
        <div class="row">
          <label>Data${dateField('data', t ? t.data : '', { required: true })}</label>
          <label>Luogo<input name="luogo" value="${esc(t ? t.luogo : s.settings.nome)}"></label>
        </div>
        ${sec(`${icon('list-numbers')} Punti per la classifica`)}
        <div class="row">
          <label>Punti per la classifica sociale<select name="categoriaId">
            <option value="">Nessun punto (non vale per la classifica)</option>
            ${s.categories.map(x => `<option value="${x.id}" ${t && t.categoriaId === x.id ? 'selected' : ''}>Tabella “${esc(x.nome)}”</option>`).join('')}
            <option value="custom" ${t && t.categoriaId === 'custom' ? 'selected' : ''}>Tabella personalizzata per questo torneo</option></select></label>
          <label data-show-points>Coefficiente<input type="number" step="0.1" min="0" name="coefficiente" value="${t ? t.coefficiente : 1}"></label>
        </div>
        <label data-show-custom>Tabella punti del torneo (una riga per posizione: <code>posizione=punti</code>, punti di coppia)
          <textarea name="puntiRows" rows="4" placeholder="1=100&#10;2=80&#10;3=60&#10;5=40&#10;9=20">${t && t.puntiRows ? t.puntiRows.map(([p, v]) => `${p}=${v}`).join('\n') : ''}</textarea></label>
        ${sec(`${icon('tournament')} Formula`)}
        <div class="row">
          <label>Disciplina<select name="disciplina" ${drawn ? 'disabled' : ''}>${opt(DISCIPLINE, t ? t.disciplina : 'doppio')}</select></label>
          <label>Categoria<select name="genere" ${drawn ? 'disabled' : ''}>${opt(GENERI, t ? t.genere : 'open')}</select></label>
        </div>
        <label>Formula<select name="formato" ${drawn ? 'disabled' : ''}>${Object.entries(Logic.FORMATS).map(([k, v]) => `<option value="${k}" ${k === fmt ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${drawn ? '<p class="muted small">Formula e categoria non si possono cambiare dopo il sorteggio.</p>' : ''}
        <fieldset data-hide="americana_tempo"><legend>Punteggio</legend>
          <div class="row">
            <label>Set<select name="sets"><option value="1" ${c.sets != 3 ? 'selected' : ''}>1 set</option><option value="3" ${c.sets == 3 ? 'selected' : ''}>2 set su 3</option></select></label>
            <label>Punti per set<select name="punti">${pts(c.punti)}</select></label>
            <label data-show-sets>Terzo set ai<select name="puntiDecisivo">${pts(c.puntiDecisivo)}</select></label>
          </div>
        </fieldset>
        <fieldset data-show="gironi_ko"><legend>Gironi</legend>
          <div class="row">
            <label>Squadre per girone<input type="number" min="2" max="12" name="poolSize" value="${c.poolSize}"></label>
            <label>Qualificate per girone<input type="number" min="1" max="8" name="qualify" value="${c.qualify}"></label>
          </div>
          <label>Formula dei gironi (modificabile poi girone per girone)<select name="poolType">${opt(Logic.POOL_TYPES, c.poolType)}</select></label>
          <p class="muted small">Se gli iscritti non sono un multiplo esatto, i gironi saranno “zoppi” (es. 4-3-3) e nei gironi dispari una squadra riposa a ogni turno. La formula FIVB vale per gironi da 3 o 4.</p>
        </fieldset>
        <label class="check" data-show="gironi_ko,eliminazione"><input type="checkbox" name="thirdPlace" ${c.thirdPlace ? 'checked' : ''}> Finale 3°/4° posto</label>
        <fieldset data-show="americana_tempo"><legend>Americana a tempo</legend>
          <label>Squadre<select name="squadre" ${drawn ? 'disabled' : ''}>${opt(Logic.TEMPO_SQUADRE, c.squadre)}</select></label>
          <div class="row">
            <label>Durata gara (minuti)<input type="number" min="1" max="120" name="minuti" value="${c.minuti}"></label>
            <label data-tempo="rotazione">Numero dei turni<input type="number" min="1" max="30" name="tTurni" value="${c.turni}"></label>
            <label data-tempo="rotazione">Campi disponibili<input type="number" min="1" max="30" name="tCampi" value="${c.campi || 3}"></label>
            <label data-tempo="iscrizione,sorteggio">Partite massime per squadra<input type="number" min="1" max="50" name="maxPartite" value="${c.maxPartite}"></label>
          </div>
          <label data-tempo="rotazione">Il vincitore finale si calcola in base a<select name="criterioRot">${opt(Logic.ROT_CRITERI, c.criterioRot === 'vittorie' ? 'vittorie' : 'punti')}</select></label>
          ${drawn ? '<p class="notice small" data-tempo="rotazione">Se cambi turni o campi, salva e poi premi <strong>Rigenera il tabellone e le gare</strong> per rifare il calendario.</p>' : ''}
          <label data-tempo="iscrizione,sorteggio">Vince chi ha<select name="criterioTempo">${Object.entries(Logic.TEMPO_CRITERI).map(([k, l]) => `<option value="${k}" ${c.criterioTempo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small" data-tempo="rotazione">Iscrizione individuale: l’organizzatore può inserire anche giocatori non registrati (nome, cognome, sesso, livello).
            A ogni turno ognuno gioca con un compagno diverso (nei tornei misti sempre uomo + donna); le gare sono distribuite sui campi e chi è in più riposa, a rotazione.
            Il livello serve a bilanciare le gare. Classifica individuale per totale dei punti fatti.</p>
          <p class="muted small" data-tempo="iscrizione,sorteggio">Vince la gara chi fa più punti allo scadere del tempo (pareggio possibile). Il calendario evita di ripetere gli avversari.
            Il torneo termina quando le squadre hanno giocato le partite previste; l’organizzatore può anche interromperlo prima.
            Con squadre sorteggiate, nei tornei misti si formano quando possibile coppie uomo+donna.</p>
        </fieldset>
        <fieldset data-show="fantasma"><legend>Torneo fantasma</legend>
          <div class="row">
            <label>Giocatori per girone<input type="number" min="4" max="32" name="poolPlayers" value="${c.poolPlayers}"></label>
            <label>Turni per girone<input type="number" min="1" max="20" name="poolTurni" value="${c.poolTurni}"></label>
            <label>Finalisti<select name="finalisti">${Logic.FINALISTS.map(n => `<option ${n == c.finalisti ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          </div>
          <p class="muted small">Iscrizione individuale. A ogni gara il compagno viene sorteggiato (nei tornei misti si formano quando possibile coppie uomo+donna).
            Dopo i gironi passano i migliori; nella fase finale a ogni turno nuovo sorteggio: la coppia vincente passa, quella perdente esce.
            Con 4 giocatori rimasti si gioca la finale secca, con coppie sorteggiate o scelte dall’organizzatore.</p>
        </fieldset>
        <fieldset data-show="americana"><legend>Americana</legend>
          <div class="row">
            <label>Turni<input type="number" min="1" max="30" name="turni" value="${c.turni}"></label>
            <label>Campi disponibili (0 = senza limite)<input type="number" min="0" max="30" name="campi" value="${c.campi}"></label>
          </div>
          <label>Il vincitore finale si calcola in base a<select name="criterio">${Object.entries(Logic.AMERICANA_CRITERI).map(([k, l]) => `<option value="${k}" ${(c.criterio === 'punti' ? 'punti' : 'set') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">Iscrizione individuale: a ogni turno le coppie cambiano, evitando di ripetere compagni e avversari. Chi è in più riposa, a rotazione.</p>
        </fieldset>
        ${sec(`${icon('users')} Iscrizioni`)}
        <div class="row">
          <label>Numero massimo iscritti (0 = nessun limite)<input type="number" min="0" name="maxIscritti" value="${t ? t.maxIscritti || 0 : 0}"></label>
          <label class="check"><input type="checkbox" name="iscrizioniAperte" ${!t || t.iscrizioniAperte ? 'checked' : ''}> Iscrizioni online aperte</label>
        </div>
        ${sec(`${icon('file-text')} Regolamento`)}
        <label>Descrizione / regolamento<textarea name="descrizione" rows="${inline ? 5 : 3}">${esc(t ? t.descrizione : '')}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="actions">${inline ? `<button type="button" class="btn" data-action="scheda-reset" data-id="${t.id}">${icon('arrow-back-up')} Annulla modifiche</button>`
          : '<button type="button" class="btn" data-action="close-dialog">Annulla</button>'}<button class="btn primary">${icon('device-floppy')} ${inline ? 'Salva modifiche' : 'Salva'}</button></div>
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
    if (t.genere !== 'open' && us.some(u => !u || !u.sesso)) return 'Per questo torneo il sesso del giocatore deve essere indicato nel profilo.';
    if (t.genere === 'M' && us.some(u => u.sesso !== 'M')) return 'Torneo maschile: possono iscriversi solo uomini.';
    if (t.genere === 'F' && us.some(u => u.sesso !== 'F')) return 'Torneo femminile: possono iscriversi solo donne.';
    if (t.genere === 'misto' && isPairs(t) && us.length === 2 && us[0].sesso === us[1].sesso) return 'Torneo misto: la coppia deve essere formata da un uomo e una donna.';
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
  const levelOptions = sel => `<option value="" ${!sel ? 'selected' : ''}>— (nessun livello)</option>` + Object.entries(Logic.LIVELLI).map(([k, l]) => `<option value="${k}" ${Number(k) === Number(sel) ? 'selected' : ''}>${k} · ${l}</option>`).join('');

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
        <h2>${self ? 'Iscrizione' : entry ? 'Modifica iscrizione' : 'Aggiungi iscritto'} · ${esc(t.nome)}</h2>
        ${self ? `<p>Giocatore: <strong>${esc(userName(u.id))}</strong></p><input type="hidden" name="p1" value="${u.id}">`
        : `<label>Giocatore<select name="p1" data-change="entry-kind" ${guests ? '' : 'required'}><option value="">—</option>
            ${guests ? `<option value="__guest" ${g ? 'selected' : ''}>➕ Nuovo giocatore non registrato all’app</option>` : ''}${playerOptions(free, entry && entry.p1)}</select></label>
          ${guests ? `<div class="guest-fields" ${g ? '' : 'hidden'}>
            <div class="row"><label>Nome<input name="gNome" value="${esc(g ? g.nome : '')}"></label><label>Cognome<input name="gCognome" value="${esc(g ? g.cognome : '')}"></label></div>
            <label>Sesso<select name="gSesso"><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${g && g.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>` : ''}
          ${rot ? `<label>Livello<select name="livello">${levelOptions(entry && entry.livello)}</select></label>` : ''}`}
        ${doubles ? `<label>Compagno/a<select name="p2"><option value="">Da definire (cerco compagno)</option>${playerOptions(x => free(x) && (!self || x.id !== u.id), entry && entry.p2)}</select></label>
          <p class="muted small">Il compagno deve essere registrato nell’app. Se non lo trovi, lascia “da definire”: l’organizzazione completerà la coppia.</p>` : ''}
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">Annulla</button><button class="btn primary">${self ? 'Conferma iscrizione' : 'Salva'}</button></div>
      </form>`);
  }

  // Elenco di giocatori incollato (es. da un messaggio): una persona per riga.
  // Le righe "donne"/"femminili" e "uomini"/"maschili" cambiano il sesso delle righe che seguono.
  function bulkDialog(t) {
    openDialog(`
      <form data-form="entry-bulk">
        <input type="hidden" name="tid" value="${t.id}">
        <h2>Incolla elenco giocatori · ${esc(t.nome)}</h2>
        <label>Giocatori (uno per riga: nome e cognome)
          <textarea name="elenco" rows="12" placeholder="Donne&#10;Maria Capponi&#10;Cristina Pezzotta&#10;&#10;Uomini&#10;Marco Frosinone&#10;Ugo Marceddu"></textarea></label>
        <p class="muted small">Puoi incollare anche un messaggio intero: le righe con “donne” o “femminili” e “uomini” o “maschili” indicano il sesso dei nomi che seguono.
          Chi è già nell’elenco “Utenti e giocatori” viene riconosciuto dal nome; gli altri vengono aggiunti all’elenco come giocatori senza account.</p>
        <div class="row">
          <label>Sesso (se non indicato nell’elenco)<select name="sesso"><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          ${Logic.isRotazione(t) ? `<label>Livello<select name="livello">${levelOptions(null)}</select></label>` : ''}
        </div>
        <p class="form-error" hidden></p>
        <div class="actions"><button type="button" class="btn" data-action="close-dialog">Annulla</button><button class="btn primary">Inserisci</button></div>
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
      if (/\b(donne|femminil[ei]|ragazze)\b/.test(low)) { sex = 'F'; return; }
      if (/\b(uomini|maschil[ei]|ragazzi)\b/.test(low)) { sex = 'M'; return; }
      const parts = l.split(/\s+/);
      // Righe di testo (frasi del messaggio) e non nomi: si saltano.
      if (parts.length < 2 || parts.length > 4 || /[^\p{L}\s'’-]/u.test(l) || parts.some(w => NOT_NAME.has(w.toLowerCase()))) return;
      out.push({ nome: cap(parts[0]), cognome: cap(parts.slice(1).join(' ')), sesso: sex });
    });
    return out;
  }

  // ---------- classifiche ----------

  function viewRanking() {
    const s = S(), f = ui.rank;
    const list = Logic.ranking(s, f);
    const tabs = Object.entries(Logic.RANK_CATS).map(([k, l]) => `<button class="${k === f.cat ? 'on' : ''}" data-action="rank-cat" data-cat="${k}">${l}</button>`).join('');
    const tables = Object.assign(Object.fromEntries(s.categories.map(c => [c.id, c.nome])), { custom: 'Personalizzate' });
    return `
      <h1>Classifica sociale</h1>
      <p class="muted">Classifica interna del circolo: punti del piazzamento × coefficiente, solo nei tornei con punti in palio.
        I punti delle tabelle sono di coppia: nel doppio (anche americana, fantasma e americana a tempo) ogni giocatore ne riceve metà.
        Le classifiche <strong>generali</strong> sommano tutti i tornei, Open compresi.</p>
      <nav class="bands rank-tabs" aria-label="Categoria">${tabs}</nav>
      <div class="filters"><label>Tabella punti<select data-change="rank" data-key="categoriaId">
        <option value="">Tutte</option>${Object.entries(tables).map(([k, v]) => `<option value="${k}" ${k === f.categoriaId ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
      <h2>${Logic.RANK_CATS[f.cat]}</h2>
      ${list.length ? `<div class="table-wrap"><table class="standings ranking">
        <thead><tr><th>#</th><th>Giocatore</th><th>Punti</th><th>Tornei</th><th>Miglior piazz.</th><th>Premi</th></tr></thead>
        <tbody>${list.map((r, i) => `<tr class="${i < 3 ? 'medal m' + (i + 1) : ''}"><td>${i + 1}</td>
          <td class="name"><button class="link" data-action="player" data-id="${r.id}">${esc(userName(r.id))}</button></td>
          <td><strong>${r.total}</strong></td><td>${r.events}</td><td>${r.best}°</td>
          <td class="badges">${Premi.perfBadges(s, r.id, generalPoints(r.id))}</td></tr>`).join('')}</tbody>
      </table></div>` : empty('Nessun punto in questa classifica: si popola quando si concludono i tornei della categoria.', 'chart-bar')}`;
  }

  // Punti totali del giocatore (classifica generale del suo sesso), usati per i trofei.
  function generalPoints(uid) {
    const u = S().users.find(x => x.id === uid);
    const r = Logic.ranking(S(), { cat: u && u.sesso === 'F' ? 'generale_f' : 'generale_m' }).find(x => x.id === uid);
    return r ? r.total : 0;
  }

  // Prenotazioni giocate (concluse e non cancellate): conteggio dal database meno quelle non ancora finite.
  async function playedBookings(uid) {
    const total = await window.Cloud.countBookings(uid);
    const pending = S().bookings.filter(b => b.userId === uid && !isPast(b.date, b.to)).length;
    const n = Math.max(0, total - pending);
    ui.counts[uid] = n;
    return n;
  }

  // Riquadro premi di un giocatore: stelle (fedeltà), medaglie, trofeo, racchetta.
  function premiBlock(uid, own) {
    const s = S(), m = Logic.medals(s, uid), pts = generalPoints(uid);
    const tr = Premi.trophy(s, pts), ra = Premi.racket(s, m.tornei);
    const n = ui.counts[uid];
    const st = n == null ? null : Premi.stars(s, n);
    return `<div class="premi" data-premi="${uid}">
      <div class="premio fedelta"><div class="big-icons">${st ? (st.stelle ? Premi.starIcons(st.stelle) : '☆') : '…'}</div>
        <div><strong>Fedeltà</strong><br><span class="small">${st ? `${Premi.starLabel(st.stelle)} · ${n} prenotazioni giocate<br><span class="muted">${own ? 'Te ne mancano' : 'Ne mancano'} ${st.mancano} per la prossima stella</span>` : 'calcolo in corso…'}</span></div></div>
      <div class="premio"><div class="big-icons medals">${m.oro || m.argento || m.bronzo ? `<span>🥇${m.oro}</span><span>🥈${m.argento}</span><span>🥉${m.bronzo}</span>` : '🎖️'}</div>
        <div><strong>Medagliere</strong><br><span class="small">${m.oro + m.argento + m.bronzo ? `${m.oro} ori, ${m.argento} argenti, ${m.bronzo} bronzi` : 'nessun podio per ora'}</span></div></div>
      <div class="premio"><div class="big-icons lv${tr.livello}">🏆</div>
        <div><strong>Trofeo ${tr.nome || '—'}</strong><br><span class="small">${pts} punti${tr.prossima != null ? ` · prossimo livello a ${tr.prossima}` : ' · livello massimo!'}</span></div></div>
      <div class="premio"><div class="big-icons lv${ra.livello}">🏓</div>
        <div><strong>Racchetta ${ra.nome || '—'}</strong><br><span class="small">${m.tornei} tornei giocati${ra.prossima != null ? ` · prossimo livello a ${ra.prossima}` : ' · livello massimo!'}</span></div></div>
    </div>`;
  }

  function headerBadges(uid) {
    const s = S(), m = Logic.medals(s, uid), tr = Premi.trophy(s, generalPoints(uid)), ra = Premi.racket(s, m.tornei);
    const n = ui.counts[uid], st = n == null ? null : Premi.stars(s, n);
    const parts = [];
    parts.push(`<span class="hb-group" title="Fedeltà: ${st ? Premi.starLabel(st.stelle) : '…'}">${st && st.stelle ? Premi.starIcons(st.stelle) : '<span class="hb-empty">☆</span>'}</span>`);
    if (m.oro + m.argento + m.bronzo) parts.push(`<span class="hb-group" title="Medagliere">${m.oro ? `🥇<b>${m.oro}</b>` : ''}${m.argento ? `🥈<b>${m.argento}</b>` : ''}${m.bronzo ? `🥉<b>${m.bronzo}</b>` : ''}</span>`);
    if (tr.livello) parts.push(`<span class="hb-group lv${tr.livello}" title="Trofeo ${tr.nome}">🏆</span>`);
    if (ra.livello) parts.push(`<span class="hb-group lv${ra.livello}" title="Racchetta ${ra.nome}">🏓</span>`);
    return parts.join('<span class="hb-sep"></span>');
  }

  // Carica il conteggio delle prenotazioni e aggiorna il riquadro premi quando arriva.
  function loadCount(uid) {
    if (ui.counts[uid] != null || !window.Cloud) return;
    playedBookings(uid).then(() => {
      const el = document.querySelector(`[data-premi="${uid}"]`);
      if (el) el.outerHTML = premiBlock(uid, me() && me().id === uid);
      const hb = document.getElementById('hdrBadges');
      if (hb && me() && me().id === uid) hb.innerHTML = headerBadges(uid);
    }).catch(err => console.error(err));
  }

  function playerDialog(id) {
    const u = S().users.find(x => x.id === id);
    if (!u) return;
    const h = Logic.playerHistory(S(), id);
    const sum = Logic.playerSummary(S(), id);
    openDialog(`
      <h2>${esc(u.nome + ' ' + u.cognome)}</h2>
      <p class="muted">${SESSI[u.sesso] || ''}</p>
      ${premiBlock(id, false)}
      <h3>Classifiche</h3>
      ${Object.keys(sum).length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>Classifica</th><th>Posizione</th><th>Punti</th><th>Tornei</th></tr></thead>
        <tbody>${Object.entries(sum).map(([k, r]) => `<tr class="${k.startsWith('generale') ? 'q' : ''}"><td class="name">${Logic.RANK_CATS[k]}</td><td><strong>${r.pos}°</strong> <span class="muted small">su ${r.of}</span></td><td>${r.total}</td><td>${r.events}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Nessun punto in classifica.</p>'}
      <h3>Tornei</h3>
      ${h.length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>Torneo</th><th>Data</th><th>Pos.</th><th>Punti</th></tr></thead>
        <tbody>${h.map(x => `<tr><td class="name"><a href="#/tornei/${x.t.id}" data-action="close-dialog">${esc(x.t.nome)}</a></td><td>${fmtDate(x.t.data)}</td><td>${x.place}°</td><td>${x.pts == null ? '—' : x.pts}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Nessun torneo concluso.</p>'}
      <div class="actions"><button type="button" class="btn" data-action="close-dialog">Chiudi</button></div>`);
    loadCount(id);
  }

  // ---------- corsi ----------

  function viewCourses() {
    const list = S().courses.slice().sort((a, b) => (b.promo - a.promo) || (a.inizio || '').localeCompare(b.inizio || ''));
    const cur = list.filter(c => (c.fine || c.inizio) >= todayKey()), past = list.filter(c => (c.fine || c.inizio) < todayKey());
    return `
      ${sectionHead('<span class="h1">Corsi e lezioni</span>', isAdmin() ? `<button class="btn primary" data-action="course-new">${icon('plus')} Nuovo</button>` : '')}
      ${me() ? '' : `<div class="notice">${icon('info-circle')} <span>Per iscriverti <a href="#/profilo">accedi o registrati</a>.</span></div>`}
      ${cur.length ? `<div class="grid">${cur.map(c => courseCard(c, true)).join('')}</div>` : empty('Nessun corso in programma.', 'school')}
      ${past.length && isAdmin() ? `<section>${sectionHead('Conclusi')}<div class="grid">${past.map(c => courseCard(c, true)).join('')}</div></section>` : ''}`;
  }

  function courseForm(c) {
    const v = c || { tipo: 'corso', posti: 8, prezzo: 0, promo: false };
    openDialog(`
      <form data-form="course">
        <input type="hidden" name="id" value="${c ? c.id : ''}">
        <h2>${c ? 'Modifica' : 'Nuovo corso / lezione'}</h2>
        <div class="row">
          <label>Tipo<select name="tipo">${[['corso', 'Corso'], ['lezione', 'Lezione'], ['clinic', 'Clinic']].map(([k, l]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Livello<input name="livello" value="${esc(v.livello)}" placeholder="Principiante, Intermedio…"></label>
        </div>
        <label>Titolo<input name="titolo" required value="${esc(v.titolo)}"></label>
        <label>Descrizione<textarea name="descrizione" rows="3">${esc(v.descrizione)}</textarea></label>
        <div class="row">
          <label>Inizio${dateField('inizio', v.inizio || '', { required: true })}</label>
          <label>Fine${dateField('fine', v.fine || '')}</label>
        </div>
        <div class="row">
          <label>Giorni e orario<input name="orario" value="${esc(v.orario)}" placeholder="Mar e Gio 19:00–20:00"></label>
          <label>Istruttore<input name="istruttore" value="${esc(v.istruttore)}"></label>
        </div>
        <div class="row">
          <label>Posti<input type="number" min="1" name="posti" value="${v.posti}"></label>
          <label>Prezzo (€)<input type="number" min="0" step="0.5" name="prezzo" value="${v.prezzo}"></label>
        </div>
        <label class="check"><input type="checkbox" name="promo" ${v.promo ? 'checked' : ''}> In evidenza (promosso in home)</label>
        <div class="actions">
          ${c ? `<button type="button" class="btn danger" data-action="course-delete" data-id="${c.id}">Elimina</button>` : ''}
          <button type="button" class="btn" data-action="close-dialog">Annulla</button><button class="btn primary">Salva</button>
        </div>
      </form>`);
  }

  // ---------- profilo e accesso ----------

  function viewProfile() {
    const u = me();
    if (!u) return viewAuth();
    const s = S();
    const bookings = myBookings(u);
    const courses = s.courses.filter(c => c.iscritti.includes(u.id));
    const tours = s.tournaments.filter(t => t.entries.some(e => e.p1 === u.id || e.p2 === u.id));
    return `
      <h1>Ciao ${esc(u.nome)}</h1>
      <p class="muted">${esc(u.email)}${u.role === 'admin' ? ' · <span class="badge live">amministratore</span>' : ''}</p>
      <section class="card">
        <h2>${icon('award')} I miei premi</h2>
        ${premiBlock(u.id, true)}
      </section>
      <div class="grid two">
        <section class="card">
          <h2>${icon('calendar-event')} Le mie prenotazioni</h2>
          ${bookings.length ? `<div class="list">${bookings.map(bookingItem).join('')}</div>` : '<p class="muted">Nessuna prenotazione in programma. <a href="#/prenota">Prenota ora</a></p>'}
        </section>
        <section class="card">
          <h2>${icon('school')} I miei corsi</h2>
          ${courses.length ? `<ul class="plain">${courses.map(c => `<li><strong>${esc(c.titolo)}</strong><br><span class="muted small">${fmtDate(c.inizio)} · ${esc(c.orario || '')}</span></li>`).join('')}</ul>` : '<p class="muted">Nessuna iscrizione. <a href="#/corsi">Scopri i corsi</a></p>'}
        </section>
        <section class="card">
          <h2>${icon('trophy')} I miei tornei</h2>
          ${tours.length ? `<ul class="plain">${tours.map(t => `<li><a href="#/tornei/${t.id}">${esc(t.nome)}</a> ${statusBadge(t)}</li>`).join('')}</ul>` : '<p class="muted">Nessun torneo. <a href="#/tornei">Vedi i tornei</a></p>'}
        </section>
        <section class="card">
          <h2>${icon('user')} I miei dati</h2>
          <form data-form="profile">
            <div class="row"><label>Nome<input name="nome" required value="${esc(u.nome)}"></label><label>Cognome<input name="cognome" required value="${esc(u.cognome)}"></label></div>
            <div class="row"><label>Telefono<input name="tel" type="tel" value="${esc(u.tel)}"></label>
              <label>Sesso<select name="sesso" required><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${u.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <div class="actions"><button class="btn primary">Salva</button></div>
          </form>
          <p class="muted small">Codice utente: <code>${esc(u.id)}</code></p>
          <div class="actions">
            <button class="btn" data-action="theme">${icon('palette')} Stile grafico</button>
            <button class="btn danger" data-action="logout">${icon('logout')} Esci</button>
          </div>
        </section>
      </div>`;
  }

  function viewAuth() {
    const tab = ui.authTab;
    return `
      <div class="auth">
        <h1>${tab === 'login' ? 'Accedi' : 'Crea il tuo account'}</h1>
        <nav class="tabs"><button class="${tab === 'login' ? 'on' : ''}" data-action="auth-tab" data-tab="login">Accedi</button><button class="${tab === 'register' ? 'on' : ''}" data-action="auth-tab" data-tab="register">Registrati</button></nav>
        <section class="card">
        ${tab === 'login' ? `
          <form data-form="login">
            <label>Email<input type="email" name="email" required autocomplete="username"></label>
            <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
            <p class="form-error" hidden></p>
            <button class="btn primary big wide">Accedi</button>
            <p class="center"><button type="button" class="link" data-action="reset-password">Password dimenticata?</button></p>
          </form>` : `
          <form data-form="register">
            <div class="row"><label>Nome<input name="nome" required autocomplete="given-name"></label><label>Cognome<input name="cognome" required autocomplete="family-name"></label></div>
            <label>Email<input type="email" name="email" required autocomplete="email"></label>
            <label>Password (almeno 6 caratteri)<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
            <div class="row"><label>Telefono<input type="tel" name="tel" required autocomplete="tel"></label>
              <label>Sesso<select name="sesso" required><option value="">—</option><option value="M">Uomo</option><option value="F">Donna</option></select></label></div>
            <p class="muted small">Il sesso serve per i tornei maschili, femminili e misti.</p>
            <label class="check"><input type="checkbox" required> Accetto il trattamento dei dati per la gestione di prenotazioni, tornei e corsi.</label>
            <p class="form-error" hidden></p>
            <button class="btn primary big wide">Registrati</button>
          </form>`}
        </section>
        <p class="muted small">${icon('shield-lock')} Email e telefono sono visibili solo a te e agli amministratori del circolo.</p>
      </div>`;
  }

  // ---------- amministrazione ----------

  function viewAdmin() {
    if (!isAdmin()) return empty('Area riservata agli amministratori.', 'lock');
    const s = S(), st = s.settings;
    const rowsText = rows => rows.map(([p, v]) => `${p}=${v}`).join('\n');
    const users = s.users.slice().sort((a, b) => (a.cognome + a.nome).localeCompare(b.cognome + b.nome));
    return `
      <h1>Amministrazione</h1>
      <a class="card adm-link" href="#/prenotazioni">${icon('calendar-search')}<div><strong>Prenotazioni</strong><br>
        <span class="muted small">Calendario con i giorni prenotati, elenco del giorno ed elenco completo di tutte le prenotazioni.</span></div>${icon('chevron-right')}</a>
      <div class="grid two">
        <section class="card">
          <h2>${icon('news')} Spazio editoriale della home</h2>
          <p class="muted small">Due articoli “In evidenza” in prima pagina. Si mostrano solo quelli con titolo o testo. Senza foto compare una palla da pickleball.</p>
          ${[...Array(ARTICOLI).keys()].map(articleForm).join('')}
        </section>
        <section class="card">
          <h2>${icon('building')} Circolo e prenotazioni</h2>
          <form data-form="settings">
            <label>Nome del circolo<input name="nome" value="${esc(st.nome)}"></label>
            <div class="row">
              <label>Durata massima di una prenotazione<select name="maxOre">${[1, 1.5, 2, 2.5, 3, 4].map(h => `<option value="${h}" ${h == st.maxOre ? 'selected' : ''}>${String(h).replace('.', ',')} ${h === 1 ? 'ora' : 'ore'}</option>`).join('')}</select></label>
              <label>Max prenotazioni/giorno<input type="number" min="1" name="maxGiorno" value="${st.maxGiorno}"></label>
              <label>Giorni di anticipo<input type="number" min="1" name="giorniAnticipo" value="${st.giorniAnticipo}"></label>
            </div>
            <label>Avviso in home<textarea name="avviso" rows="2">${esc(st.avviso)}</textarea></label>
            <div class="actions"><button class="btn primary">Salva</button></div>
          </form>
        </section>
        <section class="card">
          <h2>${icon('layout-grid')} Campi</h2>
          <p class="muted small">Per ogni campo: nome, visibilità (i campi nascosti non sono prenotabili) e orari di apertura giorno per giorno. Si prenota a mezz’ore.</p>
          ${s.courts.map(courtForm).join('')}
          <div class="actions"><button class="btn" data-action="court-add">${icon('plus')} Aggiungi campo</button></div>
          <p class="muted small">Per bloccare degli slot (manutenzione, lezioni, eventi) vai su Prenota, seleziona gli slot e scrivi il motivo nel riepilogo.</p>
        </section>
        <section class="card">
          <h2>${icon('list-numbers')} Tipologie di torneo e punti</h2>
          <p class="muted small">Una riga per posizione: <code>posizione=punti</code>. Ogni riga vale fino alla successiva (es. <code>5=40</code> e poi <code>9=20</code>: dal 5° all’8° posto 40 punti).</p>
          ${s.categories.map(c => `<form data-form="category" class="category"><input type="hidden" name="id" value="${c.id}">
            <label>Nome<input name="nome" value="${esc(c.nome)}"></label>
            <label>Punti<textarea name="rows" rows="4">${rowsText(c.rows)}</textarea></label>
            <div class="actions"><button type="button" class="btn small danger" data-action="category-delete" data-id="${c.id}">Elimina</button><button class="btn small primary">Salva</button></div></form>`).join('')}
          <div class="actions"><button class="btn" data-action="category-add">${icon('plus')} Aggiungi tipologia</button></div>
        </section>
        <section class="card">
          <h2>${icon('award')} Premi fedeltà e performance</h2>
          ${(() => { const c = Premi.cfg(s); return `<form data-form="premi">
            <label>Stelle fedeltà: prenotazioni giocate per ogni stella (separate da virgola)<input name="stelle" value="${c.stelle.join(', ')}" placeholder="5, 10, 20, 35, 50"></label>
            <label>Dopo l’ultima soglia: una stella ogni … prenotazioni<input type="number" min="1" name="passoStelle" value="${c.passoStelle}"></label>
            <p class="muted small">10 stelle = ☄️ una cometa, 10 comete = 🪐 un pianeta, 10 pianeti = ☀️ un sole, 10 soli = 🌌 una galassia.</p>
            <label>Trofei (Bronzo, Argento, Oro, Platino, Diamante): punti in classifica generale<input name="trofei" value="${c.trofei.join(', ')}"></label>
            <label>Racchette (stessi livelli): tornei giocati<input name="racchette" value="${c.racchette.join(', ')}"></label>
            <p class="muted small">Le medaglie 🥇🥈🥉 si assegnano da sole a ogni podio nei tornei conclusi.</p>
            <div class="actions"><button class="btn primary">Salva premi</button></div></form>`; })()}
          <h3>Fedeltà dei giocatori</h3>
          ${users.filter(u => u.email).length ? `<div class="table-wrap"><table class="standings"><thead><tr><th>Giocatore</th><th>Prenotazioni giocate</th><th>Stelle</th></tr></thead>
            <tbody>${users.filter(u => u.email).map(u => { const n = ui.counts[u.id]; const st = n == null ? null : Premi.stars(s, n);
              return `<tr><td class="name">${esc(u.cognome + ' ' + u.nome)}</td><td>${n == null ? '—' : n}</td><td>${st ? (st.stelle ? Premi.starIcons(st.stelle) : '—') : ''}</td></tr>`; }).join('')}</tbody></table></div>
            <div class="actions"><button class="btn" data-action="count-all">${icon('refresh')} Calcola le prenotazioni di tutti</button></div>` : '<p class="muted">Nessun utente registrato.</p>'}
        </section>
        <section class="card">
          <h2>${icon('users')} Utenti e giocatori (${users.length})</h2>
          <div class="table-wrap"><table class="standings"><thead><tr><th>Nome</th><th>Account</th><th>Ruolo</th><th></th></tr></thead>
            <tbody>${users.map(u => `<tr><td class="name">${esc(u.cognome + ' ' + u.nome)}${u.sesso ? ` <span class="muted small">${u.sesso}</span>` : ''}${u.tel ? `<br><span class="muted small">${esc(u.tel)}</span>` : ''}</td>
              <td class="small">${u.email ? esc(u.email) : '<span class="muted">senza account</span>'}</td>
              <td>${u.email ? `<select data-change="user-role" data-id="${u.id}" ${u.id === me().id || Cloud.isMain(u.id) ? 'disabled' : ''}><option value="user">Utente</option><option value="tornei" ${u.role === 'tornei' ? 'selected' : ''}>Gestore tornei</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select>` : '—'}</td>
              <td class="right"><button class="link" data-action="player-edit" data-id="${u.id}">modifica</button>${u.id !== me().id ? ` <button class="link danger" data-action="user-delete" data-id="${u.id}">elimina</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
          <form data-form="player-add" class="inline-form">
            <input name="nome" placeholder="Nome" required><input name="cognome" placeholder="Cognome" required>
            <select name="sesso" required><option value="">Sesso</option><option value="M">Uomo</option><option value="F">Donna</option></select>
            <button class="btn">${icon('user-plus')} Aggiungi giocatore</button>
          </form>
          <p class="muted small">I giocatori senza account possono essere inseriti nei tornei dall’organizzazione.
            Ruoli: <strong>Admin</strong> gestisce tutto; <strong>Gestore tornei</strong> crea e gestisce solo i tornei (iscritti, calendario, risultati, tempo di gara) e non vede l’amministrazione.</p>
        </section>
        <section class="card">
          <h2>${icon('database')} Dati</h2>
          <p class="muted small">I dati sono online e condivisi con tutti. Esporta un backup ogni tanto. Dati di esempio e azzeramento non toccano gli account registrati.</p>
          <div class="actions wrap">
            <button class="btn" data-action="demo">${icon('flask')} Carica dati di esempio</button>
            <button class="btn" data-action="export">${icon('download')} Esporta backup</button>
            <label class="btn">${icon('upload')} Importa backup<input type="file" accept="application/json" data-change="import" hidden></label>
            <button class="btn danger" data-action="wipe">${icon('trash')} Azzera tutto</button>
          </div>
        </section>
      </div>`;
  }

  // ---------- rendering ----------

  const VIEWS = { '': viewHome, prenota: viewBook, prenotazioni: viewAdminBookings, tornei: viewTournaments, classifiche: viewRanking, corsi: viewCourses, profilo: viewProfile, admin: viewAdmin };

  let themeFor = null;
  const started = Date.now();
  setTimeout(() => { if (!Store.ready) render(); }, 12000);

  // Schermata di attesa: se il database non risponde spiega il motivo invece di restare in caricamento.
  function loadingView() {
    const c = window.Cloud, err = c && c.lastError, slow = Date.now() - started > 11000;
    if (!c && slow) return `<div class="empty">${icon('plug-connected-x')}<p><strong>Impossibile collegarsi a Firebase.</strong><br>
      Controlla la connessione; se usi un blocco pubblicità o un antivirus che filtra i siti, prova a disattivarlo per questa pagina e ricarica.</p></div>`;
    if (err) return `<div class="empty">${icon('alert-triangle')}<p><strong>Il database non risponde</strong> (codice: <code>${esc(err)}</code>).<br>
      ${err === 'permission-denied' ? 'Le regole di sicurezza non permettono la lettura: pubblica le regole con <code>firebase deploy --only firestore:rules</code>.'
        : err === 'not-found' || err === 'failed-precondition' ? 'Il database Firestore non risulta creato (o è in una modalità diversa da quella standard).'
        : 'Ricarica la pagina; se il problema continua comunica questo codice.'}</p></div>`;
    return `<div class="empty">${icon('loader-2')}<p>Caricamento…${slow ? '<br><span class="small">Ci sta mettendo più del solito: controlla la connessione.</span>' : ''}</p></div>`;
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
    else html = (VIEWS[page] || viewHome)();
    if (page === 'profilo' && u0 && !u0.pending && Store.ready) setTimeout(() => loadCount(u0.id), 0);
    if (Store.ready || page === 'profilo') html = verifyNotice() + html;
    $app.innerHTML = html;
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
    document.querySelectorAll('[data-admin-only]').forEach(el => { el.hidden = !isAdmin(); });
    const u = me();
    // Badge dell'utente al centro dell'header: stelle fedeltà, medaglie, trofeo, racchetta.
    const hb = document.getElementById('hdrBadges');
    hb.hidden = !u || !Store.ready || u.pending;
    if (!hb.hidden) {
      hb.innerHTML = headerBadges(u.id);
      if (ui.counts[u.id] == null) setTimeout(() => loadCount(u.id), 0);
    }
    const who = document.getElementById('who');
    who.innerHTML = u ? `<span class="avatar">${esc((u.nome[0] || '') + (u.cognome[0] || ''))}</span><span class="lbl">${esc(u.nome)}</span>` : `${icon('login-2')}<span class="lbl">Accedi</span>`;
    if ($app.querySelector('form.tour-form')) syncTourForm();
    document.getElementById('clubName').textContent = S().settings.nome;
    document.title = S().settings.nome;
  }

  // Prenotazioni e iscrizioni richiedono l'email confermata.
  function needVerified() {
    if (isAdmin() || window.Cloud.verified) return false;
    toast('Prima conferma la tua email: apri il link che ti abbiamo inviato.', 'err');
    return true;
  }

  function verifyNotice() {
    const u = me();
    if (!u || !window.Cloud || window.Cloud.verified) return '';
    return `<div class="notice">${icon('mail')} <span>Ti abbiamo inviato un’email a <strong>${esc(window.Cloud.user.email)}</strong>: apri il link per confermare l’indirizzo.
      Finché non è confermato non puoi prenotare né iscriverti. Non la trovi? Guarda anche nello spam.</span>
      <button class="btn small primary" data-action="verify-check">Ho confermato</button><button class="btn small" data-action="verify-resend">Invia di nuovo</button></div>`;
  }

  function goProfileForLogin(msg) {
    ui.authTab = 'login';
    toast(msg || 'Accedi per continuare.');
    location.hash = '#/profilo';
  }

  function tourById(id) { return S().tournaments.find(t => t.id === id); }

  // ---------- azioni ----------

  const actions = {
    'tour-pdf': d => tourPdf(tourById(d.id)),
    'timer-start': d => {
      unlockAudio();
      const t = tourById(d.id), inp = document.querySelector('[data-timer] input[name=timerMin]');
      const min = Math.min(120, Math.max(1, Math.round(Number(inp && inp.value) || t.config.minuti)));
      setTimer(d.id, { min, end: Date.now() + min * 60000 });
    },
    'timer-pause': d => { const tm = tourById(d.id).timer; setTimer(d.id, { min: tm.min, left: Math.max(0, tm.end - Date.now()) }); },
    'timer-resume': d => { unlockAudio(); const tm = tourById(d.id).timer; setTimer(d.id, { min: tm.min, end: Date.now() + tm.left }); },
    'timer-reset': d => { if (!confirm('Azzerare il conto alla rovescia?')) return; setTimer(d.id, { min: tourById(d.id).timer.min }); },
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
    logout: async () => { await Store.logout(); toast('Sei uscito.'); location.hash = '#/'; render(); },
    'verify-resend': async () => {
      try { await window.Cloud.resendVerification(); toast('Email inviata di nuovo.', 'ok'); } catch (e) { toast(e.message, 'err'); }
    },
    'verify-check': async () => {
      const ok = await window.Cloud.checkVerified();
      toast(ok ? 'Email confermata, grazie!' : 'Non risulta ancora confermata: apri il link nell’email e riprova.', ok ? 'ok' : 'err');
      render();
    },
    'reset-password': async () => {
      const f = document.querySelector('form[data-form=login]');
      const email = f && f.elements.email.value.trim();
      if (!email) return formError(f, 'Scrivi la tua email qui sopra, poi tocca di nuovo “Password dimenticata?”.');
      try { await Store.resetPassword(email); toast('Ti abbiamo inviato un’email per reimpostare la password.', 'ok'); } catch (e) { formError(f, e.message); }
    },
    'auth-tab': d => { ui.authTab = d.tab; render(); },

    day: d => { ui.date = addDays(ui.date, Number(d.delta)); render(); },
    slot: d => {
      if (!me()) return goProfileForLogin('Accedi o registrati per prenotare.');
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
      if (!confirm('Svuotare questo articolo? Sparirà dalla home.')) return;
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
      toast('Orari copiati: ricordati di salvare il campo.');
    },

    'tour-tab': d => { ui.tab[d.id] = d.tab; render(); },
    'am-sort': d => { (ui.amSort || (ui.amSort = {}))[d.id] = d.sort; render(); },
    'tour-new': () => tourForm(null),
    'tour-edit': d => tourForm(tourById(d.id)),
    'scheda-reset': d => { const f = $app.querySelector('form.tour-form'); if (f) delete f.dataset.dirty; render(); },
    'tour-toggle-reg': d => { const t = tourById(d.id); t.iscrizioniAperte = !t.iscrizioniAperte; save(); },
    'tour-join': d => {
      if (needVerified()) return;
      const t = tourById(d.id);
      if (isPairs(t)) return entryDialog(t, null);
      const err = genderError(t, [me().id]);
      if (err) return toast(err, 'err');
      t.entries.push({ id: Store.uid('e'), p1: me().id, p2: null });
      save();
      toast('Iscrizione confermata!', 'ok');
    },
    'tour-leave': d => {
      const t = tourById(d.id), u = me();
      if (!confirm('Ritirare l’iscrizione? Nel doppio viene ritirata l’intera coppia.')) return;
      t.entries = t.entries.filter(e => e.p1 !== u.id && e.p2 !== u.id);
      save();
    },
    'entry-add': d => entryDialog(tourById(d.id), null),
    'entry-bulk': d => bulkDialog(tourById(d.id)),
    'entry-edit': d => { const t = tourById(d.id); entryDialog(t, t.entries.find(e => e.id === d.entry)); },
    'entry-remove': d => {
      const t = tourById(d.id);
      if (!confirm('Rimuovere questa iscrizione?')) return;
      t.entries = t.entries.filter(e => e.id !== d.entry);
      save();
    },
    'tour-draw': d => {
      const t = tourById(d.id);
      const err = Logic.drawCheck(t, t.entries.length);
      if (err) return toast(err, 'err');
      if (isPairs(t) && t.entries.some(e => !e.p2)) return toast('Ci sono coppie senza compagno: completale o rimuovile.', 'err');
      const sex = Object.fromEntries(t.entries.map(e => [e.id, entrySex(e)]));
      const levels = Object.fromEntries(t.entries.map(e => [e.id, e.livello || 3]));
      if (Logic.isRotazione(t) && t.genere === 'misto') {
        const nM = t.entries.filter(e => sex[e.id] === 'M').length, nF = t.entries.filter(e => sex[e.id] === 'F').length;
        if (nM + nF < t.entries.length) return toast('Torneo misto: indica il sesso di tutti i giocatori.', 'err');
        if (nM < 2 || nF < 2) return toast('Torneo misto: servono almeno 2 uomini e 2 donne.', 'err');
      }
      if (!confirm(Logic.isRotazione(t) ? 'Chiudere le iscrizioni e creare il calendario dei turni?' : 'Chiudere le iscrizioni ed eseguire il sorteggio?')) return;
      const rank = Logic.rankMap(S(), t);
      const pts = e => Logic.entryPlayers(e).reduce((s, id) => s + (rank[id] || 0), 0);
      const idx = new Map(t.entries.map((e, i) => [e.id, i]));
      const ids = t.entries.slice().sort((a, b) => pts(b) - pts(a) || idx.get(a.id) - idx.get(b.id)).map(e => e.id);
      t.iscrizioniAperte = false;
      Logic.startDraw(t, ids, sex, levels);
      ui.tab[t.id] = null;
      save();
      toast(Logic.isRotazione(t) ? 'Calendario dei turni creato.' : 'Sorteggio eseguito.', 'ok');
    },
    'tour-redraw': d => {
      const t = tourById(d.id);
      const played = Object.values(t.results || {}).filter(r => r && r.closed).length;
      const msg = played ? `Rigenerare il tabellone e le gare? Attenzione: ${played === 1 ? 'verrà cancellato il risultato già inserito' : `verranno cancellati i ${played} risultati già inseriti`}.`
        : 'Rigenerare il tabellone e le gare con nuovi abbinamenti e turni di riposo?';
      if (!confirm(msg)) return;
      Logic.startDraw(t, t.seeds, t.sex, t.levels);
      save();
      toast('Nuovo tabellone creato.', 'ok');
    },
    'tour-undraw': d => {
      if (!confirm('Annullare il sorteggio? Verranno cancellati gironi, tabellone e tutti i risultati.')) return;
      Logic.resetDraw(tourById(d.id));
      save();
    },
    'tour-bracket': d => {
      const t = tourById(d.id);
      if (t.bracket && !confirm('Rigenerare il tabellone? I risultati della fase finale verranno cancellati.')) return;
      Logic.resetBracket(t);
      Logic.generateBracket(t);
      ui.tab[t.id] = 'tabellone';
      save();
    },
    'tour-close': d => {
      const tt = tourById(d.id);
      if (tt.tempo && !Logic.tempoComplete(tt) && !confirm('Alcune gare non sono state giocate: interrompere il torneo? Vale la classifica attuale.')) return;
      if (!confirm('Concludere il torneo? I punti verranno assegnati alla classifica.')) return;
      tourById(d.id).closed = true;
      ui.tab[d.id] = 'finale';
      save();
      toast('Torneo concluso: classifica aggiornata.', 'ok');
    },
    'fantasma-next': d => {
      const t = tourById(d.id);
      Logic.fantasmaAdvance(t);
      ui.tab[t.id] = 'fko';
      save();
      toast('Sorteggio eseguito: nuove coppie formate.', 'ok');
    },
    'final-pairs': d => {
      const t = tourById(d.id);
      const last = t.fantasma.ko[t.fantasma.ko.length - 1];
      const ids = last && last.final && !Logic.fantasmaNextIds(t) ? last.ids : Logic.fantasmaNextIds(t);
      if (!ids || ids.length !== 4) return toast('La finale si compone con 4 giocatori.', 'err');
      const cur = last && last.final ? last.matches[0].a : null;
      const mate = cur ? cur.find(x => x !== ids[0]) || cur[1] : null;
      openDialog(`
        <form data-form="final-pairs"><input type="hidden" name="tid" value="${t.id}">
          <h2>Coppie della finale</h2>
          <p>Giocatori rimasti: ${ids.map(id => `<strong>${pname(t, id)}</strong>`).join(', ')}.</p>
          <input type="hidden" name="p0" value="${ids[0]}">
          <label>Compagno di ${pname(t, ids[0])}<select name="mate">${ids.slice(1).map(id => `<option value="${id}" ${cur && cur.includes(ids[0]) && id === mate ? 'selected' : ''}>${pname(t, id)}${t.genere === 'misto' ? ` (${SESSI[t.sex[id]] || '?'})` : ''}</option>`).join('')}</select></label>
          <p class="muted small">Gli altri due giocatori formano la coppia avversaria.${t.genere === 'misto' ? ` ${pname(t, ids[0])} è ${(SESSI[t.sex[ids[0]]] || '').toLowerCase()}.` : ''}</p>
          <div class="actions"><button type="button" class="btn" data-action="close-dialog">Annulla</button><button class="btn primary">Conferma finale</button></div>
        </form>`);
    },
    'fantasma-undo': d => {
      if (!confirm('Annullare l’ultimo sorteggio della fase finale? I suoi risultati verranno cancellati.')) return;
      Logic.fantasmaUndo(tourById(d.id));
      save();
    },
    'tour-reopen': d => { tourById(d.id).closed = false; save(); },
    'tour-delete': d => {
      if (!confirm('Eliminare definitivamente il torneo?')) return;
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
    'count-all': async () => {
      const ids = S().users.filter(u => u.email).map(u => u.id);
      toast('Calcolo in corso…');
      try { await Promise.all(ids.map(playedBookings)); render(); toast('Prenotazioni aggiornate.', 'ok'); } catch (e) { cloudError(e); }
    },

    'course-new': () => courseForm(null),
    'course-edit': d => courseForm(S().courses.find(c => c.id === d.id)),
    'course-delete': d => {
      if (!confirm('Eliminare il corso e le relative iscrizioni?')) return;
      S().courses = S().courses.filter(c => c.id !== d.id);
      closeDialog();
      save();
    },
    'course-join': d => {
      const u = me();
      if (!u) return goProfileForLogin('Accedi o registrati per iscriverti.');
      if (needVerified()) return;
      const c = S().courses.find(x => x.id === d.id);
      if (c.iscritti.length >= c.posti) return toast('Posti esauriti.', 'err');
      c.iscritti.push(u.id);
      save();
      toast('Iscrizione confermata!', 'ok');
    },
    'course-leave': d => {
      if (!confirm('Annullare l’iscrizione?')) return;
      const c = S().courses.find(x => x.id === d.id);
      c.iscritti = c.iscritti.filter(id => id !== me().id);
      save();
    },
    'course-kick': d => {
      const c = S().courses.find(x => x.id === d.id);
      c.iscritti = c.iscritti.filter(id => id !== d.user);
      save();
    },

    'court-add': () => { S().courts.push(Store.normCourt({ id: Store.uid('c'), nome: 'Campo ' + (S().courts.length + 1) })); save(); },
    'court-delete': d => {
      if (!confirm('Eliminare il campo? Le sue prenotazioni verranno cancellate.')) return;
      S().courts = S().courts.filter(c => c.id !== d.id);
      S().bookings = S().bookings.filter(b => b.courtId !== d.id);
      save();
    },
    'category-add': () => { S().categories.push({ id: Store.uid('cat'), nome: 'Nuova tipologia', rows: [[1, 100], [2, 80], [3, 60], [5, 40], [9, 20]] }); save(); },
    'category-delete': d => {
      if (!confirm('Eliminare la tipologia? I tornei collegati non daranno più punti.')) return;
      S().categories = S().categories.filter(c => c.id !== d.id);
      save();
    },
    'player-edit': d => {
      const u = S().users.find(x => x.id === d.id);
      if (!u) return;
      openDialog(`
        <form data-form="player-edit">
          <input type="hidden" name="id" value="${u.id}">
          <h2>Modifica giocatore</h2>
          ${u.email ? `<p class="muted small">Account: ${esc(u.email)}</p>
            <div class="notice"><span>${icon('key')} <strong>Password</strong>: per sicurezza non si può vedere né scrivere al posto dell’utente.
              Con il pulsante gli arriva un’email con il link per sceglierne una nuova (se non la trova, guardi nello spam).</span>
              <button type="button" class="btn small" data-action="user-reset-pw" data-id="${u.id}">${icon('mail')} Invia email per cambiare la password</button></div>`
            : '<p class="muted small">Giocatore senza account.</p>'}
          <div class="row"><label>Nome<input name="nome" required value="${esc(u.nome)}"></label><label>Cognome<input name="cognome" required value="${esc(u.cognome)}"></label></div>
          <label>Sesso<select name="sesso" required><option value="">—</option>${Object.entries(SESSI).map(([k, l]) => `<option value="${k}" ${u.sesso === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <p class="muted small">Le modifiche valgono anche nei tornei e nelle classifiche in cui il giocatore compare.</p>
          <p class="form-error" hidden></p>
          <div class="actions"><button type="button" class="btn" data-action="close-dialog">Annulla</button><button class="btn primary">Salva</button></div>
        </form>`);
    },
    'user-reset-pw': async d => {
      const u = S().users.find(x => x.id === d.id);
      if (!u || !u.email) return;
      if (!confirm(`Inviare a ${u.email} l’email per cambiare la password?`)) return;
      try { await Store.resetPassword(u.email); toast(`Email inviata a ${u.email}.`, 'ok'); } catch (e) { toast(e.message || 'Invio non riuscito.', 'err'); }
    },
    'user-delete': d => {
      const s = S();
      if (s.tournaments.some(t => t.entries.some(e => e.p1 === d.id || e.p2 === d.id))) return toast('Il giocatore è iscritto a dei tornei: non si può eliminare.', 'err');
      const acc = s.users.find(u => u.id === d.id);
      if (!confirm(`Eliminare ${userName(d.id)}? Verranno cancellate anche prenotazioni e iscrizioni ai corsi.${acc && acc.email ? ' L’account di accesso va eliminato dalla console Firebase (Authentication).' : ''}`)) return;
      s.users = s.users.filter(u => u.id !== d.id);
      s.bookings = s.bookings.filter(b => b.userId !== d.id);
      s.courses.forEach(c => { c.iscritti = c.iscritti.filter(id => id !== d.id); });
      save();
    },
    demo: () => {
      if (!confirm('Sostituire tutti i dati (tranne gli account registrati) con quelli di esempio? I dati attuali verranno cancellati per tutti.')) return;
      Store.replace(Demo.build());
      toast('Dati di esempio caricati.', 'ok');
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
      if (!confirm('Cancellare TUTTI i dati (campi, tornei, corsi, prenotazioni, giocatori senza account) per tutti gli utenti?')) return;
      if (prompt('Per confermare scrivi AZZERA') !== 'AZZERA') return;
      Store.replace(Store.empty());
      location.hash = '#/';
      render();
    }
  };

  const changes = {
    'entry-kind': el => { const g = el.form.querySelector('.guest-fields'); if (g) g.hidden = el.value !== '__guest'; },
    'book-date': el => { if (el.value) { ui.date = el.value; render(); } },
    'date-native': el => { const t = el.closest('.date-field').querySelector('input[data-date]'); if (t && el.value) t.value = itDate(el.value); },
    rank: el => { ui.rank[el.dataset.key] = el.value; render(); },
    'pool-type': el => {
      const t = tourById(el.dataset.id);
      if (!confirm('Cambiare la formula del girone? I suoi risultati verranno cancellati (e il tabellone, se generato).')) { render(); return; }
      Logic.setPoolType(t, Number(el.dataset.pool), el.value);
      save();
    },
    'art-foto': el => {
      const file = el.files[0];
      if (!file) return;
      shrinkImage(file).then(url => { ui.artFoto = ui.artFoto || {}; ui.artFoto[el.dataset.i] = url; render(); toast('Foto pronta: ricordati di salvare l’articolo.'); })
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
        if (!confirm('Sostituire tutti i dati con quelli del backup?')) return;
        Store.replace(data);
        toast('Backup importato.', 'ok');
        render();
      }).catch(() => toast('File non valido.', 'err'));
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
    login: async (v, f) => {
      try {
        await Store.login(v.email, v.password);
        toast('Accesso effettuato.', 'ok');
        render();
      } catch (e) { formError(f, e.message); }
    },
    register: async (v, f) => {
      try {
        await Store.register(Object.assign({}, v, { tema: Temi.saved() || '' }));
        toast('Account creato! Controlla la posta per confermare l’email.', 'ok');
        render();
      } catch (e) { formError(f, e.message); }
    },
    profile: v => {
      Object.assign(me(), { nome: v.nome.trim(), cognome: v.cognome.trim(), tel: v.tel.trim(), sesso: v.sesso });
      save();
      toast('Dati salvati.', 'ok');
    },
    articolo: v => {
      const i = Number(v.i), list = S().articoli = (S().articoli || []).slice();
      while (list.length < ARTICOLI) list.push({ titolo: '', testo: '', foto: '', link: '', linkTesto: '' });
      const foto = ui.artFoto && ui.artFoto[i] != null ? ui.artFoto[i] : articolo(i).foto;
      list[i] = { titolo: v.titolo.trim(), testo: v.testo.trim(), foto, link: v.link.trim(), linkTesto: v.linkTesto.trim() };
      if (ui.artFoto) delete ui.artFoto[i];
      save();
      toast('Articolo salvato: è visibile in home.', 'ok');
    },
    court: (v, f) => {
      const c = S().courts.find(x => x.id === v.id);
      const orari = {};
      for (let dd = 1; dd <= 7; dd++) {
        const o = { aperto: f.elements['aperto' + dd].checked, apre: v['apre' + dd], chiude: v['chiude' + dd] };
        if (o.aperto && o.chiude <= o.apre) return toast(`${DAYS[dd]}: l’orario di chiusura deve essere dopo l’apertura.`, 'err');
        orari[dd] = o;
      }
      Object.assign(c, { nome: v.nome.trim() || c.nome, visibile: f.elements.visibile.checked, orari });
      save();
      toast('Campo salvato.', 'ok');
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
        criterioTempo: v.criterioTempo, criterioRot: v.criterioRot || 'punti'
      };
      const puntiRows = parseRows(v.puntiRows || '');
      if (v.categoriaId === 'custom' && !puntiRows.length) return formError(f, 'Inserisci la tabella punti del torneo (es. 1=100).');
      const data = {
        nome: v.nome.trim(), data: v.data, luogo: v.luogo.trim(), categoriaId: v.categoriaId, puntiRows: v.categoriaId === 'custom' ? puntiRows : null,
        coefficiente: v.coefficiente === '' ? 1 : Number(v.coefficiente),
        disciplina: t && t.seeds ? t.disciplina : Logic.isIndividual(formato) || formato === 'americana_tempo' ? 'doppio' : v.disciplina,
        genere: t && t.seeds ? t.genere : v.genere, formato, maxIscritti: Number(v.maxIscritti) || 0,
        iscrizioniAperte: f.elements.iscrizioniAperte.checked, descrizione: v.descrizione.trim()
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
      if (fromScheda) toast('Scheda del torneo salvata.', 'ok');
    },
    'entry-bulk': (v, f) => {
      const t = tourById(v.tid);
      const list = parseBulk(v.elenco, v.sesso);
      if (!list.length) return formError(f, 'Nessun nome trovato: scrivi un giocatore per riga (nome e cognome).');
      if (t.genere !== 'open' && list.some(x => !x.sesso)) return formError(f, 'Indica il sesso: scegline uno qui sotto oppure scrivi “Donne” e “Uomini” prima dei nomi.');
      if (t.genere === 'M' && list.some(x => x.sesso !== 'M')) return formError(f, 'Torneo maschile: l’elenco contiene delle donne.');
      if (t.genere === 'F' && list.some(x => x.sesso !== 'F')) return formError(f, 'Torneo femminile: l’elenco contiene degli uomini.');
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
      toast(`${added} giocatori inseriti${skipped ? `, ${skipped} già presenti o oltre il limite` : ''}.`, 'ok');
    },
    entry: (v, f) => {
      const t = tourById(v.tid);
      if (v.p1 === '__guest' && canTours()) {
        const guest = { nome: (v.gNome || '').trim(), cognome: (v.gCognome || '').trim(), sesso: v.gSesso || '' };
        if (!guest.nome || !guest.cognome) return formError(f, 'Scrivi nome e cognome del giocatore.');
        if (t.genere !== 'open' && !guest.sesso) return formError(f, 'Indica il sesso del giocatore.');
        if (t.genere === 'M' && guest.sesso !== 'M') return formError(f, 'Torneo maschile: possono iscriversi solo uomini.');
        if (t.genere === 'F' && guest.sesso !== 'F') return formError(f, 'Torneo femminile: possono iscriversi solo donne.');
        if (!v.eid && t.maxIscritti && t.entries.length >= t.maxIscritti) return formError(f, 'Numero massimo di iscritti raggiunto.');
        const pl = playerFor(guest);
        if (t.entries.some(x => x.id !== v.eid && x.p1 === pl.id)) return formError(f, 'Questo giocatore è già iscritto.');
        const data = { p1: pl.id, p2: null, guest: null, livello: Number(v.livello) || null };
        if (v.eid) Object.assign(t.entries.find(e => e.id === v.eid), data);
        else t.entries.push(Object.assign({ id: Store.uid('e') }, data));
        closeDialog();
        save();
        return toast('Iscrizione salvata.', 'ok');
      }
      if (!v.p1) return formError(f, 'Scegli il giocatore.');
      if (v.p2 && v.p2 === v.p1) return formError(f, 'Il compagno deve essere un’altra persona.');
      const taken = new Set(t.entries.filter(e => e.id !== v.eid).flatMap(Logic.entryPlayers));
      if (taken.has(v.p1) || (v.p2 && taken.has(v.p2))) return formError(f, 'Uno dei giocatori è già iscritto.');
      const gErr = genderError(t, [v.p1, v.p2]);
      if (gErr) return formError(f, gErr);
      if (!v.eid && t.maxIscritti && t.entries.length >= t.maxIscritti) return formError(f, 'Numero massimo di iscritti raggiunto.');
      const data = { p1: v.p1, p2: v.p2 || null, guest: null, livello: 'livello' in v ? Number(v.livello) || null : (v.eid && t.entries.find(e => e.id === v.eid).livello) || null };
      if (v.eid) Object.assign(t.entries.find(e => e.id === v.eid), data);
      else t.entries.push(Object.assign({ id: Store.uid('e') }, data));
      closeDialog();
      save();
      toast(canTours() ? 'Iscrizione salvata.' : 'Iscrizione confermata!', 'ok');
    },
    result: (v, f) => {
      const t = tourById(v.tid), m = findMatch(t, v.key);
      const fix = applyPlayers(t, v);
      if (fix.err) return formError(f, fix.err);
      const also = fix.swapped && fix.swapped.length ? ` Scambio fatto anche in: ${fix.swapped.join(', ')}.` : '';
      const done = msg => { closeDialog(); save(); if (msg) toast(msg + also, 'ok'); };
      if (t.tempo) {
        const pa = num(v.pa), pb = num(v.pb);
        if (pa == null && pb == null && (fix.changed || !t.results[v.key])) return fix.changed ? done('Giocatori della gara corretti.') : formError(f, 'Inserisci i punti di entrambe le coppie.');
        if (pa == null || pb == null || pa < 0 || pb < 0 || !Number.isInteger(pa) || !Number.isInteger(pb)) return formError(f, 'Inserisci i punti di entrambe le coppie.');
        const mm = findMatch(t, v.key);
        t.results[v.key] = { a: mm.a, b: mm.b, pa, pb, closed: true };
        if (fix.changed) return done('Giocatori e risultato salvati.');
        return done('');
      }
      const n = Number(t.config.sets) === 3 ? 3 : 1, sets = [];
      if (fix.changed && ![...Array(n).keys()].some(i => num(v['a' + i]) != null || num(v['b' + i]) != null) && !t.results[v.key]) return done('Giocatori della gara corretti.');
      for (let i = 0; i < n; i++) {
        const a = num(v['a' + i]), b = num(v['b' + i]);
        if (a == null && b == null) continue;
        if (a == null || b == null) return formError(f, `Completa il set ${i + 1}.`);
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
      toast('Finale composta.', 'ok');
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
      Object.assign(S().settings, { nome: v.nome.trim() || 'Pickleball Club', maxOre: Number(v.maxOre) || 2, maxGiorno: Number(v.maxGiorno) || 1, giorniAnticipo: Number(v.giorniAnticipo) || 1, avviso: v.avviso.trim() });
      save();
      toast('Impostazioni salvate.', 'ok');
    },
    premi: v => {
      const nums = t => String(t || '').split(/[,;\s]+/).map(Number).filter(x => x > 0).sort((a, b) => a - b);
      S().settings.premi = { stelle: nums(v.stelle), passoStelle: Math.max(1, Number(v.passoStelle) || 1), trofei: nums(v.trofei).slice(0, 5), racchette: nums(v.racchette).slice(0, 5) };
      ui.counts = Object.assign({}, ui.counts);
      save();
      toast('Premi salvati.', 'ok');
    },
    category: v => {
      Object.assign(S().categories.find(c => c.id === v.id), { nome: v.nome.trim() || 'Tipologia', rows: parseRows(v.rows) });
      save();
      toast('Tipologia salvata.', 'ok');
    },
    'player-edit': (v, f) => {
      const u = S().users.find(x => x.id === v.id);
      const nome = v.nome.trim(), cognome = v.cognome.trim();
      if (!u) return closeDialog();
      if (!nome || !cognome || !v.sesso) return formError(f, 'Compila nome, cognome e sesso.');
      const other = S().users.find(x => x.id !== u.id && !x.email && !u.email && nameKey(x.nome, x.cognome) === nameKey(nome, cognome) && x.sesso === v.sesso);
      if (other && !confirm(`C’è già ${nome} ${cognome} nell’elenco: i due verranno uniti in un solo giocatore. Continuare?`)) return;
      Object.assign(u, { nome, cognome, sesso: v.sesso });
      closeDialog();
      save();
      toast('Giocatore aggiornato.', 'ok');
    },
    'player-add': (v, f) => {
      S().users.push({ id: Store.uid('u'), nome: v.nome.trim(), cognome: v.cognome.trim(), sesso: v.sesso, email: '', pw: '', role: 'user', tel: '' });
      f.reset();
      save();
      toast('Giocatore aggiunto.', 'ok');
    }
  };

  // Azioni consentite senza essere amministratori.
  const PUBLIC = new Set(['am-sort', 'tour-pdf', 'pick-date', 'timer-sound', 'timer-full', 'rank-cat', 'close-dialog', 'theme', 'set-theme', 'logout', 'reset-password', 'verify-resend', 'verify-check', 'auth-tab', 'day', 'band', 'slot', 'sel-clear', 'sel-shorter', 'sel-longer', 'booking-open', 'booking-confirm', 'booking-delete', 'notice-dismiss', 'tour-tab', 'tour-join', 'tour-leave', 'player', 'course-join', 'course-leave']);
  const PUBLIC_FORMS = new Set(['login', 'register', 'profile', 'entry']);
  // Azioni e moduli del gestore tornei.
  const TOUR = new Set(['tour-new', 'tour-edit', 'tour-toggle-reg', 'entry-add', 'entry-edit', 'entry-remove', 'entry-bulk', 'tour-draw', 'tour-undraw',
    'tour-redraw', 'tour-bracket', 'tour-close', 'tour-reopen', 'tour-delete', 'fantasma-next', 'fantasma-undo', 'final-pairs', 'result', 'result-clear',
    'timer-start', 'timer-pause', 'timer-resume', 'timer-reset']);
  const TOUR_FORMS = new Set(['tour', 'entry-bulk', 'result', 'final-pairs']);

  document.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('date-native')) { try { e.target.showPicker(); } catch (err) {} return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (!actions[a]) return;
    if (!PUBLIC.has(a) && !isAdmin() && !(TOUR.has(a) && canTours())) return;
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
  document.addEventListener('input', e => { const f = e.target.closest && e.target.closest('form.scheda'); if (f) f.dataset.dirty = '1'; });

  document.addEventListener('submit', e => {
    const f = e.target, name = f.dataset.form;
    if (!forms[name]) return;
    e.preventDefault();
    if (!PUBLIC_FORMS.has(name) && !isAdmin() && !(TOUR_FORMS.has(name) && canTours())) return;
    const v = Object.fromEntries(new FormData(f));
    // Date scritte gg/mm/aaaa -> AAAA-MM-GG.
    for (const el of f.querySelectorAll('input[data-date]')) {
      if (!el.value.trim()) { v[el.name] = ''; continue; }
      const iso = parseItDate(el.value);
      if (!iso) { formError(f, `Data non valida: scrivi nel formato gg/mm/aaaa (es. ${itDate(todayKey())}).`); el.focus(); return; }
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
