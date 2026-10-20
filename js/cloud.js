// Collegamento a Firebase: database condiviso in tempo reale e accesso degli utenti.
//
// Raccolte:
//   data/settings        impostazioni del circolo, campi, tipologie di torneo (pubblico, scrive l'admin)
//   data/articoli        spazio editoriale della home (due articoli con foto)
//   players/{id}         nome, cognome, sesso (pubblico; ognuno modifica il proprio)
//   users/{uid}          email, telefono, stile grafico (privato: l'interessato e gli admin)
//   admins/{uid}         amministratori
//   sfide/{id}           sfide lanciate dagli utenti (pubbliche: data, ora, posti cercati e confermati, formula)
//   leghe/{id}           leghe: tornei e sfide con classifica propria (admins = admin di lega)
//   sfideRisp/{sfida_uid} candidature alle sfide (le vedono il candidato, chi ha lanciato la sfida e gli admin)
//   notifiche/{id}       avvisi per un utente o per "admins"
//   courses/{id}, enrollments/{corso_utente}   corsi e iscrizioni
//   tournaments/{id}, entries/{id}             tornei e iscrizioni ai tornei
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, onSnapshot, setDoc, deleteDoc, getDoc, addDoc, query, where, updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig, mainAdminUids } from './firebase-config.js';

// Emulatore locale (solo per le prove sul computer: aprire la pagina con ?emulatore).
const useEmulator = ['localhost', '127.0.0.1'].includes(location.hostname) && /[?&]emulatore\b/.test(location.search);

