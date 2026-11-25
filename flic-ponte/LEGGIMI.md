# Pulsanti Flic per lo scoresheet di Pickleball Tribe

Un pulsante Flic 2 per squadra (al polso di un giocatore o a bordo campo):

| Tocchi | Cosa fa |
|---|---|
| 1 tocco | la squadra vince lo scambio (punto o cambio palla); a inizio game fa partire il game con quella squadra al servizio |
| 2 tocchi rapidi | annulla l'ultima azione (ripetendo si annullano più azioni) |
| pressione lunga (1 secondo) | chiede di azzerare la partita: si conferma con un'altra pressione lunga entro 5 secondi (o sullo schermo). Subito dopo, 2 tocchi la ripristinano |

Il punteggio si può sempre tenere anche toccando lo schermo: pulsanti e tocchi si possono usare insieme.

## Collegamento A — Bluetooth diretto a telefono, tablet, Mac o PC (consigliato)

1. Nell'app Flic imposta ogni pulsante come **tastiera (HID)** e scegli un tasto diverso per ciascuno.
2. Abbina il pulsante dalle impostazioni Bluetooth del telefono, del Mac o del PC, come una tastiera.
3. Nello scoresheet: **Pulsanti Flic → Abbina i pulsanti**, poi premi il pulsante di ogni squadra.

Se il Flic manda un tasto diverso per 1 tocco, 2 tocchi e pressione lunga, si possono abbinare anche quelli in
"Tasti separati per i gesti".

## Collegamento B — PC Windows/Linux con il programma ufficiale Flic

1. Avvia il programma Flic: su Windows `FlicSDK.exe 127.0.0.1 5551`
   (https://github.com/50ButtonsEach/fliclib-windows), su Linux `flicd -f flic.sqlite3`.
2. Abbina ogni pulsante una volta: `python ponte_flic.py abbina` (tieni premuto il Flic finché si collega).
3. Avvia il ponte: `python ponte_flic.py`
4. Nello scoresheet: **Pulsanti Flic → ponte su PC → Collega**, poi **Abbina dal ponte** e premi il pulsante di ogni squadra.

Il ponte usa solo Python 3 (nessun pacchetto da installare) e accetta collegamenti solo dallo stesso PC.

## Prove senza i pulsanti

- **Simulatore sullo schermo**: Pulsanti Flic → Mostra simulatore. I due pulsanti tondi si comportano come i Flic.
- **Tastiera**: di serie il pulsante 1 è il tasto `1` e il pulsante 2 il tasto `2`.
- **Ponte simulato**: `python ponte_flic.py --simula`, poi nello scoresheet Collega e abbina scrivendo `1` e `2`;
  i tocchi si scrivono `1`, `11`, `2`, `22`; la pressione lunga `1h` o `2h`.

La libreria `fliclib.py` è quella ufficiale di Flic (licenza CC0).
