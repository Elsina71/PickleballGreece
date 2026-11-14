// Chiamata vocale dello scoresheet, in inglese (sintesi vocale del telefono).
// Chiamata: punti di chi serve, punti di chi riceve, numero del battitore (solo nel doppio classico), lato del servizio.
// Esempio: "nine, seven, two, left".
(function () {
  const LS = 'pbm-voce';
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three',
    'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty'];
  const num = n => NUM[n] || String(n);
  const SIDE = { destra: 'right', sinistra: 'left' };

  // Testo della chiamata per il game in corso (G = game calcolato da Score.replay).
  function callText(G) {
    if (!G) return '';
    const parts = [num(G.score[G.serve]), num(G.score[1 - G.serve])];
    if (G.sn) parts.push(num(G.sn));
    if (G.side) parts.push(SIDE[G.side] || G.side);
    return parts.join(', ');
  }
  // "Rossi / Bianchi" diventa "Rossi and Bianchi".
  const teamText = nomi => (nomi || []).filter(Boolean).join(' and ');

  // Cosa dire dopo un'azione, confrontando lo stato prima (a) e dopo (b). nomi = nomi delle due squadre.
  function announce(a, b, nomi, kind) {
    const G = b.cur, out = [];
    if (kind === 'undo') out.push('Correction.');
    if (b.phase === 'end' && (!a || a.phase !== 'end')) {
      if (b.retired != null) return `Retirement. Match to ${teamText(nomi[b.winner])}.`;
      const sets = b.games.filter(g => g.winner != null).map(g => `${num(g.score[0])}, ${num(g.score[1])}`).join('; ');
      return `Match to ${teamText(nomi[b.winner])}. ${sets}.`;
    }
    if (b.phase === 'gameover' && (!a || a.phase !== 'gameover' || a.games.length !== b.games.length)) {
      const g = b.games[b.games.length - 1];
      return `Game to ${teamText(nomi[g.winner])}, ${num(g.score[g.winner])}, ${num(g.score[1 - g.winner])}. Change ends.`;
    }
    if (b.phase === 'setup' || b.phase === 'gameover') { out.push('Waiting for the next game.'); return out.join(' '); }
    if (b.phase === 'end') { out.push(`Match to ${teamText(nomi[b.winner])}.`); return out.join(' '); }
    if (G && G.log.length === 0 && kind !== 'undo') out.push(`Game ${num(G.n + 1)}. ${teamText(nomi[G.serve])} to serve.`);
    const line = G && kind !== 'undo' && G.log.length ? G.log[G.log.length - 1] : null;
    if (line && line.out) out.push('Side out.');
    else if (line && line.second) out.push('Second server.');
    out.push(callText(G) + '.');
    if (G && G.needCC && (!a || !a.cur || !a.cur.needCC || a.cur.n !== G.n)) out.push('Change ends.');
    return out.join(' ');
  }

  // accesa di serie; il telefono ricorda la scelta
  let on = true;
  try { on = localStorage.getItem(LS) !== '0'; } catch (e) { on = true; }
  const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  // ---------- stili di voce ----------
  // g = donna/uomo, pitch = tono (basso = caldo, alto = squillante), rate = velocità
  const STILI = [
    { id: 'donna-calda', label: 'Donna · calda', g: 'F', pitch: 0.85, rate: 0.95 },
    { id: 'donna', label: 'Donna · naturale', g: 'F', pitch: 1.0, rate: 1.0 },
    { id: 'donna-squillante', label: 'Donna · squillante', g: 'F', pitch: 1.35, rate: 1.08 },
    { id: 'arbitra', label: 'Donna · arbitra rapida', g: 'F', pitch: 1.15, rate: 1.25 },
    { id: 'uomo-caldo', label: 'Uomo · caldo', g: 'M', pitch: 0.8, rate: 0.93 },
    { id: 'uomo', label: 'Uomo · naturale', g: 'M', pitch: 1.0, rate: 1.0 },
    { id: 'uomo-squillante', label: 'Uomo · squillante', g: 'M', pitch: 1.25, rate: 1.08 },
    { id: 'speaker', label: 'Uomo · speaker da stadio', g: 'M', pitch: 0.65, rate: 0.86 }
  ];
  // nomi delle voci inglesi più diffuse (iPhone/Mac, Windows/Edge, Android, Chrome)
  const DONNE = /samantha|karen|victoria|zira|susan|moira|tessa|fiona|serena|allison|ava\b|kate|hazel|libby|sonia|jenny|aria|emma|amy|joanna|salli|kimberly|ivy|nicky|martha|catherine|google us english|female|-enus-x-(sfg|tpc|iob|iog)/i;
  const UOMINI = /daniel|alex\b|fred|david|mark|george|arthur|aaron|gordon|rishi|guy\b|ryan|oliver|thomas|matthew|joey|justin|brian|tom\b|lee\b|google uk english male|\bmale\b|-enus-x-(iol|iom|tpd)/i;
  const genderOf = v => { const n = `${v.name} ${v.voiceURI}`; return UOMINI.test(n) && !/female/i.test(n) ? 'M' : DONNE.test(n) ? 'F' : ''; };
  const LSS = 'pbm-voce-stile';
  // chi aveva scelto "voce maschile" con la versione precedente parte da "Uomo · naturale"
  const defStile = () => { let g = 'F'; try { g = localStorage.getItem('pbm-voce-sesso') === 'M' ? 'M' : 'F'; } catch (e) { /* ignora */ } return { stile: g === 'M' ? 'uomo' : 'donna', voce: '', tono: 0, vel: 1 }; };
  let pref = defStile();
  try { pref = Object.assign(defStile(), JSON.parse(localStorage.getItem(LSS) || '{}')); } catch (e) { pref = defStile(); }
  const savePref = () => { try { localStorage.setItem(LSS, JSON.stringify(pref)); } catch (e) { /* ignora */ } };
  const stile = () => STILI.find(x => x.id === pref.stile) || STILI[1];
  function voices() {
    if (!supported()) return [];
    return window.speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang))
      .map(v => ({ v, name: v.name, lang: v.lang, uri: v.voiceURI, g: genderOf(v), local: v.localService }));
  }
  // voce da usare e regolazioni finali (con la correzione del tono se manca una voce del sesso giusto)
  function setup() {
    const S = stile(), vs = voices(), us = x => /^en[-_]US/i.test(x.lang);
    let pick = pref.voce ? vs.find(x => x.uri === pref.voce) : null;
    if (!pick) pick = vs.find(x => x.g === S.g && us(x) && x.local) || vs.find(x => x.g === S.g && us(x)) || vs.find(x => x.g === S.g) || vs.find(us) || vs[0] || null;
    let pitch = S.pitch + 0.1 * (Number(pref.tono) || 0);
    if (pick && !pref.voce && pick.g && pick.g !== S.g) pitch *= S.g === 'M' ? 0.7 : 1.3;
    if (!pick || (!pick.g && !pref.voce)) pitch *= S.g === 'M' ? 0.8 : 1.1;
    return { voice: pick ? pick.v : null, pitch: Math.max(0.1, Math.min(2, pitch)), rate: Math.max(0.5, Math.min(2, S.rate * 0.95 * (Number(pref.vel) || 1))), sameGender: !!pick && pick.g === S.g };
  }
  if (supported()) try { window.speechSynthesis.getVoices(); } catch (e) { /* le voci arrivano dopo */ }
  // Una frase nuova interrompe quella precedente: con azioni rapide si sente sempre il punteggio aggiornato.
  function say(text, force) {
    if (!text || (!on && !force) || !supported()) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      const k = setup();
      if (k.voice) u.voice = k.voice;
      u.pitch = k.pitch;
      u.rate = k.rate;
      window.speechSynthesis.speak(u);
    } catch (e) { /* voce non disponibile */ }
  }
  function setOn(v) {
    on = !!v;
    try { localStorage.setItem(LS, on ? '1' : '0'); } catch (e) { /* ignora */ }
  }
  function setPref(k, v) { pref[k] = v; savePref(); }
  // le voci del dispositivo arrivano dopo l'apertura della pagina: chi mostra l'elenco si aggiorna
  function onVoices(fn) { if (supported() && window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', fn); }

  const Voce = { callText, announce, teamText, say, setOn, supported, STILI, voices, setup, setPref, onVoices, genderOf,
    get pref() { return Object.assign({}, pref); }, get on() { return on; } };
  if (typeof window !== 'undefined') window.Voce = Voce;
  if (typeof module !== 'undefined') module.exports = Voce;
})();