const app = initializeApp(useEmulator ? Object.assign({}, firebaseConfig, { projectId: 'demo-pickleball' }) : firebaseConfig);
let db;
try {
  // Cache locale: l'app funziona anche con connessione debole e invia le modifiche appena torna la rete.
  db = initializeFirestore(app, useEmulator ? {} : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = initializeFirestore(app, {});
}
const auth = getAuth(app);
auth.languageCode = 'it';
if (useEmulator) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

let user = null, isAdmin = false;
const isMain = id => mainAdminUids.includes(id);

// ---------- dati ricevuti dal database ----------

const raw = { leghe: {}, sfide: {}, sfidePAll: {}, sfidePInv: {}, sfidePMie: {}, gruppi: {}, nascosti: [], referti: {}, refertoCur: null, scorers: {}, rispOrg: {}, rispMie: {}, articoli: null, settings: null, players: {}, users: {}, admins: new Set(), tourAdmins: new Set(), bookings: {}, courses: {}, enrollments: {}, tournaments: {}, entries: {}, notifiche: {} };
const loaded = new Set();
const NEEDED = ['settings', 'players', 'sfide', 'leghe', 'courses', 'enrollments', 'tournaments', 'entries'];

const refresh = () => window.App && window.App.refresh();

let lastError = null;

function onError(err) {
  console.error(err);
  lastError = (err && (err.code || err.message)) || 'errore';
  if (window.App) window.App.error(err);
}

// Ricostruisce lo stato dell'app a partire dai documenti ricevuti.
function rebuild() {
  const st = Store.state;
  const set = raw.settings || {};
  st.settings = Object.assign(Store.defaultSettings(), set.settings || {});
  st.courts = (set.courts || []).map(Store.normCourt);
  st.articoli = raw.articoli || [];
  st.categories = set.categories || [];
  st.users = Object.entries(raw.players).map(([id, p]) => {
    const priv = raw.users[id] || {};
    return {
      id, nome: p.nome || '', cognome: p.cognome || '', sesso: p.sesso || '', livello: Number(p.livello) || null,
      email: priv.email || '', tel: priv.tel || '', tema: priv.tema || '', verificata: !!priv.verificata, approvato: !!priv.approvato,
      role: isMain(id) || raw.admins.has(id) || (user && id === user.uid && isAdmin) ? 'admin'
        : raw.tourAdmins.has(id) || (user && id === user.uid && isTourAdmin) ? 'tornei' : 'user'
    };
  });
  st.bookings = [];
  st.leghe = Object.entries(raw.leghe).map(([id, x]) => Object.assign({ admins: [], membri: [], stato: 'aperta' }, x.json ? JSON.parse(x.json) : {}, { id, admins: x.admins || [] }));
  // sfide private (sfideP): le vedono solo chi le ha lanciate, gli invitati e gli admin
  const priv = Object.assign({}, raw.sfidePAll, raw.sfidePInv, raw.sfidePMie);
  st.sfide = Object.entries(raw.sfide).map(([id, x]) => Object.assign({ guests: [], conf: {} }, x, { id, privata: false }))
    .concat(Object.entries(priv).map(([id, x]) => Object.assign({ guests: [], conf: {}, invitati: [] }, x, { id, privata: true })))
    .sort((a, b) => ((a.data || '') + (a.ora || '')).localeCompare((b.data || '') + (b.ora || '')));
  st.gruppi = Object.entries(raw.gruppi).map(([id, g]) => Object.assign({ membri: [] }, g, { id })).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  st.nascosti = raw.nascosti || [];
  st.referti = Object.entries(raw.referti).map(([id, r]) => unpackRef(id, r));
  st.scorers = Object.entries(raw.scorers).map(([id, x]) => Object.assign({}, x, { id })).sort((a, b) => String(a.campo).localeCompare(String(b.campo), undefined, { numeric: true }));
  st.risp = Object.entries(Object.assign({}, raw.rispOrg, raw.rispMie)).map(([id, x]) => Object.assign({}, x, { id }));
  st.notifiche = Object.entries(raw.notifiche).map(([id, n]) => Object.assign({ id }, n)).sort((a, b) => (b.at || 0) - (a.at || 0));
  const enr = Object.values(raw.enrollments).sort((a, b) => (a.at || 0) - (b.at || 0));
  st.courses = Object.entries(raw.courses).map(([id, c]) => Object.assign(JSON.parse(c.json), { id, iscritti: enr.filter(e => e.courseId === id).map(e => e.userId) }));
  const entries = Object.entries(raw.entries).map(([id, e]) => ({ id, tid: e.tid, p1: e.p1 || null, p2: e.p2 || null, guest: e.guest || null, livello: e.livello || null }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  st.tournaments = Object.entries(raw.tournaments).map(([id, t]) => Logic.normalize(Object.assign(JSON.parse(t.json), {
    id, entries: entries.filter(e => e.tid === id).map(({ tid, ...e }) => e)
  })));
  last = shapes(st);
}

function listen(name, ref, apply) {
  return onSnapshot(ref, snap => {
    apply(snap);
    loaded.add(name);
    rebuild();
    if (NEEDED.every(n => loaded.has(n))) Store.setReady();
    refresh();
  }, onError);
}

// Gli slot della stessa prenotazione (gid) si riuniscono in un'unica prenotazione dalle "from" alle "to".
function groupBookings(docs) {
  const groups = {};
  Object.entries(docs).forEach(([id, b]) => {
    const gid = b.gid || id;
    groups[gid] = groups[gid] || { id: gid, courtId: b.courtId, date: b.date, from: b.from || b.start, to: b.to || addMin(b.start, 30), userId: b.userId || null, blocked: b.blocked || '' };
  });
  return Object.values(groups);
}

const byId = snap => Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
const addMin = (hm, n) => { const [h, m] = hm.split(':').map(Number), t = h * 60 + m + n; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const todayKey = () => new Date().toLocaleDateString('sv');

listen('settings', doc(db, 'data', 'settings'), s => { raw.settings = s.exists() ? JSON.parse(s.data().json) : null; });
listen('articoli', doc(db, 'data', 'articoli'), s => { raw.articoli = s.exists() ? JSON.parse(s.data().json) : null; });
listen('players', collection(db, 'players'), s => { raw.players = byId(s); });
listen('courses', collection(db, 'courses'), s => { raw.courses = byId(s); });
listen('enrollments', collection(db, 'enrollments'), s => { raw.enrollments = byId(s); });
listen('tournaments', collection(db, 'tournaments'), s => { raw.tournaments = byId(s); });
listen('entries', collection(db, 'entries'), s => { raw.entries = byId(s); });
// Prenotazioni: solo da ieri in avanti (quelle passate non servono e non si scaricano).
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('sv'); })();
listen('sfide', collection(db, 'sfide'), s => { raw.sfide = byId(s); });
listen('leghe', collection(db, 'leghe'), s => { raw.leghe = byId(s); });

// Dati privati: l'admin riceve tutti gli utenti e gli amministratori, gli altri solo il proprio profilo.
let privUnsubs = [];
onAuthStateChanged(auth, async u => {
  privUnsubs.forEach(f => f());
  privUnsubs = [];
  user = u;
  isAdmin = false;
  raw.users = {};
  raw.admins = new Set();
  raw.tourAdmins = new Set();
  raw.notifiche = {};
  raw.rispOrg = {}; raw.rispMie = {};
  raw.sfidePAll = {}; raw.sfidePInv = {}; raw.sfidePMie = {}; raw.gruppi = {}; raw.nascosti = [];
  raw.scorers = {}; scorer = null;
  allUsers = false;
  isTourAdmin = false;
  if (u) {
    isAdmin = isMain(u.uid);
    if (!isAdmin) {
      try { isAdmin = (await getDoc(doc(db, 'admins', u.uid))).exists(); } catch (e) { isAdmin = false; }
    }
    if (isAdmin) {
      privUnsubs.push(listen('users', collection(db, 'users'), s => { raw.users = byId(s); allUsers = true; }));
      privUnsubs.push(listen('admins', collection(db, 'admins'), s => { raw.admins = new Set(s.docs.map(d => d.id)); }));
      privUnsubs.push(listen('tourAdmins', collection(db, 'tourAdmins'), s => { raw.tourAdmins = new Set(s.docs.map(d => d.id)); }));
      privUnsubs.push(listen('notifiche', query(collection(db, 'notifiche'), where('to', 'in', [u.uid, 'admins'])), s => { raw.notifiche = byId(s); }));
      privUnsubs.push(listen('risp', collection(db, 'sfideRisp'), s => { raw.rispOrg = byId(s); }));
      privUnsubs.push(listen('sfideP', collection(db, 'sfideP'), s => { raw.sfidePAll = byId(s); }));
      privUnsubs.push(listen('scorers', collection(db, 'scorers'), s => { raw.scorers = byId(s); }));
    } else {
      try { isTourAdmin = (await getDoc(doc(db, 'tourAdmins', u.uid))).exists(); } catch (e) { isTourAdmin = false; }
      // account di un campo (tablet a bordo campo): compila gli scoresheet dei tornei
      if (!isTourAdmin && !raw.players[u.uid]) { try { const sc = await getDoc(doc(db, 'scorers', u.uid)); scorer = sc.exists() ? Object.assign({ id: u.uid }, sc.data()) : null; } catch (e) { scorer = null; } }
      privUnsubs.push(listen('users', doc(db, 'users', u.uid), s => {
        raw.users = s.exists() ? { [u.uid]: s.data() } : {};
        // l'admin vede chi ha confermato l'email: lo si segna una volta nel profilo
        if (s.exists() && u.emailVerified && !s.data().verificata) updateDoc(doc(db, 'users', u.uid), { verificata: true }).catch(() => {});
      }));
      privUnsubs.push(listen('notifiche', query(collection(db, 'notifiche'), where('to', '==', u.uid)), s => { raw.notifiche = byId(s); }));
      // candidature: le proprie e quelle alle sfide lanciate da questo utente
      privUnsubs.push(listen('rispMie', query(collection(db, 'sfideRisp'), where('uid', '==', u.uid)), s => { raw.rispMie = byId(s); }));
      privUnsubs.push(listen('rispOrg', query(collection(db, 'sfideRisp'), where('org', '==', u.uid)), s => { raw.rispOrg = byId(s); }));
      // sfide private: quelle a cui si è invitati e quelle lanciate
      privUnsubs.push(listen('sfidePInv', query(collection(db, 'sfideP'), where('invitati', 'array-contains', u.uid)), s => { raw.sfidePInv = byId(s); }));
      privUnsubs.push(listen('sfidePMie', query(collection(db, 'sfideP'), where('by', '==', u.uid)), s => { raw.sfidePMie = byId(s); }));
    }
    // un solo documento personale (una lettura): gruppi di invito e avvisi nascosti ("Non mi interessa")
    privUnsubs.push(listen('mio', doc(db, 'mio', u.uid), s => { const d = s.exists() ? s.data() : {}; raw.gruppi = d.gruppi || {}; raw.nascosti = d.ids || []; }));
  }
  rebuild();
  refresh();
});

// ---------- invio delle modifiche ----------
// Per ogni raccolta si confronta lo stato dell'app con l'ultimo contenuto noto e si scrivono solo i documenti cambiati.

let last = null;
// L'admin ha ricevuto i dati privati (email) di tutti gli utenti: si può distinguere chi ha un account.
let allUsers = false;
// Gestore tornei (ruolo limitato ai tornei).
let isTourAdmin = false;
// Account di un campo: { campo, tid ('' = tutti i tornei) }
let scorer = null;

function shapes(st) {
  const d = { leghe: {}, data: {}, players: {}, users: {}, admins: {}, tourAdmins: {}, bookings: {}, courses: {}, enrollments: {}, tournaments: {}, entries: {} };
  d.data.settings = { json: JSON.stringify({ settings: st.settings, courts: st.courts, categories: st.categories }) };
  d.data.articoli = { json: JSON.stringify(st.articoli || []) };
  st.users.forEach(u => {
    d.players[u.id] = { nome: u.nome || '', cognome: u.cognome || '', sesso: u.sesso || '' };
    if (u.livello) d.players[u.id].livello = Number(u.livello);
    if (u.email || u.tel || u.tema) {
      d.users[u.id] = { email: u.email || '', tel: u.tel || '', tema: u.tema || '' };
      if (u.verificata) d.users[u.id].verificata = true;
      if (u.approvato) d.users[u.id].approvato = true;
    }
    if (u.role === 'admin' && !isMain(u.id)) d.admins[u.id] = { nome: `${u.nome} ${u.cognome}` };
    if (u.role === 'tornei') d.tourAdmins[u.id] = { nome: `${u.nome} ${u.cognome}` };
  });
  st.bookings.forEach(b => {
    for (let t = b.from; t < b.to; t = addMin(t, 30)) {
      d.bookings[Store.slotId(b.date, b.courtId, t)] = { courtId: b.courtId, date: b.date, start: t, from: b.from, to: b.to, gid: b.id, userId: b.userId || null, blocked: b.blocked || '', first: t === b.from };
    }
  });
  st.courses.forEach(c => {
    const { id, iscritti, ...rest } = c;
    d.courses[id] = { json: JSON.stringify(rest) };
    iscritti.forEach(uid => { d.enrollments[`${id}_${uid}`] = { courseId: id, userId: uid }; });
  });
  st.tournaments.forEach(t => {
    const { entries, ...rest } = t;
    // owner: chi ha lanciato la sfida da cui nasce il torneo (lo gestisce come un gestore tornei)
    d.tournaments[t.id] = { json: JSON.stringify(rest), open: !!t.iscrizioniAperte && !t.seeds, owner: t.owner || '', lega: t.lega || '' };
    entries.forEach(e => {
      const doc = { tid: t.id, p1: e.p1 || null, p2: e.p2 || null };
      // Giocatore non registrato (inserito dall'organizzatore) e livello di gioco.
      if (e.guest) doc.guest = { nome: e.guest.nome, cognome: e.guest.cognome, sesso: e.guest.sesso || '' };
      if (e.livello) doc.livello = Number(e.livello);
      d.entries[e.id] = doc;
    });
  });
  // leghe: admins fuori dal JSON (servono alle regole), il resto nel JSON
  (st.leghe || []).forEach(l => { const { id, admins, ...rest } = l; d.leghe[id] = { admins: admins || [], json: JSON.stringify(rest) }; });
  return d;
}

const ref = (col, id) => (col === 'data' ? doc(db, 'data', id) : doc(db, col, id));

function push(st) {
  if (!user || !last) return;
  const next = shapes(st);
  const writes = [];
  Object.keys(next).forEach(col => {
    const before = last[col] || {}, after = next[col];
    Object.keys(after).forEach(id => {
      if (JSON.stringify(after[id]) === JSON.stringify(before[id])) return;
      const data = Object.assign({}, after[id]);
      if (col === 'enrollments' || col === 'entries') data.at = Date.now();
      writes.push(setDoc(ref(col, id), data));
    });
    Object.keys(before).forEach(id => { if (!(id in after)) writes.push(deleteDoc(ref(col, id))); });
  });
  last = next;
  Promise.all(writes).catch(onError);
}

// ---------- accesso ----------

const AUTH_ERRORS = {
  'auth/invalid-credential': T("Email o password non corretti."),
  'auth/wrong-password': T("Email o password non corretti."),
  'auth/user-not-found': T("Email o password non corretti."),
  'auth/invalid-email': T("Email non valida."),
  'auth/email-already-in-use': T("Esiste già un account con questa email."),
  'auth/weak-password': T("La password deve avere almeno 6 caratteri."),
  'auth/too-many-requests': T("Troppi tentativi: riprova tra qualche minuto."),
  'auth/network-request-failed': T("Connessione assente: riprova.")
};
const authError = e => new Error(AUTH_ERRORS[e.code] || T("Operazione non riuscita: ") + (e.code || e.message));

async function login(email, password) {
  try { await signInWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw authError(e); }
}

async function register(v) {
  if (!['M', 'F'].includes(v.sesso)) throw new Error(T("Indica il sesso."));
  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, v.email.trim(), v.password); } catch (e) { throw authError(e); }
  const id = cred.user.uid;
  const pl = { nome: v.nome.trim(), cognome: v.cognome.trim(), sesso: v.sesso };
  if (Number(v.livello)) pl.livello = Number(v.livello);
  await setDoc(doc(db, 'players', id), pl);
  await setDoc(doc(db, 'users', id), { email: cred.user.email, tel: (v.tel || '').trim(), tema: v.tema || '' });
  try { await sendEmailVerification(cred.user); } catch (e) { console.error(e); }
}

