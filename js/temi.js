// Temi grafici a scelta dell'utente: nome, descrizione e caratteri (scaricati solo quando servono).
const Temi = (() => {
  const LIST = {
 "moderno": {
  "nome": T("Moderno"),
  "desc": T("Verde campo e lime, pulito."),
  "fonts": ""
 },
 "notte": {
  "nome": T("Notte"),
  "desc": T("Scuro e riposante."),
  "fonts": ""
 },
 "quattromori": {
  "nome": T("Quattro Mori"),
  "desc": T("Omaggio alla Sardegna: bianco, rosso e nero."),
  "fonts": "family=Cinzel:wght@400;700&family=Lato:wght@400;700"
 },
 "diner": {
  "nome": T("American Diner"),
  "desc": T("Anni ’50: rosso ciliegia, azzurro, scacchi, neon."),
  "fonts": "family=Lobster&family=Nunito:wght@400;600;700;800"
 },
 "varsity": {
  "nome": T("College USA"),
  "desc": T("Varsity americano: blu navy, rosso, scritte da college."),
  "fonts": "family=Graduate&family=Oswald:wght@400;600;700;800"
 },
 "funny": {
  "nome": T("Funny"),
  "desc": T("Colori pop, forme morbide, emoji."),
  "fonts": "family=Baloo+2:wght@400;600;700;800"
 },
 "tropical": {
  "nome": T("Tropicale"),
  "desc": T("Turchese, corallo, palme e scritte corsive."),
  "fonts": "family=Nunito:wght@400;600;700;800&family=Pacifico"
 },
 "neon": {
  "nome": T("Neon Arcade"),
  "desc": T("Sala giochi anni ’80: neon rosa e azzurro."),
  "fonts": "family=Orbitron:wght@400;600;700;800&family=Press+Start+2P"
 },
 "pastello": {
  "nome": T("Pastello"),
  "desc": T("Rosa cipria, lilla, menta."),
  "fonts": "family=Fredoka:wght@400;600;700;800"
 },
 "club": {
  "nome": T("Tennis Club Vintage"),
  "desc": T("Crema, verde bosco, dettagli dorati."),
  "fonts": "family=Lora:wght@400;700&family=Playfair+Display:wght@400;600;700;800"
 },
 "fumetto": {
  "nome": T("Fumetto"),
  "desc": T("Bordi neri spessi, giallo, retino, scritte urlate."),
  "fonts": "family=Bangers&family=Comic+Neue:wght@400;700"
 },
 "nordico": {
  "nome": T("Minimal Nordico"),
  "desc": T("Grigi caldi, legno chiaro, molto spazio."),
  "fonts": "family=Manrope:wght@400;600;700;800"
 },
 "aurora": {
  "nome": T("Aurora"),
  "desc": T("Vetro smerigliato su sfumature viola-azzurre."),
  "fonts": "family=Poppins:wght@400;600;700;800"
 },
 "energy": {
  "nome": T("Sport Energy"),
  "desc": T("Nero e arancione, scritte inclinate da sponsor."),
  "fonts": "family=Anton&family=Oswald:wght@400;600;700;800"
 },
 "natura": {
  "nome": T("Natura"),
  "desc": T("Verdi caldi, terra, forme organiche."),
  "fonts": "family=Nunito:wght@400;600;700;800"
 },
 "brutal": {
  "nome": T("Brutalista"),
  "desc": T("Bianco e nero, giallo acido, macchina da scrivere."),
  "fonts": "family=Space+Mono:wght@400;700"
 },
 "gold": {
  "nome": T("Lusso"),
  "desc": T("Nero e oro, eleganza da club privato."),
  "fonts": "family=Cormorant+Garamond:wght@400;700&family=Montserrat:wght@400;600;700;800"
 },
 "memphis": {
  "nome": T("Pop Memphis"),
  "desc": T("Anni ’80 italiani: righe e colori a contrasto."),
  "fonts": "family=Rubik:wght@400;600;700;800"
 },
 "seventies": {
  "nome": T("Retro ’70"),
  "desc": T("Arancio, senape e marrone, arcobaleni."),
  "fonts": "family=Nunito:wght@400;600;700;800&family=Shrikhand"
 },
 "oceano": {
  "nome": T("Oceano"),
  "desc": T("Blu profondo e onde."),
  "fonts": "family=Nunito:wght@400;600;700;800&family=Righteous"
 },
 "cartoon": {
  "nome": T("Cartoon Classico"),
  "desc": T("Cerchi rossi, giallo e contorni neri spessi."),
  "fonts": "family=Luckiest+Guy&family=Sniglet:wght@400;700"
 },
 "kawaii": {
  "nome": T("Kawaii"),
  "desc": T("Pastello, nuvolette e faccine."),
  "fonts": "family=M+PLUS+Rounded+1c:wght@400;700&family=Mochiy+Pop+One"
 },
 "avventura": {
  "nome": T("Cartoon Avventura"),
  "desc": T("Cielo, nuvole, prato e contorni spessi."),
  "fonts": "family=Nunito:wght@400;600;700;800&family=Titan+One"
 },
 "protour": {
  "nome": T("Pro Tour"),
  "desc": T("Blu notte, lime elettrico e il giocatore in azione."),
  "fonts": "family=Barlow+Condensed:wght@400;600;700;800&family=Bebas+Neue"
 },
 "kitchen": {
  "nome": T("Kitchen"),
  "desc": T("I colori del campo: blu, verde e le righe bianche."),
  "fonts": "family=Exo+2:wght@400;600;700;800&family=Rajdhani:wght@400;700"
 },
 "semplice": {
  "nome": T("Semplice"),
  "desc": T("Essenziale, bianco e nero, molto leggibile."),
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
  const DEFAULT = 'protour';
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
