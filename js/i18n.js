// Lingue dell'app. I testi sono scritti in italiano nel codice: T('testo {0}', [valore]) restituisce la traduzione
// nella lingua scelta (dizionari in js/lang/xx.js, caricati prima dell'app). Senza traduzione resta l'italiano.
(function () {
  const LANGS = {
    it: { nome: 'Italiano', locale: 'it-IT', flag: '🇮🇹' },
    en: { nome: 'English', locale: 'en-GB', flag: '🇬🇧' },
    el: { nome: 'Ελληνικά', locale: 'el-GR', flag: '🇬🇷' },
    es: { nome: 'Español', locale: 'es-ES', flag: '🇪🇸' },
    pt: { nome: 'Português', locale: 'pt-PT', flag: '🇵🇹' },
    fr: { nome: 'Français', locale: 'fr-FR', flag: '🇫🇷' },
    de: { nome: 'Deutsch', locale: 'de-DE', flag: '🇩🇪' },
    ro: { nome: 'Română', locale: 'ro-RO', flag: '🇷🇴' },
    ru: { nome: 'Русский', locale: 'ru-RU', flag: '🇷🇺' },
    sw: { nome: 'Kiswahili', locale: 'sw-KE', flag: '🇰🇪' }
  };
  const KEY = 'pbm-lingua';
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
  // Prima visita: la lingua del dispositivo, se c'è; altrimenti inglese.
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
  const lang = LANGS[saved] ? saved : LANGS[nav] ? nav : 'en';
  const dict = {};
  const fill = (s, vars) => (vars ? String(s).replace(/\{(\d+)\}/g, (m, i) => (vars[i] == null ? '' : vars[i])) : s);

  window.T = (s, vars) => fill((dict[s] != null && dict[s] !== '') ? dict[s] : s, vars);
  window.I18n = {
    LANGS, lang, locale: LANGS[lang].locale,
    add: (code, d) => { if (code === lang) Object.assign(dict, d); },
    set: code => { try { localStorage.setItem(KEY, code); } catch (e) {} location.reload(); },
    // testi fissi della pagina (menu): data-t sul testo, data-t-aria/-title sugli attributi
    page: () => {
      document.documentElement.lang = lang;
      document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.textContent.trim()); });
      document.querySelectorAll('[data-t-aria]').forEach(el => { el.setAttribute('aria-label', T(el.getAttribute('aria-label'))); });
    }
  };
  if (lang !== 'it') document.write(`<script src="js/lang/${lang}.js?v=11"><\/script>`);
})();