// Email di conferma dell'indirizzo: finché non è confermato l'utente non può prenotare né iscriversi.
async function resendVerification() {
  if (!user) return;
  try { await sendEmailVerification(user); } catch (e) { throw authError(e); }
}

// Dopo aver aperto il link di conferma: si aggiorna lo stato e il permesso nel database.
async function checkVerified() {
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  refresh();
  return user.emailVerified;
}

// Numero di prenotazioni di un utente (tutte, anche future): si conta solo il primo slot di ciascuna.
// Costa una sola lettura ogni 1000 prenotazioni.
// ---------- sfide ----------
// Scritture dirette (non passano dal confronto dello stato): sfide e candidature.
const isPriv = id => id in raw.sfidePAll || id in raw.sfidePInv || id in raw.sfidePMie;
const sfidaRef = id => doc(db, isPriv(id) ? 'sfideP' : 'sfide', id);
function createSfida(id, data) {
  const { privata, ...d } = data;
  if (!privata) delete d.invitati;
  return setDoc(doc(db, privata ? 'sfideP' : 'sfide', id), Object.assign({}, d, { by: user.uid, at: Date.now() }));
}
// invitato a una sfida privata: aggiorna i posti confermati (+ o -) senza riscrivere il resto
function bumpSfida(id, sessi, dir) {
  const p = { 'conf.tot': increment(dir * sessi.length) };
  ['M', 'F'].forEach(k => { const n = sessi.filter(x => x === k).length; if (n) p['conf.' + k] = increment(dir * n); });
  return updateDoc(sfidaRef(id), p);
}
function updateSfida(id, patch) { return updateDoc(sfidaRef(id), patch); }
function deleteSfida(id) { return deleteDoc(sfidaRef(id)); }
// Candidatura: id = sfida_utente; org = chi ha lanciato la sfida (serve alle regole di lettura).
// partner (sfide a coppie fisse): { uid } se registrato, altrimenti { nome, cognome, sesso }; con il nome da mostrare.
function applySfida(sfida, me, partner, stato) {
  const d = { sid: sfida.id, uid: user.uid, org: sfida.by, nome: `${me.nome} ${me.cognome}`, sesso: me.sesso || '', stato: stato || 'attesa', visto: stato === 'confermata', at: Date.now() };
  if (partner) d.partner = partner;
  return setDoc(doc(db, 'sfideRisp', sfida.id + '_' + user.uid), d);
}
function updateRisp(id, patch) { return updateDoc(doc(db, 'sfideRisp', id), patch); }
function deleteRisp(id) { return deleteDoc(doc(db, 'sfideRisp', id)); }

