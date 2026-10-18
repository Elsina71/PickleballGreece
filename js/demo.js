// Dati di esempio per provare la bozza (Amministrazione → Carica dati di esempio).
const Demo = (() => {
  const NOMI = [
    ['Marco', 'Rossi', 'M'], ['Giulia', 'Bianchi', 'F'], ['Luca', 'Ferrari', 'M'], ['Sara', 'Romano', 'F'],
    ['Andrea', 'Colombo', 'M'], ['Chiara', 'Ricci', 'F'], ['Matteo', 'Marino', 'M'], ['Elena', 'Greco', 'F'],
    ['Davide', 'Bruno', 'M'], ['Francesca', 'Gallo', 'F'], ['Simone', 'Conti', 'M'], ['Laura', 'De Luca', 'F'],
    ['Paolo', 'Mancini', 'M'], ['Valentina', 'Costa', 'F'], ['Stefano', 'Giordano', 'M'], ['Martina', 'Rizzo', 'F'],
    ['Alessio', 'Lombardi', 'M'], ['Federica', 'Moretti', 'F'], ['Giorgio', 'Barbieri', 'M'], ['Silvia', 'Fontana', 'F']
  ];

  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv'); };
  const rnd = n => Math.floor(Math.random() * n);

  function randomSets(cfg) {
    const need = Logic.setsToWin(cfg), sets = [];
    let wa = 0, wb = 0;
    for (let i = 0; wa < need && wb < need; i++) {
      const target = Logic.setTarget(cfg, i), lo = rnd(target - 1);
      if (Math.random() < 0.5) { sets.push([target, lo]); wa++; } else { sets.push([lo, target]); wb++; }
    }
    return sets;
  }

  function play(t, m) {
    t.results[m.key] = Array.isArray(m.a) ? { sets: randomSets(t.config), closed: true } : { a: m.a, b: m.b, sets: randomSets(t.config), closed: true };
  }

  function build() {
    const s = Store.empty();
    s.settings.avviso = 'Dati di esempio: giocatori, tornei e corsi di prova.';
    // Giocatori di esempio senza account (gli account veri restano quelli registrati).
    NOMI.forEach(([nome, cognome, sesso], i) => s.users.push({ id: 'up' + i, nome, cognome, sesso, role: 'user', email: '', tel: '' }));
    const P = i => 'up' + i;

    s.courts = ['Campo 1', 'Campo 2', 'Campo 3 (coperto)', 'Campo 4 (coperto)'].map((nome, i) => Store.normCourt({ id: 'c' + (i + 1), nome }));
    // Campo 4 chiuso la domenica e al mattino nel weekend.
    s.courts[3].orari[7] = { aperto: false, apre: '08:00', chiude: '23:00' };
    s.courts[3].orari[6] = { aperto: true, apre: '14:00', chiude: '23:00' };
    [[0, '09:00', '10:30', 0], [0, '18:00', '19:00', 1], [1, '19:00', '21:00', 2], [2, '10:00', '11:00', 3], [0, '20:00', '21:30', 4]].forEach(([c, from, to, u], i) => {
      s.bookings.push({ id: 'g' + i, courtId: s.courts[c].id, date: day(i % 2 + 1), from, to, userId: P(u), blocked: '' });
    });
    s.bookings.push({ id: 'gblk', courtId: 'c3', date: day(1), from: '15:00', to: '16:30', userId: null, blocked: 'Manutenzione rete' });

    s.categories = [
      { id: 'cat-open', nome: 'Open', rows: [[1, 100], [2, 80], [3, 65], [4, 55], [5, 40], [9, 20], [17, 10]] },
      { id: 'cat-club', nome: 'Torneo sociale', rows: [[1, 50], [2, 40], [3, 30], [5, 20], [9, 10]] },
      { id: 'cat-amer', nome: 'Americana', rows: [[1, 30], [2, 25], [3, 20], [4, 15], [5, 10], [9, 5]] }
    ];

    s.courses = [
      { id: 'k1', tipo: 'corso', titolo: 'Corso principianti', descrizione: 'Regole, dritto, rovescio, servizio e posizione in campo. Racchette e palline fornite dal circolo.', istruttore: 'Luca Ferrari', livello: 'Principiante', inizio: day(5), fine: day(40), orario: 'Mar e Gio 19:00–20:00', posti: 8, prezzo: 90, promo: true, iscritti: [P(3), P(7), P(9)] },
      { id: 'k2', tipo: 'corso', titolo: 'Tecnica intermedia: il dink e il terzo colpo', descrizione: 'Gioco alla kitchen, drop shot e strategie di doppio.', istruttore: 'Giulia Bianchi', livello: 'Intermedio', inizio: day(10), fine: day(45), orario: 'Lun 20:00–21:30', posti: 6, prezzo: 110, promo: false, iscritti: [P(4)] },
      { id: 'k3', tipo: 'lezione', titolo: 'Lezione di prova gratuita', descrizione: 'Un’ora per scoprire il pickleball, aperta a tutti.', istruttore: 'Staff', livello: 'Tutti', inizio: day(3), fine: day(3), orario: 'Sabato 10:00–11:00', posti: 12, prezzo: 0, promo: true, iscritti: [] }
    ];

    // Torneo concluso (per la classifica).
    const t1 = Logic.normalize({ id: 't1', nome: 'Open di primavera', data: day(-30), luogo: 'Circolo', categoriaId: 'cat-open', disciplina: 'doppio', genere: 'open', formato: 'eliminazione', coefficiente: 1, iscrizioniAperte: false, config: { sets: 3, punti: 11, puntiDecisivo: 11, thirdPlace: true } });
    for (let i = 0; i < 8; i++) t1.entries.push({ id: 'e1-' + i, p1: P(2 * i), p2: P(2 * i + 1) });
    Logic.startDraw(t1, t1.entries.map(e => e.id));
    for (let guard = 0; guard < 20; guard++) {
      const cm = Logic.computeMain(t1);
      const todo = cm.rounds.flat().concat(cm.third ? [cm.third] : []).filter(m => Logic.real(m.a) && Logic.real(m.b) && !m.stats);
      if (!todo.length) break;
      todo.forEach(m => play(t1, m));
    }
    t1.closed = true;

    // Torneo in corso con gironi "zoppi" (4-3-3): girone A tutti contro tutti, gironi B e C formula FIVB.
    const t2 = Logic.normalize({ id: 't2', nome: 'Torneo sociale d’autunno', data: day(0), luogo: 'Circolo', categoriaId: 'cat-club', disciplina: 'doppio', genere: 'misto', formato: 'gironi_ko', coefficiente: 1, iscrizioniAperte: false, config: { sets: 1, punti: 15, poolSize: 4, qualify: 2, poolType: 'rr', thirdPlace: false } });
    for (let i = 0; i < 10; i++) t2.entries.push({ id: 'e2-' + i, p1: P(i), p2: P(19 - i) });
    Logic.startDraw(t2, t2.entries.map(e => e.id));
    Logic.setPoolType(t2, 1, 'fivb');
    Logic.setPoolType(t2, 2, 'fivb');
    Logic.poolMatches(t2, 0).slice(0, 4).forEach(m => play(t2, m));
    Logic.poolMatches(t2, 1).filter(m => m.round === 1 && !m.bye).forEach(m => play(t2, m));

    // Americana in corso con 9 giocatori (uno riposa a ogni turno).
    const t3 = Logic.normalize({ id: 't3', nome: 'Americana del venerdì', data: day(1), luogo: 'Circolo', categoriaId: 'cat-amer', disciplina: 'doppio', genere: 'open', formato: 'americana', coefficiente: 1, iscrizioniAperte: false, config: { sets: 1, punti: 11, turni: 5, campi: 2, criterio: 'punti' } });
    for (let i = 0; i < 9; i++) t3.entries.push({ id: 'e3-' + i, p1: P(i * 2 % 20) });
    Logic.startDraw(t3, t3.entries.map(e => e.id));
    Logic.americanaMatches(t3).filter(m => m.round < 2).forEach(m => play(t3, m));

    // Torneo fantasma misto, 16 giocatori in 2 gironi da 8: gironi conclusi, pronto per la fase finale.
    const t5 = Logic.normalize({ id: 't5', nome: 'Fantasma misto', data: day(2), luogo: 'Circolo', categoriaId: '', disciplina: 'doppio', genere: 'misto', formato: 'fantasma', coefficiente: 1, iscrizioniAperte: false, config: { sets: 1, punti: 11, poolPlayers: 8, poolTurni: 4, finalisti: 8 } });
    for (let i = 0; i < 16; i++) t5.entries.push({ id: 'e5-' + i, p1: P(i) });
    Logic.startDraw(t5, t5.entries.map(e => e.id), Object.fromEntries(t5.entries.map((e, i) => [e.id, NOMI[i][2]])));
    t5.fantasma.pools.forEach((_, pi) => Logic.fantasmaPoolMatches(t5, pi).forEach(m => play(t5, m)));

    // Americana a tempo: 7 coppie iscritte (una riposa a ogni turno), massimo 4 partite, primi 2 turni giocati.
    const t6 = Logic.normalize({ id: 't6', nome: 'Americana a tempo del sabato', data: day(0), luogo: 'Circolo', categoriaId: 'cat-club', disciplina: 'doppio', genere: 'misto', formato: 'americana_tempo', coefficiente: 1, iscrizioniAperte: false, config: { squadre: 'iscrizione', minuti: 12, maxPartite: 4, criterioTempo: 'quoziente' } });
    for (let i = 0; i < 7; i++) t6.entries.push({ id: 'e6-' + i, p1: P(2 * i), p2: P(2 * i + 1) });
    Logic.startDraw(t6, t6.entries.map(e => e.id));
    Logic.tempoMatches(t6).filter(m => m.round < 2).forEach(m => { t6.results[m.key] = { a: m.a, b: m.b, pa: 8 + rnd(10), pb: 8 + rnd(10), closed: true }; });

    // Torneo futuro con iscrizioni aperte e tabella punti personalizzata.
    const t4 = Logic.normalize({ id: 't4', nome: 'Singolare di novembre', data: day(35), luogo: 'Circolo', categoriaId: 'custom', puntiRows: [[1, 120], [2, 90], [3, 70], [5, 45], [9, 20]], disciplina: 'singolo', genere: 'open', formato: 'gironi_ko', coefficiente: 1, iscrizioniAperte: true, maxIscritti: 16, config: { sets: 3, punti: 11, puntiDecisivo: 11, poolSize: 4, qualify: 2, thirdPlace: true } });
    [1, 4, 6, 10, 13].forEach((i, k) => t4.entries.push({ id: 'e4-' + k, p1: P(i) }));

    s.tournaments = [t1, t2, t3, t5, t6, t4];
    return s;
  }

  return { build };
})();
