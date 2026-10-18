// Temi grafici a scelta dell'utente: nome, descrizione e caratteri (scaricati solo quando servono).
const Temi = (() => {
  const LIST = {
 "moderno": {
  "nome": "Moderno",
  "desc": "Verde campo e lime, pulito.",
  "fonts": ""
 },
 "notte": {
  "nome": "Notte",
  "desc": "Scuro e riposante.",
  "fonts": ""
 },
 "quattromori": {
  "nome": "Quattro Mori",
  "desc": "Omaggio alla Sardegna: bianco, rosso e nero.",
  "fonts": "family=Cinzel:wght@400;700&family=Lato:wght@400;700"
 },
 "diner": {
  "nome": "American Diner",
  "desc": "Anni ’50: rosso ciliegia, azzurro, scacchi, neon.",
  "fonts": "family=Lobster&family=Nunito:wght@400;600;700;800"
 },
 "varsity": {
  "nome": "College USA",
  "desc": "Varsity americano: blu navy, rosso, scritte da college.",
  "fonts": "family=Graduate&family=Oswald:wght@400;600;700;800"
 },
 "funny": {
  "nome": "Funny",
  "desc": "Colori pop, forme morbide, emoji.",
  "fonts": "family=Baloo+2:wght@400;600;700;800"
 },
 "tropical": {
  "nome": "Tropicale",
  "desc": "Turchese, corallo, palme e scritte corsive.",
  "fonts": "family=Nunito:wght@400;600;700;800&family=Pacifico"
 },
 "neon": {
  "nome": "Neon Arcade",
  "desc": "Sala giochi anni ’80: neon rosa e azzurro.",
  "fonts": "family=Orbitron:wght@400;600;700;800&family=Press+Start+2P"
 },
 "pastello": {
  "nome": "Pastello",
  "desc": "Rosa cipria, lilla, menta.",
  "fonts": "family=Fredoka:wght@400;600;700;800"
 },
 "club": {
  "nome": "Tennis Club Vintage",
  "desc": "Crema, verde bosco, dettagli dorati.",
  "fonts": "family=Lora:wght@400;700&family=Playfair+Display:wght@400;600;700;800"
 },
 "fumetto": {
  "nome": "Fumetto",
  "desc": "Bordi neri spessi, giallo, retino, scritte urlate.",
  "fonts": "family=Bangers&family=Comic+Neue:wght@400;700"
 },
 "nordico": {
  "nome": "Minimal Nordico",
  "desc": "Grigi caldi, legno chiaro, molto spazio.",
  "fonts": "family=Manrope:wght@400;600;700;800"
 },
 "aurora": {
  "nome": "Aurora",
  "desc": "Vetro smerigliato su sfumature viola-azzurre.",
  "fonts": "family=Poppins:wght@400;600;700;800"
 },
 "energy": {
  "nome": "Sport Energy",
  "desc": "Nero e arancione, scritte inclinate da sponsor.",
  "fonts": "family=Anton&family=Oswald:wght@400;600;700;800"
 },
 "natura": {
  "nome": "Natura",
  "desc": "Verdi caldi, terra, forme organiche.",
  "fonts": "family=Nunito:wght@400;600;700;800"
 },
 "brutal": {
  "nome": "Brutalista",
  "desc": "Bianco e nero, giallo acido, macchina da scrivere.",
  "fonts": "family=Space+Mono:wght@400;700"
 },
 "gold": {
  "nome": "Lusso",
  "desc": "Nero e oro, eleganza da club privato.",
  "fonts": "family=Cormorant+Garamond:wght@400;700&family=Montserrat:wght@400;600;700;800"
 },
 "memphis": {
  "nome": "Pop Memphis",
  "desc": "Anni ’80 italiani: righe e colori a contrasto.",
  "fonts": "family=Rubik:wght@400;600;700;800"
 },
 "seventies": {
  "nome": "Retro ’70",
  "desc": "Arancio, senape e marrone, arcobaleni.",
  "fonts": "family=Nunito:wght@400;600;700;800&family=Shrikhand"
 },
 "oceano": {
  "nome": "Oceano",
  "desc": "Blu profondo e onde.",
  "fonts": "family=Nunito:wght@400;600;700;800&family=Righteous"
 },
 "cartoon": {
  "nome": "Cartoon Classico",
  "desc": "Cerchi rossi, giallo e contorni neri spessi.",
  "fonts": "family=Luckiest+Guy&family=Sniglet:wght@400;700"
 },
 "kawaii": {
  "nome": "Kawaii",
  "desc": "Pastello, nuvolette e faccine.",
  "fonts": "family=M+PLUS+Rounded+1c:wght@400;700&family=Mochiy+Pop+One"
 },
 "avventura": {
  "nome": "Cartoon Avventura",
  "desc": "Cielo, nuvole, prato e contorni spessi.",
  "fonts": "family=Nunito:wght@400;600;700;800&family=Titan+One"
 },
 "protour": {
  "nome": "Pro Tour",
  "desc": "Blu notte, lime elettrico e il giocatore in azione.",
  "fonts": "family=Barlow+Condensed:wght@400;600;700;800&family=Bebas+Neue"
 },
 "kitchen": {
  "nome": "Kitchen",
  "desc": "I colori del campo: blu, verde e le righe bianche.",
  "fonts": "family=Exo+2:wght@400;600;700;800&family=Rajdhani:wght@400;700"
 },
 "semplice": {
  "nome": "Semplice",
  "desc": "Essenziale, bianco e nero, molto leggibile.",
  "fonts": ""
 }
};
  const loaded = new Set();
  function loadFonts(k) {
    const t = LIST[k];
    if (!t || !t.fonts || loaded.has(k)) return;
    loaded.add(k);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + t.fonts + '&display=swap';
    document.head.appendChild(l);
  }
  // Tema di partenza per chi apre l'app la prima volta.
  const DEFAULT = 'kitchen';
  // save = true solo quando l'utente sceglie un tema (così chi non ha mai scelto vede sempre il tema di partenza).
  function apply(k, save) {
    if (!LIST[k]) k = DEFAULT;
    loadFonts(k);
    document.documentElement.setAttribute('data-theme', k);
    if (save) try { localStorage.setItem('pbm-tema', k); } catch (e) { /* ignora */ }
    return k;
  }
  function saved() {
    try { return localStorage.getItem('pbm-tema'); } catch (e) { return null; }
  }
  const loadAll = () => Object.keys(LIST).forEach(loadFonts);
  return { LIST, DEFAULT, apply, saved, loadFonts, loadAll };
})();