// ---------- scoresheet ----------
// Le gare di un torneo con lo scoresheet aperto (punteggio in diretta): solo mentre si guarda quel torneo.
let refUnsub = null, refTid = null;
function watchReferti(tid) {
  if (tid === refTid) return;
  if (refUnsub) refUnsub();
  refUnsub = null; refTid = tid; raw.referti = {};
  if (tid) refUnsub = onSnapshot(query(collection(db, 'referti'), where('tid', '==', tid)), s => { raw.referti = byId(s); rebuild(); refresh(); }, onError);
  rebuild();
}
// Lo scoresheet aperto su questo dispositivo (per riprenderlo anche da un altro telefono).
let curUnsub = null, curId = null;
function watchReferto(id, cb) {
  if (id === curId) return;
  if (curUnsub) curUnsub();
  curUnsub = null; curId = id; raw.refertoCur = null;
  if (id) curUnsub = onSnapshot(doc(db, 'referti', id), s => { raw.refertoCur = s.exists() ? unpackRef(id, s.data()) : null; if (cb) cb(raw.refertoCur); }, onError);
}
// nomi delle due squadre salvati in due campi (niente liste dentro liste nel database)
const unpackRef = (id, r) => Object.assign({}, r, { id, nomi: r.nomi0 ? [r.nomi0, r.nomi1 || []] : r.nomi || [[], []] });
const saveReferto = (id, data) => setDoc(doc(db, 'referti', id), Object.assign({}, data, { at: Date.now() }), { merge: true });
const deleteReferto = id => deleteDoc(doc(db, 'referti', id));

