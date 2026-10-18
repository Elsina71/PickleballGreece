// Premi fedeltà (prenotazioni giocate → stelle, comete, pianeti…) e premi performance (medaglie, trofei, racchette).
const Premi = (() => {
  const DEFAULT = {
    stelle: [5, 10, 20, 35, 50],   // prenotazioni giocate per la 1ª, 2ª, 3ª… stella
    passoStelle: 20,               // dopo l'ultima soglia: una stella ogni N prenotazioni
    trofei: [100, 250, 500, 1000, 2000],
    racchette: [5, 10, 25, 50]
  };
  const LIVELLI = ['Bronzo', 'Argento', 'Oro', 'Platino', 'Diamante'];
  // Ogni 10 unità si passa alla successiva: 10 stelle = 1 cometa, 10 comete = 1 pianeta…
  const UNITS = [
    { n: 10000, icon: '🌌', one: 'galassia', many: 'galassie' },
    { n: 1000, icon: '☀️', one: 'sole', many: 'soli' },
    { n: 100, icon: '🪐', one: 'pianeta', many: 'pianeti' },
    { n: 10, icon: '☄️', one: 'cometa', many: 'comete' },
    { n: 1, icon: '⭐', one: 'stella', many: 'stelle' }
  ];

  const cfg = state => {
    const c = Object.assign({}, DEFAULT, (state.settings && state.settings.premi) || {});
    const nums = a => (Array.isArray(a) ? a : []).map(Number).filter(x => x > 0).sort((x, y) => x - y);
    return { stelle: nums(c.stelle), passoStelle: Math.max(1, Number(c.passoStelle) || 1), trofei: nums(c.trofei), racchette: nums(c.racchette) };
  };

  // Stelle guadagnate con n prenotazioni giocate e quante ne mancano alla prossima.
  function stars(state, n) {
    const c = cfg(state);
    const last = c.stelle.length ? c.stelle[c.stelle.length - 1] : 0;
    const threshold = i => (i < c.stelle.length ? c.stelle[i] : last + c.passoStelle * (i - c.stelle.length + 1));
    let k = 0;
    while (n >= threshold(k)) k++;
    return { stelle: k, prossima: threshold(k), mancano: threshold(k) - n };
  }

  function parts(k) {
    const out = [];
    UNITS.forEach(u => { const q = Math.floor(k / u.n); k -= q * u.n; if (q) out.push({ u, q }); });
    return out;
  }

  const starIcons = k => parts(k).map(({ u, q }) => `<span class="star-unit" title="${q} ${q === 1 ? u.one : u.many}">${u.icon.repeat(Math.min(q, 9))}</span>`).join('');
  const starLabel = k => (k ? parts(k).map(({ u, q }) => `${q} ${q === 1 ? u.one : u.many}`).join(' e ') : 'nessuna stella');

  // Livello raggiunto (0 = nessuno) rispetto a un elenco di soglie, e soglia successiva.
  function level(value, thresholds) {
    let i = 0;
    while (i < thresholds.length && value >= thresholds[i]) i++;
    return { livello: i, nome: i ? LIVELLI[Math.min(i, LIVELLI.length) - 1] : '', prossima: thresholds[i] != null ? thresholds[i] : null };
  }

  const trophy = (state, points) => level(points, cfg(state).trofei);
  const racket = (state, tornei) => level(tornei, cfg(state).racchette);

  // Badge compatti (per classifica e schede): medaglie, trofeo, racchetta.
  function perfBadges(state, uid, totalPoints) {
    const m = Logic.medals(state, uid), tr = trophy(state, totalPoints || 0), ra = racket(state, m.tornei);
    const out = [];
    if (m.oro) out.push(`<span class="pb" title="${m.oro} ${m.oro === 1 ? 'vittoria' : 'vittorie'}">🥇${m.oro > 1 ? '×' + m.oro : ''}</span>`);
    if (m.argento) out.push(`<span class="pb" title="${m.argento} secondi posti">🥈${m.argento > 1 ? '×' + m.argento : ''}</span>`);
    if (m.bronzo) out.push(`<span class="pb" title="${m.bronzo} terzi posti">🥉${m.bronzo > 1 ? '×' + m.bronzo : ''}</span>`);
    if (tr.livello) out.push(`<span class="pb lv${tr.livello}" title="Trofeo ${tr.nome}">🏆</span>`);
    if (ra.livello) out.push(`<span class="pb lv${ra.livello}" title="Racchetta ${ra.nome}: ${m.tornei} tornei">🏓</span>`);
    return out.join('');
  }

  return { DEFAULT, LIVELLI, cfg, stars, starIcons, starLabel, trophy, racket, perfBadges };
})();
