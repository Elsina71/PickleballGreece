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
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, onSnapshot, setDoc, deleteDoc, getDoc, addDoc, query, where, updateDoc
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

const raw = { leghe: {}, sfide: {}, rispOrg: {}, rispMie: {}, articoli: null, settings: null, players: {}, users: {}, admins: new Set(), tourAdmins: new Set(), bookings: {}, courses: {}, enrollments: {}, tournaments: {}, entries: {}, notifiche: {} };
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
      email: priv.email || '', tel: priv.tel || '', tema: priv.tema || '',
      role: isMain(id) || raw.admins.has(id) || (user && id === user.uid && isAdmin) ? 'admin'
        : raw.tourAdmins.has(id) || (user && id === user.uid && isTourAdmin) ? 'tornei' : 'user'
    };
  });
  st.bookings = [];
  st.leghe = Object.entries(raw.leghe).map(([id, x]) => Object.assign({ admins: [], membri: [], stato: 'aperta' }, x.json ? JSON.parse(x.json) : {}, { id, admins: x.admins || [] }));
  st.sfide = Object.entries(raw.sfide).map(([id, x]) => Object.assign({ guests: [], conf: {} }, x, { id }))
    .sort((a, b) => ((a.data || '') + (a.ora || '')).localeCompare((b.data || '') + (b.ora || '')));
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
    } else {
      try { isTourAdmin = (await getDoc(doc(db, 'tourAdmins', u.uid))).exists(); } catch (e) { isTourAdmin = false; }
      privUnsubs.push(listen('users', doc(db, 'users', u.uid), s => { raw.users = s.exists() ? { [u.uid]: s.data() } : {}; }));
      privUnsubs.push(listen('notifiche', query(collection(db, 'notifiche'), where('to', '==', u.uid)), s => { raw.notifiche = byId(s); }));
      // candidature: le proprie e quelle alle sfide lanciate da questo utente
      privUnsubs.push(listen('rispMie', query(collection(db, 'sfideRisp'), where('uid', '==', u.uid)), s => { raw.rispMie = byId(s); }));
      privUnsubs.push(listen('rispOrg', query(collection(db, 'sfideRisp'), where('org', '==', u.uid)), s => { raw.rispOrg = byId(s); }));
    }
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

function shapes(st) {
  const d = { leghe: {}, data: {}, players: {}, users: {}, admins: {}, tourAdmins: {}, bookings: {}, courses: {}, enrollments: {}, tournaments: {}, entries: {} };
  d.data.settings = { json: JSON.stringify({ settings: st.settings, courts: st.courts, categories: st.categories }) };
  d.data.articoli = { json: JSON.stringify(st.articoli || []) };
  st.users.forEach(u => {
    d.players[u.id] = { nome: u.nome || '', cognome: u.cognome || '', sesso: u.sesso || '' };
    if (u.livello) d.players[u.id].livello = Number(u.livello);
    if (u.email || u.tel || u.tema) d.users[u.id] = { email: u.email || '', tel: u.tel || '', tema: u.tema || '' };
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
  'auth/invalid-credential': 'Email o password non corretti.',
  'auth/wrong-password': 'Email o password non corretti.',
  'auth/user-not-found': 'Email o password non corretti.',
  'auth/invalid-email': 'Email non valida.',
  'auth/email-already-in-use': 'Esiste già un account con questa email.',
  'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
  'auth/too-many-requests': 'Troppi tentativi: riprova tra qualche minuto.',
  'auth/network-request-failed': 'Connessione assente: riprova.'
};
const authError = e => new Error(AUTH_ERRORS[e.code] || 'Operazione non riuscita: ' + (e.code || e.message));

async function login(email, password) {
  try { await signInWithEmailAndPassword(auth, email.trim(), password); } catch (e) { throw authError(e); }
}

async function register(v) {
  if (!['M', 'F'].includes(v.sesso)) throw new Error('Indica il sesso.');
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
const sfidaRef = id => doc(db, 'sfide', id);
function createSfida(id, data) { return setDoc(sfidaRef(id), Object.assign({}, data, { by: user.uid, at: Date.now() })); }
function updateSfida(id, patch) { return updateDoc(sfidaRef(id), patch); }
function deleteSfida(id) { return deleteDoc(sfidaRef(id)); }
// Candidatura: id = sfida_utente; org = chi ha lanciato la sfida (serve alle regole di lettura).
// partner (sfide a coppie fisse): { uid } se registrato, altrimenti { nome, cognome, sesso }; con il nome da mostrare.
function applySfida(sfida, me, partner) {
  const d = { sid: sfida.id, uid: user.uid, org: sfida.by, nome: `${me.nome} ${me.cognome}`, sesso: me.sesso || '', stato: 'attesa', visto: false, at: Date.now() };
  if (partner) d.partner = partner;
  return setDoc(doc(db, 'sfideRisp', sfida.id + '_' + user.uid), d);
}
function updateRisp(id, patch) { return updateDoc(doc(db, 'sfideRisp', id), patch); }
function deleteRisp(id) { return deleteDoc(doc(db, 'sfideRisp', id)); }

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
  get verified() { return !!user && user.emailVerified; },
  resendVerification,
  checkVerified,
  isMain,
  push,
  notify,
  dismiss,
  createSfida, updateSfida, deleteSfida, applySfida, updateRisp, deleteRisp,
  login,
  register,
  logout: () => signOut(auth),
  resetPassword
};
refresh();