// Account dei campi: li crea l'admin con un'app secondaria (così resta collegato con il proprio account).
async function createScorer(email, password, campo, tid) {
  const app2 = initializeApp(firebaseConfig, 'campo-' + Date.now());
  const auth2 = getAuth(app2);
  if (useEmulator) connectAuthEmulator(auth2, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const cred = await createUserWithEmailAndPassword(auth2, email.trim(), password);
    await setDoc(doc(db, 'scorers', cred.user.uid), { email: email.trim(), campo: String(campo).trim(), tid: tid || '' });
    await signOut(auth2);
  } catch (e) { throw authError(e); } finally { deleteApp(app2).catch(() => {}); }
}
const updateScorer = (id, patch) => updateDoc(doc(db, 'scorers', id), patch);
const deleteScorer = id => deleteDoc(doc(db, 'scorers', id));

const mioRef = () => doc(db, 'mio', user.uid);
function saveMio(patch) { rebuild(); refresh(); return setDoc(mioRef(), patch, { merge: true }); }
function saveGruppo(id, nome, membri) {
  raw.gruppi = Object.assign({}, raw.gruppi, { [id]: { nome, membri } });
  return saveMio({ gruppi: raw.gruppi });
}
function deleteGruppo(id) {
  const g = Object.assign({}, raw.gruppi); delete g[id]; raw.gruppi = g;
  return setDoc(mioRef(), { gruppi: g, ids: raw.nascosti || [] });
}
// "Non mi interessa": l'avviso non compare più (su tutti i dispositivi). Si tengono solo quelli di sfide e tornei che esistono ancora.
function nascondi(id) {
  if (!user) return Promise.resolve();
  const live = new Set(Object.keys(raw.sfide).concat(Object.keys(raw.sfidePAll), Object.keys(raw.sfidePInv)).map(k => 's:' + k).concat(Object.keys(raw.tournaments).map(k => 't:' + k)));
  raw.nascosti = (raw.nascosti || []).filter(k => live.has(k)).concat(id);
  return saveMio({ ids: raw.nascosti });
}

