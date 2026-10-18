// Stato dell'app. I dati arrivano dal database online (cloud.js) e le modifiche vi vengono inviate.
const Store = (() => {
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultSettings() {
    return { nome: 'Pickleball Greece', maxGiorno: 2, maxOre: 2, giorniAnticipo: 7, avviso: '', premi: null, sfidePunti: null };
  }

  // Campo: nome, visibile (prenotabile) e orari di apertura per giorno della settimana (1 = lunedì … 7 = domenica).
  function defaultOrari() {
    return Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, { aperto: true, apre: '08:00', chiude: '23:00' }]));
  }

  function normCourt(c) {
    const orari = defaultOrari();
    Object.keys(c.orari || {}).forEach(d => { orari[d] = Object.assign(orari[d], c.orari[d]); });
    return { id: c.id, nome: c.nome || 'Campo', visibile: c.visibile !== false, orari };
  }

  function empty() {
    return { version: 1, settings: defaultSettings(), users: [], courts: [], bookings: [], courses: [], categories: [], tournaments: [], notifiche: [], articoli: [], sfide: [], risp: [] };
  }

  function isValid(s) {
    return !!s && ['users', 'courts', 'bookings', 'courses', 'categories', 'tournaments'].every(k => Array.isArray(s[k]));
  }

  // Ogni prenotazione occupa uno o più slot di mezz'ora; nel database c'è un documento per slot
  // (campo, giorno, ora di inizio), così lo stesso slot non può essere prenotato due volte.
  const slotId = (date, courtId, start) => `${date}_${courtId}_${start}`;

  let state = empty();
  let ready = false;

  function save() {
    if (window.Cloud) window.Cloud.push(state);
  }

  // Sostituisce tutti i dati (dati di esempio, backup, azzeramento), mantenendo gli account registrati.
  function replace(s) {
    const accounts = state.users.filter(u => u.email);
    const ids = new Set(accounts.map(u => u.id));
    state = Object.assign(empty(), s, {
      settings: Object.assign(defaultSettings(), s.settings || {}),
      users: accounts.concat((s.users || []).filter(u => !u.email && !ids.has(u.id)).map(u => Object.assign({}, u, { tel: '', tema: '', role: 'user' }))),
      courts: (s.courts || []).map(normCourt),
      bookings: (s.bookings || []).map(b => Object.assign({ blocked: '', userId: null }, b)),
      tournaments: (s.tournaments || []).map(Logic.normalize),
      courses: (s.courses || []).map(c => Object.assign({ iscritti: [] }, c))
    });
    save();
  }

  function current() {
    const c = window.Cloud;
    if (!c || !c.user) return null;
    const u = state.users.find(x => x.id === c.user.uid);
    const role = c.isAdmin ? 'admin' : c.isTourAdmin ? 'tornei' : 'user';
    if (u) { u.role = role; return u; }
    // Profilo non ancora arrivato dal database.
    return { id: c.user.uid, nome: '', cognome: '', sesso: '', email: c.user.email, tel: '', tema: '', role, pending: true };
  }

  const cloud = () => {
    if (!window.Cloud) throw new Error('Connessione al database non disponibile. Controlla la rete e ricarica la pagina.');
    return window.Cloud;
  };

  return {
    get state() { return state; },
    set state(s) { state = s; },
    get ready() { return ready; },
    setReady() { ready = true; },
    uid, empty, isValid, slotId, defaultSettings, defaultOrari, normCourt, save, replace, current,
    login: (email, password) => cloud().login(email, password),
    register: data => cloud().register(data),
    logout: () => cloud().logout(),
    resetPassword: email => cloud().resetPassword(email)
  };
})();
