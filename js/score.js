// Motore dello scoresheet del pickleball (nessun accesso a pagina o database).
// La partita è una lista di eventi; lo stato si ricalcola sempre da capo (così "Annulla" toglie l'ultimo evento).
//
// cfg: { sistema: 'sideout' | 'rally', doppio: true/false, giochi: 1 | 3 | 5, punti: [11, 11, 11] (punti per game),
//        cc: { tra: true (cambio campo tra un game e l'altro), durante: 'decisivo' | 'tutti' | 'no', a: 0 (punteggio; 0 = metà) } }
// eventi:
//   'G<s><a><b>'  inizio game: s = squadra al servizio (0/1), a/b = giocatore che parte a destra (0/1) per la squadra 0 e 1
//   'A' / 'B'     scambio vinto dalla squadra 0 / 1
//   'T0' / 'T1'   timeout della squadra 0 / 1
//   'C'           cambio campo fatto (game decisivo, a metà punteggio)
//   'R0' / 'R1'   ritiro della squadra 0 / 1
(function () {
  const target = (cfg, g) => Number((cfg.punti || [])[g] || (cfg.punti || [])[0] || 11);
  const giochi = cfg => [1, 3, 5].includes(Number(cfg.giochi)) ? Number(cfg.giochi) : 1;
  const needWins = cfg => Math.ceil(giochi(cfg) / 2);
  // timeout per game: 2 nei game a 11 e 15, 3 nei game a 21
  const timeouts = (cfg, g) => (target(cfg, g) >= 21 ? 3 : 2);
  // cambio campo: di norma tra i game e, nel game decisivo (anche a game unico), a metà: 6 (a 11), 8 (a 15), 11 (a 21)
  const ccCfg = cfg => Object.assign({ tra: true, durante: 'decisivo', a: 0 }, cfg.cc || {});
  const ccAt = (cfg, g) => {
    const c = ccCfg(cfg);
    if (c.durante === 'no' || (c.durante !== 'tutti' && g !== giochi(cfg) - 1)) return 0;
    const a = Number(c.a) || Math.ceil(target(cfg, g) / 2);
    return a > 0 && a < target(cfg, g) ? a : Math.ceil(target(cfg, g) / 2);
  };

  function replay(cfg, ev) {
    const doppio = cfg.doppio !== false, rally = cfg.sistema === 'rally';
    const st = { games: [], wins: [0, 0], winner: null, retired: null, phase: 'setup', g: 0 };
    let G = null;
    const startGame = (s, a, b) => {
      G = {
        n: st.games.length, start: { s, r: [a, b] }, score: [0, 0], serve: s,
        // primo servizio del game: nel classico in doppio serve solo un giocatore ("0-0-2")
        sn: rally || !doppio ? 0 : 2,
        pos: [[a, 1 - a], [b, 1 - b]], to: [0, 0], cc: false, ccDone: false, winner: null, log: []
      };
      G.server = doppio ? G.pos[s][0] : 0;
      st.games.push(G);
      st.phase = 'play';
    };
    const swap = t => { G.pos[t] = [G.pos[t][1], G.pos[t][0]]; };
    for (const e of ev || []) {
      if (st.phase === 'end') break;
      const k = e[0];
      if (k === 'G') { if (st.phase !== 'play') startGame(+e[1], +e[2], +e[3]); continue; }
      if (!G || st.phase !== 'play') continue;
      if (k === 'T') { const t = +e[1]; if (G.to[t] < timeouts(cfg, G.n)) { G.to[t]++; G.log.push({ to: t, score: G.score.slice() }); } continue; }
      if (k === 'C') { if (G.cc && !G.ccDone) { G.ccDone = true; G.log.push({ cc: true, score: G.score.slice() }); } continue; }
      if (k === 'R') { st.retired = +e[1]; st.winner = 1 - st.retired; st.phase = 'end'; G.log.push({ rit: st.retired, score: G.score.slice() }); break; }
      if (k !== 'A' && k !== 'B') continue;
      if (G.cc && !G.ccDone) continue;   // prima si conferma il cambio campo
      const w = k === 'A' ? 0 : 1, srv = G.serve, line = { srv, p: G.server, sn: G.sn, w };
      if (rally) {
        G.score[w]++;
        if (w === srv) { if (doppio) swap(srv); }
        else { G.serve = w; if (doppio) G.server = G.pos[w][G.score[w] % 2 === 0 ? 0 : 1]; }
        line.pt = true;
      } else if (w === srv) {
        G.score[srv]++; line.pt = true;
        if (doppio) swap(srv);   // chi serve cambia lato e continua
      } else if (doppio && G.sn === 1) {
        G.sn = 2; G.server = 1 - G.server;   // serve il compagno, dal lato in cui si trova
        line.second = true;
      } else {
        G.serve = 1 - srv; G.sn = doppio ? 1 : 0; G.server = doppio ? G.pos[G.serve][0] : 0;   // cambio palla: serve chi è a destra
        line.out = true;
      }
      line.score = G.score.slice();
      G.log.push(line);
      const tg = target(cfg, G.n), [x, y] = G.score;
      if ((x >= tg || y >= tg) && Math.abs(x - y) >= 2) {
        G.winner = x > y ? 0 : 1;
        st.wins[G.winner]++;
        if (st.wins[G.winner] >= needWins(cfg)) { st.winner = G.winner; st.phase = 'end'; }
        else st.phase = 'gameover';
      } else if (!G.cc && ccAt(cfg, G.n) && Math.max(x, y) >= ccAt(cfg, G.n)) G.cc = true;
    }
    st.g = G ? G.n : 0;
    st.cur = G;
    if (G) {
      G.call = rally || !doppio || !G.sn ? `${G.score[G.serve]}-${G.score[1 - G.serve]}` : `${G.score[G.serve]}-${G.score[1 - G.serve]}-${G.sn}`;
      G.toLeft = [0, 1].map(t => timeouts(cfg, G.n) - G.to[t]);
      G.needCC = G.cc && !G.ccDone && st.phase === 'play';
      // lato dello schermo: si cambia a ogni game e a metà del game decisivo
      // ogni cambio campo fatto (tra i game e durante) inverte i lati
      const flips = (ccCfg(cfg).tra ? G.n : 0) + st.games.filter(x => x.ccDone).length;
      G.flip = flips % 2 === 1;
    }
    if (st.phase === 'end' || st.phase === 'gameover') st.next = st.games.length;
    return st;
  }

  // Risultato per il torneo: set completati (e ritiro).
  function result(cfg, st) {
    const sets = st.games.filter(g => g.winner != null).map(g => g.score.slice());
    return { sets, forfeit: st.retired == null ? null : st.retired === 0 ? 'a' : 'b', winner: st.winner };
  }

  window.Score = { replay, result, target, giochi, timeouts, ccAt, ccCfg, needWins };
  if (typeof module !== 'undefined') module.exports = window.Score;
})();