function notify(to, text) {
  if (!user || !to) return;
  addDoc(collection(db, 'notifiche'), { to, text: text.slice(0, 400), at: Date.now(), by: user.uid }).catch(onError);
}

function dismiss(id) {
  delete raw.notifiche[id];
  rebuild();
  refresh();
  deleteDoc(doc(db, 'notifiche', id)).catch(onError);
}

async function resetPassword(email) {
  try { await sendPasswordResetEmail(auth, email.trim()); } catch (e) { throw authError(e); }
}

window.Cloud = {
  get user() { return user; },
  get isAdmin() { return isAdmin; },
  get isTourAdmin() { return isTourAdmin; },
  get allUsers() { return allUsers; },
  get lastError() { return lastError; },
  // email confermata oppure registrazione confermata dall'admin
  get verified() { return !!user && (user.emailVerified || !!(raw.users[user.uid] && raw.users[user.uid].approvato)); },
  get scorer() { return scorer; },
  get refertoCur() { return raw.refertoCur; },
  watchReferti, watchReferto, saveReferto, deleteReferto, createScorer, updateScorer, deleteScorer,
  resendVerification,
  checkVerified,
  isMain,
  push,
  notify,
  dismiss,
  createSfida, updateSfida, deleteSfida, bumpSfida, applySfida, updateRisp, deleteRisp, saveGruppo, deleteGruppo, nascondi,
  login,
  register,
  logout: () => signOut(auth),
  resetPassword
};
refresh();
