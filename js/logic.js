// Regole dei tornei: formule, gironi (anche "zoppi", con bye), tabelloni, americana, torneo fantasma, piazzamenti e ranking.
// Base ripresa dal Panhellenic Championship Manager (beach volley), adattata al pickleball.
const Logic = (() => {

  const BYE = '~bye';
  const real = id => !!id && id !== BYE;
  const round2 = x => Math.round(x * 100) / 100;

  const FORMATS = {
    gironi_ko: T("Gironi + eliminazione diretta"),
    girone_unico: T("Girone unico (tutti contro tutti)"),
    eliminazione: T("Eliminazione diretta"),
    doppia: T("Doppia eliminazione"),
    americana: T("All'americana (compagni a rotazione)"),
    americana_tempo: T("Americana a tempo (gare a tempo, vince chi fa più punti)"),
    fantasma: T("Torneo fantasma (compagno sorteggiato a ogni gara)")
  };
  // Formule a iscrizione individuale, giocate in doppio con compagni che cambiano.
  const INDIVIDUAL = ['americana', 'fantasma'];
  const isIndividual = f => INDIVIDUAL.includes(f);
  // Iscrizione individuale per questo torneo (americana a tempo con squadre sorteggiate compresa).
  const individualEntry = t => isIndividual(t.formato) || (t.formato === 'americana_tempo' && t.config.squadre !== 'iscrizione');
  // Americana a tempo con compagno diverso a ogni turno (classifica individuale per punti fatti).
  const isRotazione = t => t.formato === 'americana_tempo' && t.config.squadre === 'rotazione';
  const TEMPO_SQUADRE = {
    rotazione: T("Compagno diverso a ogni turno (classifica individuale)"),
    iscrizione: T("Coppie fisse iscritte (o composte dall’organizzatore)"),
    sorteggio: T("Coppie fisse sorteggiate a inizio torneo")
  };
  // Livello di gioco dei giocatori (scelto alla registrazione) e degli iscritti.
  const LIVELLI = { 1: T("Principiante"), 2: T("Intermedio"), 3: T("Intermedio avanzato"), 4: T("Avanzato"), 5: T("Pro") };
  const TEMPO_CRITERI = { quoziente: T("Quoziente punti (fatti / subiti)"), punti: T("Punti fatti") };
  const FINALISTS = [4, 8, 16, 32];
  const POINTS = [9, 11, 15, 21];
  const POOL_TYPES = { rr: T("Tutti contro tutti"), fivb: T("FIVB (vincenti / perdenti)") };

  const hasPools = f => f === 'gironi_ko' || f === 'girone_unico';
  const hasBracket = f => f === 'gironi_ko' || f === 'eliminazione' || f === 'doppia';

  function defaultConfig() {
    return {
      sets: 1, punti: 11, puntiDecisivo: 11, sistema: 'sideout',
      poolSize: 4, qualify: 2, poolType: 'rr', thirdPlace: true,
      turni: 5, campi: 0, criterio: 'punti',
      poolPlayers: 8, poolTurni: 4, finalisti: 8,
      squadre: 'rotazione', maxPartite: 5, minuti: 15, criterioTempo: 'quoziente', criterioRot: 'punti', vincolo: 'equilibrato'
    };
  }

  function normalize(t) {
    t.config = Object.assign(defaultConfig(), t.config || {});
    if (!t.results) t.results = {};
    if (!t.entries) t.entries = [];
    ['seeds', 'pools', 'bracket', 'americana', 'fantasma', 'tempo', 'sex', 'levels'].forEach(k => { if (t[k] === undefined) t[k] = null; });
    t.closed = !!t.closed;
    if (t.coefficiente == null) t.coefficiente = 1;
    return t;
  }

  // ---------- punteggio ----------

  const setsToWin = cfg => (Number(cfg.sets) === 3 ? 2 : 1);

  function setTarget(cfg, i) {
    return Number(cfg.sets) === 3 && i === 2 ? Number(cfg.puntiDecisivo) : Number(cfg.punti);
  }

  // Nel pickleball il set si vince con 2 punti di scarto.
  function isCompleteSet(x, y, target) {
    const hi = Math.max(x, y), lo = Math.min(x, y);
    return hi >= target && hi - lo >= 2 && (hi === target || hi - lo === 2);
  }

  // Restituisce un messaggio di errore oppure null se il risultato è valido.
  function validateResult(sets, forfeit, cfg) {
    if (forfeit) return null;
    const need = setsToWin(cfg);
    if (!sets.length) return T("Inserisci il punteggio.");
    let wa = 0, wb = 0;
    for (let i = 0; i < sets.length; i++) {
      if (wa === need || wb === need) return T("Troppi set: la partita era già decisa.");
      const [a, b] = sets[i], target = setTarget(cfg, i);
      if (!isCompleteSet(a, b, target)) return `${T("Set {0} non valido: si gioca a {1} con 2 punti di scarto.", [i + 1, target])}`;
      if (a > b) wa++; else wb++;
    }
    if (wa !== need && wb !== need) return T("Partita incompleta: manca un set.");
    return null;
  }

  const emptyLine = () => ({ sw: 0, sl: 0, pw: 0, pl: 0 });

  // Statistiche della partita per i due lati. forfeit = lato che perde a tavolino / si ritira.
  function matchStats(res, cfg) {
    if (!res) return null;
    const A = emptyLine(), B = emptyLine();
    if (res.forfeit) {
      const need = setsToWin(cfg);
      const W = res.forfeit === 'a' ? B : A, L = res.forfeit === 'a' ? A : B;
      for (let i = 0; i < need; i++) { const p = setTarget(cfg, i); W.sw++; L.sl++; W.pw += p; L.pl += p; }
      return { winner: res.forfeit === 'a' ? 'b' : 'a', a: A, b: B, tag: 'rit.' };
    }
    const sets = res.sets || [];
    if (!sets.length) return null;
    sets.forEach(([x, y]) => {
      A.pw += x; A.pl += y; B.pw += y; B.pl += x;
      if (x > y) { A.sw++; B.sl++; } else { B.sw++; A.sl++; }
    });
    if (A.sw === B.sw) return null;
    return { winner: A.sw > B.sw ? 'a' : 'b', a: A, b: B, tag: '' };
  }

  // ---------- utilità ----------

  function seedOrder(n) {
    let o = [1];
    while (o.length < n) {
      const m = o.length * 2;
      o = o.flatMap(s => [s, m + 1 - s]);
    }
    return o;
  }

  // Distribuzione "a serpentina": le teste di serie finiscono in gironi diversi.
  function snake(ids, groups) {
    const out = Array.from({ length: groups }, () => []);
    ids.forEach((id, i) => {
      const row = Math.floor(i / groups), col = i % groups;
      out[row % 2 === 0 ? col : groups - 1 - col].push(id);
    });
    return out;
  }

  // Tutti contro tutti; con un numero dispari di squadre ogni turno una riposa (bye).
  function roundRobin(ids) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, out = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a !== null && b !== null) out.push({ a: r % 2 ? b : a, b: r % 2 ? a : b, round: r + 1 });
      }
      list.splice(1, 0, list.pop());
    }
    return out;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Risolve una partita: squadre note, bye automatici. Conta solo il risultato di una gara chiusa.
  function decide(t, key, a, b) {
    const m = { key, a, b, winner: null, loser: null, res: null, stats: null, bye: false };
    if (a === BYE || b === BYE) {
      if (a == null || b == null) return m;
      m.bye = true;
      m.winner = a === BYE ? b : a;
      m.loser = BYE;
      return m;
    }
    if (real(a) && real(b)) {
      const res = t.results[key];
      if (res && res.a === a && res.b === b && res.closed) {
        m.res = res;
        m.stats = matchStats(res, t.config);
        if (m.stats) {
          m.winner = m.stats.winner === 'a' ? a : b;
          m.loser = m.stats.winner === 'a' ? b : a;
        }
      }
    }
    return m;
  }

  function singleRounds(t, slots, nRounds, prefix) {
    const rounds = [];
    let cur = slots;
    for (let r = 0; r < nRounds; r++) {
      const round = [];
      for (let i = 0; i < cur.length / 2; i++) {
        const m = decide(t, `${prefix}${r}-${i}`, cur[2 * i], cur[2 * i + 1]);
        m.round = r;
        round.push(m);
      }
      rounds.push(round);
      cur = round.map(m => m.winner);
    }
    return rounds;
  }

  // ---------- controlli prima del sorteggio ----------

  function drawCheck(t, n) {
    const c = t.config;
    switch (t.formato) {
      case 'gironi_ko': {
        const P = Math.ceil(n / c.poolSize);
        if (n < 3) return T("Servono almeno 3 iscritti.");
        if (Math.floor(n / P) < 2) return T("Gironi troppo piccoli: aumenta le squadre per girone.");
        if (Math.floor(n / P) < c.qualify) return T("Qualificate per girone più numerose delle squadre del girone più piccolo.");
        if (c.qualify * P < 2) return T("Servono almeno 2 qualificate in totale.");
        return null;
      }
      case 'girone_unico': return n < 3 ? T("Servono almeno 3 iscritti.") : null;
      case 'doppia': return n < 4 ? T("Servono almeno 4 iscritti.") : null;
      case 'americana': return n < 4 ? T("Servono almeno 4 giocatori.") : null;
      case 'americana_tempo': {
        if (c.squadre === 'rotazione') return rotazioneCheck(t, n);
        const teams = c.squadre === 'sorteggio' ? Math.floor(n / 2) : n;
        if (c.squadre === 'sorteggio' && n % 2) return T("Con le squadre sorteggiate serve un numero pari di iscritti.");
        if (teams < 2) return T("Servono almeno 2 squadre.");
        return Number(c.maxPartite) >= 1 ? null : T("Indica il numero massimo di partite per squadra.");
      }
      case 'fantasma': {
        if (n < 4) return T("Servono almeno 4 giocatori.");
        if (Number(c.poolPlayers) < 4) return T("Servono almeno 4 giocatori per girone.");
        if (Number(c.finalisti) > n) return `${T("I finalisti ({0}) sono più degli iscritti ({1}).", [c.finalisti, n])}`;
        const P = Math.ceil(n / c.poolPlayers);
        if (Math.floor(n / P) < 4) return T("Gironi troppo piccoli: servono almeno 4 giocatori per girone.");
        return null;
      }
      default: return n < 2 ? T("Servono almeno 2 iscritti.") : null;
    }
  }

  // ---------- sorteggio ----------

  function buildPool(pi, teamIds, type) {
    const n = teamIds.length;
    if (type === 'fivb' && (n < 3 || n > 4)) type = 'rr';
    return {
      name: String.fromCharCode(65 + pi), type, teamIds,
      matches: type === 'rr' ? roundRobin(teamIds).map((m, k) => ({ key: `P${pi}-${k}`, a: m.a, b: m.b, round: m.round })) : []
    };
  }

  const canBeFivb = pool => pool.teamIds.length >= 3 && pool.teamIds.length <= 4;

  // ids = iscritti in ordine di testa di serie; sex = sesso di ogni iscritto (per le coppie miste);
  // levels = livello di gioco di ogni iscritto (per bilanciare le gare dell'americana a tempo a rotazione).
  function startDraw(t, ids, sex, levels) {
    const f = t.formato, c = t.config;
    t.seeds = ids.slice();
    t.sex = sex || {};
    t.levels = levels || {};
    t.pools = null; t.bracket = null; t.americana = null; t.fantasma = null; t.tempo = null; t.results = {}; t.closed = false;
    if (f === 'americana_tempo') { t.tempo = c.squadre === 'rotazione' ? generateRotazione(t, ids) : generateTempo(t, ids); return; }
    if (f === 'americana') { t.americana = { rounds: balanceCourts(generateRotation(t, ids, Number(c.turni) || 1, Number(c.campi) || 0, 'A').rounds, 'A') }; return; }
    if (f === 'fantasma') {
      const groups = snake(ids, Math.ceil(ids.length / c.poolPlayers));
      t.fantasma = {
        pools: groups.map((pids, pi) => Object.assign({ name: String.fromCharCode(65 + pi), ids: pids },
          generateRotation(t, pids, Number(c.poolTurni) || 1, 0, `F${pi}-`))),
        ko: []
      };
      return;
    }
    if (!hasPools(f)) { generateBracket(t); return; }
    const groups = f === 'girone_unico' ? [ids.slice()] : snake(ids, Math.ceil(ids.length / c.poolSize));
    t.pools = groups.map((teamIds, pi) => buildPool(pi, teamIds, f === 'girone_unico' ? 'rr' : c.poolType));
  }

  function clearKeys(t, prefixes) {
    Object.keys(t.results).forEach(k => { if (prefixes.some(p => k.startsWith(p))) delete t.results[k]; });
  }

  // Cambia la formula di un singolo girone (cancella i risultati di quel girone).
  function setPoolType(t, pi, type) {
    const p = t.pools[pi];
    clearKeys(t, [`P${pi}-`]);
    t.pools[pi] = Object.assign(buildPool(pi, p.teamIds, type), { name: p.name });
    resetBracket(t);
  }

  function resetDraw(t) {
    t.seeds = null; t.sex = null; t.pools = null; t.bracket = null; t.americana = null; t.fantasma = null; t.tempo = null; t.results = {}; t.closed = false;
  }

  function resetBracket(t) {
    if (!hasPools(t.formato)) return;
    t.bracket = null; t.closed = false;
    clearKeys(t, ['W', 'L', 'GF', '3rd']);
  }

  const seedOf = (t, id) => { const i = (t.seeds || []).indexOf(id); return i < 0 ? 1e9 : i + 1; };

  // ---------- gironi ----------

  function poolMatches(t, pi) {
    const pool = t.pools[pi];
    if (pool.type !== 'fivb') return pool.matches.map(m => Object.assign(decide(t, m.key, m.a, m.b), { round: m.round }));
    // FIVB: 1-4 e 2-3, poi vincenti e perdenti. Con 3 squadre la prima testa di serie ha il bye.
    const ids = pool.teamIds.concat([BYE, BYE, BYE, BYE]).slice(0, 4);
    const m1 = decide(t, `P${pi}-M1`, ids[0], ids[3]);
    const m2 = decide(t, `P${pi}-M2`, ids[1], ids[2]);
    const m3 = decide(t, `P${pi}-M3`, m1.winner, m2.winner);
    const m4 = decide(t, `P${pi}-M4`, m1.loser, m2.loser);
    [m1, m2, m3, m4].forEach((m, i) => { m.round = i < 2 ? 1 : 2; });
    m1.label = '1ª-4ª'; m2.label = '2ª-3ª'; m3.label = T("Vincenti"); m4.label = T("Perdenti");
    m3.from = [T("Vincente"), m1.key, m2.key]; m4.from = [T("Perdente"), m1.key, m2.key];
    return [m1, m2, m3, m4];
  }

  function statRows(ids, matches) {
    const rows = ids.map(id => Object.assign({ id, played: 0, w: 0, l: 0 }, emptyLine()));
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    matches.forEach(m => {
      if (!m.stats) return;
      [['a', m.a], ['b', m.b]].forEach(([side, id]) => {
        const r = by[id], s = m.stats[side];
        if (!r) return;
        r.played++; r.sw += s.sw; r.sl += s.sl; r.pw += s.pw; r.pl += s.pl;
        if (m.stats.winner === side) r.w++; else r.l++;
      });
    });
    return { rows, by };
  }

  // Classifica del girone: vittorie; a pari merito scontro diretto (2 squadre) o classifica avulsa (3+),
  // poi differenza set, differenza punti, punti fatti, testa di serie.
  function poolStandings(t, pi) {
    const pool = t.pools[pi];
    const matches = poolMatches(t, pi);
    const { rows, by } = statRows(pool.teamIds, matches);
    const seed = r => seedOf(t, r.id);
    const tail = (x, y) => (y.sw - y.sl) - (x.sw - x.sl) || (y.pw - y.pl) - (x.pw - x.pl) || y.pw - x.pw || seed(x) - seed(y);

    if (pool.type === 'fivb') {
      const [, , m3, m4] = matches;
      if (m3.winner && m4.winner) return [m3.winner, m3.loser, m4.winner, m4.loser].filter(real).map(id => by[id]);
      return rows.sort((x, y) => y.w - x.w || seed(x) - seed(y));
    }

    const sorted = rows.slice().sort((x, y) => y.w - x.w);
    const out = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j < sorted.length && sorted[j].w === sorted[i].w) j++;
      const g = sorted.slice(i, j);
      if (g.length === 2) {
        const m = matches.find(mm => mm.stats && [mm.a, mm.b].includes(g[0].id) && [mm.a, mm.b].includes(g[1].id));
        g.sort((x, y) => (m ? (m.winner === x.id ? -1 : 1) : 0) || tail(x, y));
      } else if (g.length > 2) {
        const ids = new Set(g.map(r => r.id));
        const mini = statRows([...ids], matches.filter(m => ids.has(m.a) && ids.has(m.b))).by;
        g.sort((x, y) => mini[y.id].w - mini[x.id].w || tail(mini[x.id], mini[y.id]) || tail(x, y));
      }
      out.push(...g);
      i = j;
    }
    return out;
  }

  function poolsComplete(t) {
    return !!t.pools && t.pools.every((_, pi) => poolMatches(t, pi).every(m => m.stats || m.bye));
  }

  // Qualificate: prima tutte le prime, poi le seconde...; a pari posizione si confrontano
  // gironi di dimensioni diverse con le medie per partita (vittorie, set, punti).
  function poolQualifiers(t) {
    const st = t.pools.map((_, i) => poolStandings(t, i));
    const avg = (r, k) => (r.played ? k(r) / r.played : 0);
    const q = [];
    for (let r = 0; r < t.config.qualify; r++) {
      const level = st.map(s => s[r]).filter(Boolean);
      level.sort((x, y) => avg(y, v => v.w) - avg(x, v => v.w) || avg(y, v => v.sw - v.sl) - avg(x, v => v.sw - v.sl)
        || avg(y, v => v.pw - v.pl) - avg(x, v => v.pw - v.pl) || seedOf(t, x.id) - seedOf(t, y.id));
      level.forEach(row => q.push(row.id));
    }
    return q;
  }

  function avoidSamePool(t, slots) {
    const poolOf = {};
    t.pools.forEach((p, pi) => p.teamIds.forEach(id => { poolOf[id] = pi; }));
    const clash = i => real(slots[2 * i]) && real(slots[2 * i + 1]) && poolOf[slots[2 * i]] === poolOf[slots[2 * i + 1]];
    const n = slots.length / 2;
    for (let i = 0; i < n; i++) {
      if (!clash(i)) continue;
      for (let j = n - 1; j >= 0; j--) {
        if (j === i || !real(slots[2 * j + 1])) continue;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
        if (!clash(i) && !clash(j)) break;
        [slots[2 * i + 1], slots[2 * j + 1]] = [slots[2 * j + 1], slots[2 * i + 1]];
      }
    }
  }

  // ---------- tabellone ----------

  function generateBracket(t) {
    const ids = hasPools(t.formato) ? poolQualifiers(t) : t.seeds;
    let size = 2;
    while (size < ids.length) size *= 2;
    if (t.formato === 'doppia' && size < 4) size = 4;
    const slots = seedOrder(size).map(s => (s <= ids.length ? ids[s - 1] : BYE));
    if (hasPools(t.formato)) avoidSamePool(t, slots);
    t.bracket = { size, slots };
  }

  function computeMain(t) {
    const br = t.bracket;
    if (!br) return null;
    const k = Math.round(Math.log2(br.size));
    if (t.formato !== 'doppia') {
      const rounds = singleRounds(t, br.slots, k, 'W');
      let third = null;
      if (t.config.thirdPlace && k >= 2) {
        const sf = rounds[k - 2];
        third = decide(t, '3rd', sf[0].loser, sf[1].loser);
      }
      const champ = rounds[k - 1][0].winner;
      return { type: 'single', rounds, third, champion: real(champ) ? champ : null };
    }
    const wb = singleRounds(t, br.slots, k, 'W');
    const lb = [];
    const pair = (list, r) => {
      const round = [];
      for (let i = 0; i < list.length / 2; i++) {
        const m = decide(t, `L${r}-${i}`, list[2 * i], list[2 * i + 1]);
        m.round = r; round.push(m);
      }
      return round;
    };
    lb.push(pair(wb[0].map(m => m.loser), 0));
    for (let r = 1; r < k; r++) {
      let drops = wb[r].map(m => m.loser);
      if (r % 2 === 1) drops = drops.slice().reverse();
      const prev = lb[lb.length - 1].map(m => m.winner);
      const idx = lb.length, round = [];
      prev.forEach((w, i) => {
        const m = decide(t, `L${idx}-${i}`, w, drops[i]);
        m.round = idx; round.push(m);
      });
      lb.push(round);
      if (r < k - 1) lb.push(pair(round.map(m => m.winner), lb.length));
    }
    const gf = decide(t, 'GF', wb[k - 1][0].winner, lb[lb.length - 1][0].winner);
    return { type: 'double', wb, lb, gf, champion: real(gf.winner) ? gf.winner : null };
  }

  function roundName(r, rounds) {
    const left = rounds - r;
    if (left === 1) return T("Finale");
    if (left === 2) return T("Semifinali");
    if (left === 3) return T("Quarti di finale");
    if (left === 4) return T("Ottavi di finale");
    return `${T("Turno {0}", [r + 1])}`;
  }

  // ---------- coppie a rotazione (americana e torneo fantasma) ----------
  // A ogni turno si formano nuove coppie cercando di non ripetere compagni e avversari.
  // Nei tornei misti si creano quante più coppie uomo+donna possibile.

  const pk = (x, y) => (x < y ? x + '|' + y : y + '|' + x);
  // Coppie sempre uomo + donna: tornei misti, oppure vincolo "misto" scelto per l'americana.
  const mixedOf = t => t.genere === 'misto' || (t.config && t.config.vincolo === 'misto');
  // Abbinamenti uomini/donne nelle formule a rotazione (americana, fantasma, americana a tempo).
  const VINCOLI = {
    misto: T("Sempre coppie miste (uomo + donna)"),
    equilibrato: T("Mai 2 uomini contro 2 donne (al massimo 2 uomini contro una coppia mista)"),
    libero: T("Nessun vincolo (anche 2 uomini contro una coppia mista o di sole donne)")
  };
  const isMale = (t, id) => (t.sex || {})[id] === 'M';

  // Coppie casuali; nei misti quante più coppie uomo+donna possibile (prima le miste, poi le altre).
  function makePairs(t, active) {
    let pairs = [];
    if (mixedOf(t)) {
      const M = shuffle(active.filter(id => isMale(t, id))), F = shuffle(active.filter(id => !isMale(t, id)));
      const mixed = [];
      while (M.length && F.length) mixed.push([M.pop(), F.pop()]);
      const left = M.length ? M : F, same = [];
      while (left.length >= 2) same.push([left.pop(), left.pop()]);
      pairs = shuffle(mixed).concat(shuffle(same));
    } else {
      const p = shuffle(active.slice());
      for (let i = 0; i + 1 < p.length; i += 2) pairs.push([p[i], p[i + 1]]);
    }
    return pairs;
  }

  // Una possibile composizione del turno: [[a1, a2], [b1, b2]] per ogni gara.
  function candidateRound(t, active) {
    const pairs = makePairs(t, active);
    const out = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) out.push([pairs[i], pairs[i + 1]]);
    return out;
  }

  // Equilibrio uomini/donne nelle gare (tornei open e misti): mai 2 uomini contro 2 donne;
  // al massimo 2 uomini contro un uomo e una donna, e quando si può gare alla pari.
  function sexCost(t, a, b) {
    if (t.genere === 'M' || t.genere === 'F' || (t.config && t.config.vincolo === 'libero')) return 0;
    const sx = t.sex || {}, all = a.concat(b);
    if (all.some(id => sx[id] !== 'M' && sx[id] !== 'F')) return 0;
    const men = side => side.filter(id => sx[id] === 'M').length;
    const d = Math.abs(men(a) - men(b));
    return d >= 2 ? 1000 : d * 2;
  }

  function drawRound(t, active, hist) {
    let best = null, bestScore = Infinity;
    for (let tr = 0; tr < 400 && bestScore > 0; tr++) {
      const ms = candidateRound(t, active);
      let s = 0;
      ms.forEach(([a, b]) => {
        s += 10 * ((hist.partner[pk(a[0], a[1])] || 0) + (hist.partner[pk(b[0], b[1])] || 0)) + sexCost(t, a, b);
        a.forEach(x => b.forEach(y => { s += hist.opp[pk(x, y)] || 0; }));
      });
      if (s < bestScore) { bestScore = s; best = ms; }
    }
    best.forEach(([a, b]) => {
      hist.partner[pk(a[0], a[1])] = (hist.partner[pk(a[0], a[1])] || 0) + 1;
      hist.partner[pk(b[0], b[1])] = (hist.partner[pk(b[0], b[1])] || 0) + 1;
      a.forEach(x => b.forEach(y => { hist.opp[pk(x, y)] = (hist.opp[pk(x, y)] || 0) + 1; }));
    });
    return best;
  }

  // Turni a rotazione: chi è in più (o se mancano campi) riposa, a turno.
  // Nei misti, a parità di riposi, riposa prima il sesso più numeroso.
  function generateRotation(t, ids, turni, campi, prefix) {
    const n = ids.length;
    const perRound = Math.min(Math.floor(n / 4), campi > 0 ? campi : Infinity);
    const hist = { partner: {}, opp: {} }, rested = Object.fromEntries(ids.map(id => [id, 0]));
    const males = ids.filter(id => isMale(t, id)).length;
    const surplusMale = males * 2 > n;
    const rounds = [];
    for (let r = 0; r < turni; r++) {
      const extra = id => (mixedOf(t) && isMale(t, id) !== surplusMale ? 1 : 0);
      const order = shuffle(ids.slice()).sort((x, y) => rested[x] - rested[y] || extra(x) - extra(y));
      const rest = order.slice(0, n - perRound * 4);
      rest.forEach(id => { rested[id]++; });
      const best = drawRound(t, ids.filter(id => !rest.includes(id)), hist);
      rounds.push({ matches: best.map(([a, b], i) => ({ key: `${prefix}${r}-${i}`, a, b })), rest });
    }
    return { rounds };
  }

  // Gare tra coppie di giocatori, con risultato e statistiche.
  function pairMatches(t, list, extra) {
    return list.map(m => {
      const res = t.results[m.key];
      const ok = res && res.closed;
      return Object.assign({}, m, extra || {}, { res: ok ? res : null, stats: ok ? matchStats(res, t.config) : null });
    });
  }

  function roundsMatches(t, rounds) {
    const out = [];
    rounds.forEach((rd, r) => out.push(...pairMatches(t, rd.matches, { round: r })));
    return out;
  }

  const americanaMatches = t => (t.americana ? roundsMatches(t, t.americana.rounds) : []);
  const americanaComplete = t => !!t.americana && americanaMatches(t).every(m => m.stats);

  function playerRows(ids, matches) {
    const rows = ids.map(id => ({ id, played: 0, w: 0, l: 0, sw: 0, sl: 0, pw: 0, pl: 0 }));
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    matches.forEach(m => {
      if (!m.stats) return;
      ['a', 'b'].forEach(side => m[side].forEach(id => {
        const r = by[id], s = m.stats[side];
        if (!r) return;
        r.played++; r.pw += s.pw; r.pl += s.pl; r.sw += s.sw; r.sl += s.sl;
        if (m.stats.winner === side) r.w++; else r.l++;
      }));
    });
    return rows;
  }

  // Classifica individuale dell'americana: per punti fatti oppure per set vinti (scelta nella scheda del torneo,
  // che decide anche il vincitore finale). sortBy permette di vederla ordinata nell'altro modo.
  // "vittorie" (vecchi tornei) vale come set vinti.
  const AMERICANA_CRITERI = { punti: T("Punti fatti"), set: T("Set vinti") };
  const byPunti = (x, y) => y.pw - x.pw || y.sw - x.sw || (y.pw - y.pl) - (x.pw - x.pl);
  const bySet = (x, y) => y.sw - x.sw || (y.sw - y.sl) - (x.sw - x.sl) || y.pw - x.pw || (y.pw - y.pl) - (x.pw - x.pl);
  const americanaCrit = t => (t.config.criterio === 'punti' ? 'punti' : 'set');
  function americanaStandings(t, sortBy) {
    const rows = playerRows(t.seeds || [], americanaMatches(t));
    const cmp = (sortBy || americanaCrit(t)) === 'punti' ? byPunti : bySet;
    return rows.sort((x, y) => cmp(x, y) || seedOf(t, x.id) - seedOf(t, y.id));
  }

  // ---------- torneo fantasma ----------
  // Gironi individuali con compagno sorteggiato a ogni gara; poi fase finale: a ogni turno nuovo sorteggio,
  // la coppia vincente passa e quella perdente esce. Con 4 giocatori rimasti si gioca la finale secca,
  // con coppie sorteggiate o scelte dall'organizzatore.

  const avg = (r, k) => (r.played ? k(r) / r.played : 0);
  // Medie per partita: nei gironi con riposi non tutti giocano lo stesso numero di gare.
  const cmpAvg = t => (x, y) => avg(y, v => v.w) - avg(x, v => v.w) || avg(y, v => v.pw - v.pl) - avg(x, v => v.pw - v.pl)
    || avg(y, v => v.pw) - avg(x, v => v.pw) || seedOf(t, x.id) - seedOf(t, y.id);

  const fantasmaPoolMatches = (t, pi) => roundsMatches(t, t.fantasma.pools[pi].rounds);

  function fantasmaPoolStandings(t, pi) {
    return playerRows(t.fantasma.pools[pi].ids, fantasmaPoolMatches(t, pi)).sort(cmpAvg(t));
  }

  const fantasmaPoolsComplete = t => !!t.fantasma && t.fantasma.pools.every((_, pi) => fantasmaPoolMatches(t, pi).every(m => m.stats));

  // Finalisti: prima tutti i primi dei gironi, poi i secondi... confrontati con le medie per partita.
  function fantasmaQualifiers(t) {
    const st = t.fantasma.pools.map((_, pi) => fantasmaPoolStandings(t, pi));
    const max = Math.max(...st.map(s => s.length)), out = [];
    for (let r = 0; r < max; r++) out.push(...st.map(s => s[r]).filter(Boolean).sort(cmpAvg(t)).map(x => x.id));
    return out.slice(0, Number(t.config.finalisti));
  }

  const fantasmaKo = t => (t.fantasma ? t.fantasma.ko.map((rd, r) => Object.assign({}, rd, { matches: pairMatches(t, rd.matches, { round: r, final: !!rd.final }) })) : []);

  const roundDone = rd => rd.matches.every(m => m.stats);
  const winnersOf = rd => rd.matches.flatMap(m => m[m.stats.winner]);

  // Finale secca tra i 4 giocatori rimasti: pairs = [[a1, a2], [b1, b2]] scelte a mano, altrimenti sorteggio.
  function finalRound(t, ids, pairs) {
    const [a, b] = pairs || drawRound(t, ids, { partner: {}, opp: {} })[0];
    return { final: true, ids, matches: [{ key: 'KF-0', a, b }] };
  }

  // Stato della fase finale: cosa può fare l'organizzatore adesso.
  function fantasmaStage(t) {
    if (!t.fantasma) return null;
    const ko = fantasmaKo(t), last = ko[ko.length - 1];
    if (!ko.length) return fantasmaPoolsComplete(t) ? 'start' : 'pools';
    if (last.final) return roundDone(last) ? 'done' : 'final';
    return roundDone(last) ? 'next' : 'ko';
  }

  // Giocatori che disputeranno il prossimo turno della fase finale.
  function fantasmaNextIds(t) {
    const st = fantasmaStage(t);
    if (st === 'start') return fantasmaQualifiers(t);
    if (st === 'next') { const ko = fantasmaKo(t); return winnersOf(ko[ko.length - 1]); }
    return null;
  }

  // Sorteggia il turno successivo della fase finale; per la finale le coppie possono essere scelte a mano.
  function fantasmaAdvance(t, pairs) {
    const ids = fantasmaNextIds(t);
    if (!ids) return;
    const r = t.fantasma.ko.length;
    if (ids.length <= 4) { t.fantasma.ko.push(finalRound(t, ids, pairs)); return; }
    const best = drawRound(t, ids, { partner: {}, opp: {} });
    t.fantasma.ko.push({ ids, matches: best.map(([a, b], i) => ({ key: `K${r}-${i}`, a, b })) });
  }

  function fantasmaUndo(t) {
    const rd = t.fantasma.ko.pop();
    if (rd) rd.matches.forEach(m => { delete t.results[m.key]; });
    t.closed = false;
  }

  // Cambia le coppie della finale già sorteggiata (solo prima del risultato).
  function fantasmaSetFinal(t, pairs) {
    const last = t.fantasma.ko[t.fantasma.ko.length - 1];
    if (!last || !last.final) return;
    delete t.results['KF-0'];
    Object.assign(last, finalRound(t, last.ids, pairs));
    t.closed = false;
  }

  // ---------- americana a tempo ----------
  // Squadre fisse (coppie iscritte o sorteggiate al via). Gare a tempo: vince chi fa più punti, pareggio possibile.
  // Calendario a turni, senza ripetere gli avversari finché possibile, fino al numero massimo di partite per squadra.

  function generateTempo(t, ids) {
    let teams;
    if (t.config.squadre === 'sorteggio') {
      const pairs = makePairs(t, ids);
      teams = pairs.map((players, i) => ({ id: 'S' + i, players }));
    } else {
      teams = ids.map(id => ({ id, players: null }));
    }
    const max = Math.max(1, Number(t.config.maxPartite) || 1);
    const tids = teams.map(x => x.id);
    const played = Object.fromEntries(tids.map(id => [id, 0]));
    const base = roundRobin(tids);
    const nRounds = Math.max(...base.map(m => m.round));
    const rounds = [];
    for (let cycle = 0; rounds.length < 200; cycle++) {
      let added = false;
      for (let r = 1; r <= nRounds; r++) {
        const ms = base.filter(m => m.round === r && played[m.a] < max && played[m.b] < max);
        if (!ms.length) continue;
        ms.forEach(m => { played[m.a]++; played[m.b]++; });
        const k = rounds.length;
        rounds.push({ matches: ms.map((m, i) => ({ key: `T${k}-${i}`, a: cycle % 2 ? m.b : m.a, b: cycle % 2 ? m.a : m.b })),
          rest: tids.filter(id => !ms.some(m => m.a === id || m.b === id)) });
        added = true;
      }
      if (!added || tids.every(id => played[id] >= max)) break;
    }
    return { teams, rounds };
  }

  // ---------- americana a tempo a rotazione ----------
  // Iscrizione individuale. A ogni turno ognuno gioca con un compagno diverso (nei misti uomo + donna),
  // le gare sono distribuite sui campi disponibili e chi è in più riposa, a rotazione.
  // Il livello dei giocatori serve a bilanciare le gare.

  function rotazioneShape(t, n) {
    const sx = t.sex || {}, mixed = mixedOf(t);
    const M = mixed ? (t.seeds || []).filter(id => sx[id] === 'M').length : 0;
    const campi = Number(t.config.campi) || 0;
    let perRound = mixed ? Math.min(Math.floor(M / 2), Math.floor((n - M) / 2)) : Math.floor(n / 4);
    if (campi > 0) perRound = Math.min(perRound, campi);
    return { mixed, M, F: n - M, perRound };
  }

  function rotazioneCheck(t, n) {
    const c = t.config;
    if (!(Number(c.turni) >= 1)) return T("Indica il numero dei turni.");
    if (!(Number(c.campi) >= 1)) return T("Indica il numero dei campi disponibili.");
    return n < 4 ? T("Servono almeno 4 giocatori.") : null;
  }

  // Abbinamento dei compagni del turno senza ripetere chi ha già giocato insieme (se possibile).
  // left/right: giocatori da accoppiare (nei misti uomini e donne; altrimenti right = null).
  function partnerRound(left, right, partner, maxRepeat) {
    const pool = right ? null : left.slice();
    const out = [], used = new Set();
    const A = right ? shuffle(left.slice()) : null, B = right ? shuffle(right.slice()) : null;
    let steps = 0;
    const ok = (x, y) => (partner[pk(x, y)] || 0) <= maxRepeat;
    function dfsMixed(i) {
      if (i === A.length) return true;
      for (const y of B) {
        if (used.has(y) || !ok(A[i], y)) continue;
        if (++steps > 5000) return false;
        used.add(y); out.push([A[i], y]);
        if (dfsMixed(i + 1)) return true;
        used.delete(y); out.pop();
      }
      return false;
    }
    function dfsSame() {
      const free = pool.filter(x => !used.has(x));
      if (!free.length) return true;
      const x = free[0];
      for (const y of shuffle(free.slice(1))) {
        if (!ok(x, y)) continue;
        if (++steps > 5000) return false;
        used.add(x); used.add(y); out.push([x, y]);
        if (dfsSame()) return true;
        used.delete(x); used.delete(y); out.pop();
      }
      return false;
    }
    if (!right) shuffle(pool);
    return (right ? dfsMixed(0) : dfsSame()) ? out : null;
  }

  // Chi riposa: chi ha riposato meno finora, a sorte tra i pari.
  function pickRest(ids, k, rested) {
    return shuffle(ids.slice()).sort((x, y) => rested[x] - rested[y]).slice(0, k);
  }

  // Abbina le coppie del turno in gare: avversari nuovi e livelli equilibrati.
  function matchTeams(t, teams, opp, lv) {
    const str = team => lv(team[0]) + lv(team[1]);
    let best = null, bestScore = Infinity;
    for (let tr = 0; tr < 150 && bestScore > 0; tr++) {
      const p = shuffle(teams.slice()), ms = [];
      let s = 0;
      for (let i = 0; i < p.length; i += 2) {
        ms.push([p[i], p[i + 1]]);
        p[i].forEach(x => p[i + 1].forEach(y => { s += 3 * (opp[pk(x, y)] || 0); }));
        s += 2 * Math.abs(str(p[i]) - str(p[i + 1])) + sexCost(t, p[i], p[i + 1]);
      }
      if (s < bestScore) { bestScore = s; best = ms; }
    }
    return { matches: best, score: bestScore };
  }

  function rotazioneAttempt(t, ids, turni, shape, lv) {
    const sx = t.sex || {};
    const partner = {}, opp = {}, rested = Object.fromEntries(ids.map(id => [id, 0]));
    const men = ids.filter(id => sx[id] === 'M'), women = ids.filter(id => sx[id] !== 'M');
    const rounds = [];
    let score = 0;
    for (let r = 0; r < turni; r++) {
      let rest, teams = null;
      for (let tr = 0; tr < 30 && !teams; tr++) {
        if (shape.mixed) {
          rest = pickRest(men, men.length - 2 * shape.perRound, rested).concat(pickRest(women, women.length - 2 * shape.perRound, rested));
        } else {
          rest = pickRest(ids, ids.length - 4 * shape.perRound, rested);
        }
        const act = ids.filter(id => !rest.includes(id));
        teams = shape.mixed ? partnerRound(act.filter(id => sx[id] === 'M'), act.filter(id => sx[id] !== 'M'), partner, 0)
          : partnerRound(act, null, partner, 0);
      }
      if (!teams) {
        // Nessun abbinamento con compagni tutti nuovi: si accetta il minimo di ripetizioni.
        const act = ids.filter(id => !rest.includes(id));
        for (let rep = 1; !teams; rep++) {
          teams = shape.mixed ? partnerRound(act.filter(id => sx[id] === 'M'), act.filter(id => sx[id] !== 'M'), partner, rep)
            : partnerRound(act, null, partner, rep);
          score += 1000;
        }
      }
      rest.forEach(id => { rested[id]++; });
      teams.forEach(([x, y]) => { partner[pk(x, y)] = (partner[pk(x, y)] || 0) + 1; });
      const mt = matchTeams(t, teams, opp, lv);
      score += mt.score;
      mt.matches.forEach(([a, b]) => a.forEach(x => b.forEach(y => { opp[pk(x, y)] = (opp[pk(x, y)] || 0) + 1; })));
      rounds.push({ matches: mt.matches.map(([a, b], i) => ({ key: `R${r}-${i}`, a, b })), rest });
    }
    return { rounds, score };
  }

  // Calendario completo: si provano molte combinazioni e si tiene la migliore.
  // Campi a rotazione: l'ordine delle gare di ogni turno (Campo 1, 2, 3...) si sceglie in modo che ognuno
  // giochi su tutti i campi, ognuno almeno una volta quando le partite lo permettono. Coppie e avversari non cambiano.
  function permutations(n) {
    if (n <= 1) return [[0]];
    const out = [];
    permutations(n - 1).forEach(p => { for (let i = 0; i <= p.length; i++) out.push(p.slice(0, i).concat([n - 1], p.slice(i))); });
    return out;
  }
  function balanceCourts(rounds, prefix) {
    const k = Math.max(0, ...rounds.map(rd => rd.matches.length));
    if (k < 2) return rounds;
    const perms = k <= 5 ? permutations(k) : null;
    let best = null, bestMiss = Infinity, bestSpread = Infinity;
    for (let tr = 0; tr < 300 && bestMiss > 0; tr++) {
      const cnt = {};
      const c = (id, i) => ((cnt[id] || (cnt[id] = Array(k).fill(0)))[i]);
      const orders = rounds.map(rd => {
        const n = rd.matches.length;
        const cand = n === k && perms ? perms : Array.from({ length: 60 }, () => shuffle([...Array(n).keys()]));
        let pick = null, ps = Infinity;
        shuffle(cand.slice()).forEach(order => {
          // costo: chi è già stato su quel campo (al quadrato, per distribuire) + un po' di caso tra i pari
          let sc = 0;
          order.forEach((mi, court) => { const m = rd.matches[mi]; m.a.concat(m.b).forEach(id => { const v = c(id, court); sc += v * v; }); });
          if (sc < ps) { ps = sc; pick = order; }
        });
        pick.forEach((mi, court) => { const m = rd.matches[mi]; m.a.concat(m.b).forEach(id => { c(id, court); cnt[id][court]++; }); });
        return pick;
      });
      // chi gioca almeno k partite deve essere passato da tutti i campi
      let miss = 0, spread = 0;
      Object.values(cnt).forEach(a => { const g = a.reduce((x, y) => x + y, 0); if (g >= k) miss += a.filter(v => !v).length; spread += Math.max(...a) - Math.min(...a); });
      if (miss < bestMiss || (miss === bestMiss && spread < bestSpread)) { bestMiss = miss; bestSpread = spread; best = orders; }
    }
    // Ritocco finale: si provano altri ordini turno per turno e si tiene quello che lascia meno campi mancanti.
    const evalOrders = orders => {
      const cnt = {};
      rounds.forEach((rd, r) => orders[r].forEach((mi, court) => { const m = rd.matches[mi]; m.a.concat(m.b).forEach(id => { (cnt[id] || (cnt[id] = Array(k).fill(0)))[court]++; }); }));
      let miss = 0, spread = 0;
      Object.values(cnt).forEach(x => { const g = x.reduce((u, v) => u + v, 0); if (g >= k) miss += x.filter(v => !v).length; spread += Math.max(...x) - Math.min(...x); });
      return miss * 1000 + spread;
    };
    let cur = evalOrders(best);
    for (let it = 0; it < 4000 && cur >= 1000; it++) {
      const r = Math.floor(Math.random() * rounds.length), n = rounds[r].matches.length;
      if (n < 2) continue;
      const i = Math.floor(Math.random() * n), j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
      const o = best[r].slice(); [o[i], o[j]] = [o[j], o[i]];
      const next = best.slice(); next[r] = o;
      const v = evalOrders(next);
      if (v <= cur) { cur = v; best = next; }
    }
    return rounds.map((rd, r) => Object.assign({}, rd, { matches: best[r].map((mi, i) => Object.assign({}, rd.matches[mi], { key: `${prefix}${r}-${i}` })) }));
  }

  function generateRotazione(t, ids) {
    const shape = rotazioneShape(t, ids.length);
    const turni = Math.max(1, Number(t.config.turni) || 1);
    const lvMap = t.levels || {};
    const lv = id => Number(lvMap[id]) || 3;
    let best = null;
    const until = Date.now() + 1500;
    for (let tr = 0; tr < 400 && (!best || best.score > 0) && (tr < 20 || Date.now() < until); tr++) {
      const a = rotazioneAttempt(t, ids, turni, shape, lv);
      if (!best || a.score < best.score) best = a;
    }
    return { mode: 'rotazione', teams: [], players: ids.slice(), rounds: balanceCourts(best.rounds, 'R') };
  }

  // Classifica individuale: solo punti fatti. A pari punti stessa posizione.
  // Classifica individuale: punti fatti oppure partite vinte (scelta nella scheda, decide il vincitore finale);
  // sortBy la mostra ordinata nell'altro modo. A parità piena stessa posizione.
  const ROT_CRITERI = { punti: T("Punti fatti"), vittorie: T("Partite vinte") };
  const rotCrit = t => (t.config.criterioRot === 'vittorie' ? 'vittorie' : 'punti');
  function rotazioneStandings(t, sortBy) {
    const rows = (t.tempo.players || []).map(id => ({ id, played: 0, w: 0, d: 0, l: 0, pf: 0 }));
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    tempoMatches(t).forEach(m => {
      if (!m.stats) return;
      ['a', 'b'].forEach(side => m[side].forEach(id => {
        const r = by[id];
        if (!r) return;
        r.played++; r.pf += m.stats[side].pf;
        if (m.stats.draw) r.d++; else if (m.stats.winner === side) r.w++; else r.l++;
      }));
    });
    const vitt = (sortBy || rotCrit(t)) === 'vittorie';
    const key = (x, y) => (vitt ? y.w - x.w || y.d - x.d || y.pf - x.pf : y.pf - x.pf || y.w - x.w);
    rows.sort((x, y) => key(x, y) || seedOf(t, x.id) - seedOf(t, y.id));
    rows.forEach((r, i) => { r.pos = i && !key(rows[i - 1], r) ? rows[i - 1].pos : i + 1; });
    return rows;
  }

  function tempoStats(res) {
    if (!res || !res.closed || res.pa == null || res.pb == null) return null;
    return { winner: res.pa > res.pb ? 'a' : res.pb > res.pa ? 'b' : null, draw: res.pa === res.pb, a: { pf: res.pa, ps: res.pb }, b: { pf: res.pb, ps: res.pa } };
  }

  function tempoMatches(t) {
    if (!t.tempo) return [];
    const out = [];
    t.tempo.rounds.forEach((rd, r) => rd.matches.forEach(m => {
      const res = t.results[m.key];
      const stats = tempoStats(res);
      out.push(Object.assign({}, m, { round: r, res: stats ? res : null, stats }));
    }));
    return out;
  }

  const tempoComplete = t => !!t.tempo && tempoMatches(t).every(m => m.stats);
  const quoziente = r => (r.ps === 0 ? (r.pf > 0 ? Infinity : 0) : r.pf / r.ps);

  function tempoStandings(t) {
    const rows = t.tempo.teams.map(x => ({ id: x.id, played: 0, w: 0, d: 0, l: 0, pf: 0, ps: 0 }));
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    tempoMatches(t).forEach(m => {
      if (!m.stats) return;
      ['a', 'b'].forEach(side => {
        const r = by[m[side]], s = m.stats[side];
        r.played++; r.pf += s.pf; r.ps += s.ps;
        if (m.stats.draw) r.d++; else if (m.stats.winner === side) r.w++; else r.l++;
      });
    });
    const q = (x, y) => (quoziente(y) === quoziente(x) ? 0 : quoziente(y) > quoziente(x) ? 1 : -1);
    const byQ = t.config.criterioTempo !== 'punti';
    return rows.sort((x, y) => (byQ ? q(x, y) || y.pf - x.pf : y.pf - x.pf || q(x, y))
      || y.w - x.w || seedOf(t, x.id) - seedOf(t, y.id));
  }

  // ---------- piazzamenti ----------

  function placements(t) {
    const pl = {};
    let better;
    const addLosers = rounds => {
      for (let r = rounds.length - 1; r >= 0; r--) {
        const losers = rounds[r].map(m => m.loser).filter(real);
        losers.forEach(id => { pl[id] = better + 1; });
        better += losers.length;
      }
    };
    if (!t.seeds) return null;
    if (t.formato === 'americana_tempo') {
      // Il torneo finisce quando si sono giocate tutte le gare, oppure quando l'organizzatore lo interrompe.
      if (!tempoComplete(t) && !t.closed) return null;
      if (t.tempo.mode === 'rotazione') { rotazioneStandings(t).forEach(r => { pl[r.id] = r.pos; }); return pl; }
      tempoStandings(t).forEach((r, i) => { pl[r.id] = i + 1; });
      return pl;
    }
    if (t.formato === 'fantasma') {
      if (fantasmaStage(t) !== 'done') return null;
      const ko = fantasmaKo(t);
      // Posizioni contate per coppie, come in un tabellone: finale 1° e 2°, poi le coppie eliminate
      // in ciascun turno a pari merito; i giocatori non qualificati seguono, livello per livello dei gironi.
      const fm = ko[ko.length - 1].matches[0], w = fm.stats.winner;
      fm[w].forEach(id => { pl[id] = 1; });
      fm[w === 'a' ? 'b' : 'a'].forEach(id => { pl[id] = 2; });
      better = 2;
      for (let r = ko.length - 2; r >= 0; r--) {
        ko[r].matches.forEach(m => m[m.stats.winner === 'a' ? 'b' : 'a'].forEach(id => { pl[id] = better + 1; }));
        better += ko[r].matches.length;
      }
      const st = t.fantasma.pools.map((_, pi) => fantasmaPoolStandings(t, pi));
      const max = Math.max(...st.map(s => s.length));
      for (let r = 0; r < max; r++) {
        const ids = st.map(s => s[r] && s[r].id).filter(id => id && pl[id] == null);
        ids.forEach(id => { pl[id] = better + 1; });
        better += Math.ceil(ids.length / 2);
      }
      return pl;
    }
    if (t.formato === 'americana') {
      if (!americanaComplete(t)) return null;
      americanaStandings(t).forEach((r, i) => { pl[r.id] = i + 1; });
      return pl;
    }
    if (t.formato === 'girone_unico') {
      if (!poolsComplete(t)) return null;
      poolStandings(t, 0).forEach((r, i) => { pl[r.id] = i + 1; });
      return pl;
    }
    const cm = computeMain(t);
    if (!cm || !cm.champion) return null;
    pl[cm.champion] = 1;
    if (cm.type === 'single') {
      if (cm.third && !cm.third.winner) return null;
      better = 1;
      addLosers(cm.rounds);
      if (cm.third && real(cm.third.winner)) {
        pl[cm.third.winner] = 3;
        if (real(cm.third.loser)) pl[cm.third.loser] = 4;
      }
    } else {
      pl[cm.gf.loser] = 2;
      better = 2;
      addLosers(cm.lb);
    }
    if (hasPools(t.formato)) {
      better = Object.keys(pl).length;
      const st = t.pools.map((_, i) => poolStandings(t, i));
      const maxLen = Math.max(...st.map(s => s.length));
      for (let r = t.config.qualify; r < maxLen; r++) {
        const ids = st.map(s => s[r] && s[r].id).filter(Boolean);
        ids.forEach(id => { pl[id] = better + 1; });
        better += ids.length;
      }
    }
    return pl;
  }

  function status(t) {
    if (t.closed) return 'concluso';
    if (t.seeds) return T("in corso");
    return t.iscrizioniAperte ? T("iscrizioni aperte") : T("in preparazione");
  }

  // ---------- punti e ranking ----------

  // Tabella punti: ogni riga vale dalla sua posizione fino alla riga successiva (es. 5 → 40 vale per 5°–8°).
  function tablePoints(place, rows) {
    let pts = 0;
    (rows || []).slice().sort((x, y) => x[0] - y[0]).forEach(([p, v]) => { if (place >= p) pts = v; });
    return pts;
  }

  // Tabella punti del torneo: quella di una tipologia, una personalizzata, oppure nessuna
  // (torneo non valido per la classifica sociale).
  function pointsRows(state, t) {
    if (t.categoriaId === 'custom') return t.puntiRows || [];
    const cat = state.categories.find(c => c.id === t.categoriaId);
    return cat ? cat.rows : null;
  }

  const givesPoints = (state, t) => !!pointsRows(state, t);

  // Punti di squadra (coppia, o giocatore nel singolo) per un piazzamento: tabella × coefficiente.
  function entryPoints(state, t, place) {
    return round2(tablePoints(place, pointsRows(state, t)) * (Number(t.coefficiente) || 0));
  }

  // I punti in tabella sono punti di coppia: nel doppio (anche americana e fantasma) ogni giocatore ne prende metà.
  const halves = t => t.disciplina === 'doppio' || isIndividual(t.formato) || t.formato === 'americana_tempo';
  const playerPoints = (state, t, place) => round2(entryPoints(state, t, place) / (halves(t) ? 2 : 1));

  const entryPlayers = e => [e.p1, e.p2].filter(Boolean);

  // Piazzamento di ogni giocatore del torneo: uid -> posizione (anche con squadre sorteggiate).
  function playerPlaces(t) {
    const pl = placements(t);
    if (!pl) return null;
    const out = {};
    const userOf = eid => { const e = t.entries.find(x => x.id === eid); return e && e.p1; };
    if (t.tempo && t.config.squadre === 'sorteggio') {
      t.tempo.teams.forEach(team => { if (pl[team.id] != null) team.players.forEach(eid => { const u = userOf(eid); if (u) out[u] = pl[team.id]; }); });
    } else {
      t.entries.forEach(e => { if (pl[e.id] != null) entryPlayers(e).forEach(uid => { out[uid] = pl[e.id]; }); });
    }
    return out;
  }

  // Categorie del ranking interno. Ogni torneo appartiene a una sola categoria (disciplina + genere);
  // le classifiche generali (maschile/femminile) sommano tutti i tornei, Open compresi.
  const RANK_CATS = {
    sfide: T("Sfide"),
    generale_m: T("Generale maschile"), generale_f: T("Generale femminile"),
    sm: T("Singolare maschile"), sf: T("Singolare femminile"),
    dm: T("Doppio maschile"), df: T("Doppio femminile"), dx: T("Doppio misto"), open: T("Open")
  };

  // Tabella punti predefinita dei tornei nati dalle sfide (punti di coppia: ogni giocatore ne prende metà).
  const SFIDE_PUNTI = [[1, 100], [2, 80], [3, 65], [4, 55], [5, 45], [6, 40], [7, 35], [8, 30], [9, 25], [10, 20], [11, 15], [13, 10], [17, 5]];

  function rankCat(t) {
    if (t.sfida) return 'sfide';
    if (t.genere === 'open') return 'open';
    const doppio = t.disciplina === 'doppio' || isIndividual(t.formato) || t.formato === 'americana_tempo';
    if (!doppio) return t.genere === 'M' ? 'sm' : t.genere === 'F' ? 'sf' : 'open';
    return t.genere === 'M' ? 'dm' : t.genere === 'F' ? 'df' : 'dx';
  }

  // Classifica sociale per giocatore (solo tornei con punti in palio).
  // filter.cat: una chiave di RANK_CATS (vuota = tutti i tornei); filter.categoriaId: tabella punti.
  function ranking(state, filter) {
    const rows = {};
    const cat = filter.cat || '';
    const general = cat.startsWith('generale_');
    // Leghe: i tornei di una lega contano solo nella classifica della lega (filter.lega; kind: tornei / challenge / generale).
    const inLega = t => (filter.kind === 'tornei' ? !t.sfida : filter.kind === 'challenge' ? !!t.sfida : true);
    state.tournaments
      .filter(t => t.closed && givesPoints(state, t) && (!filter.categoriaId || t.categoriaId === filter.categoriaId)
        && (filter.lega ? t.lega === filter.lega && inLega(t)
          : !t.lega && (cat === 'sfide' ? !!t.sfida : !cat || (!t.sfida && (general || rankCat(t) === cat)))))
      .forEach(t => {
        const pp = playerPlaces(t);
        if (!pp) return;
        Object.entries(pp).forEach(([uid, place]) => {
          const pts = playerPoints(state, t, place);
          const r = rows[uid] || (rows[uid] = { id: uid, total: 0, events: 0, best: null });
          r.total = round2(r.total + pts); r.events++;
          r.best = r.best == null ? place : Math.min(r.best, place);
        });
      });
    let list = Object.values(rows);
    const sesso = filter.sesso || (cat === 'generale_m' ? 'M' : cat === 'generale_f' ? 'F' : '');
    if (sesso) list = list.filter(u => { const x = state.users.find(y => y.id === u.id); return x && x.sesso === sesso; });
    return list.sort((x, y) => y.total - x.total || (x.best || 999) - (y.best || 999));
  }

  // Punti di ranking attuali per giocatore (per ordinare le teste di serie).
  function rankMap(state, t) {
    const out = {};
    const cat = rankCat(t);
    ranking(state, { cat: cat === 'open' ? '' : cat }).forEach(r => { out[r.id] = r.total; });
    return out;
  }

  // Riepilogo del giocatore: posizione e punti in ogni classifica in cui compare.
  function playerSummary(state, uid) {
    const out = {};
    Object.keys(RANK_CATS).forEach(cat => {
      const list = ranking(state, { cat });
      const i = list.findIndex(r => r.id === uid);
      if (i >= 0) out[cat] = { pos: i + 1, of: list.length, total: list[i].total, events: list[i].events };
    });
    return out;
  }

  // Medagliere (podi) e numero di tornei conclusi giocati.
  function medals(state, uid) {
    const m = { oro: 0, argento: 0, bronzo: 0, tornei: 0 };
    state.tournaments.filter(t => t.closed).forEach(t => {
      const pp = playerPlaces(t);
      if (!pp || pp[uid] == null) return;
      m.tornei++;
      if (pp[uid] === 1) m.oro++; else if (pp[uid] === 2) m.argento++; else if (pp[uid] === 3) m.bronzo++;
    });
    return m;
  }

  function playerHistory(state, uid) {
    const out = [];
    state.tournaments.filter(t => t.closed).forEach(t => {
      const pp = playerPlaces(t);
      if (!pp || pp[uid] == null) return;
      out.push({ t, place: pp[uid], pts: givesPoints(state, t) ? playerPoints(state, t, pp[uid]) : null });
    });
    return out.sort((a, b) => (b.t.data || '').localeCompare(a.t.data || ''));
  }

  return {
    BYE, FORMATS, INDIVIDUAL, isIndividual, individualEntry, TEMPO_CRITERI, quoziente, FINALISTS, POINTS, POOL_TYPES, real, round2, hasPools, hasBracket, defaultConfig, normalize,
    setsToWin, setTarget, validateResult, matchStats, drawCheck, startDraw, setPoolType, canBeFivb, resetDraw, resetBracket,
    poolMatches, poolStandings, poolsComplete, generateBracket, computeMain, roundName,
    americanaMatches, americanaComplete, americanaStandings, AMERICANA_CRITERI, americanaCrit, placements, status,
    fantasmaPoolMatches, fantasmaPoolStandings, fantasmaPoolsComplete, fantasmaQualifiers, fantasmaKo, fantasmaStage,
    tempoMatches, tempoComplete, tempoStandings, rotazioneStandings, ROT_CRITERI, rotCrit, rotazioneShape, isRotazione, TEMPO_SQUADRE, LIVELLI,
    fantasmaNextIds, fantasmaAdvance, fantasmaSetFinal, fantasmaUndo,
    RANK_CATS, rankCat, VINCOLI, SFIDE_PUNTI, playerSummary, medals,
    tablePoints, pointsRows, givesPoints, entryPoints, playerPoints, entryPlayers, ranking, rankMap, playerHistory
  };
})();
