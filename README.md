# Budget Famiglia

Mobile-first PWA per il budgeting familiare mensile. Single-user, zero backend, dati 100% locali (localStorage del browser).

## Features

- **Setup wizard** con preset configurabile e bottone "default" per partire al volo
- **Input spesa in 3 tap**: numpad iOS-style + categoria + salva
- **Spese fisse ricorrenti** (abbonamenti, telefono, ecc.) auto-applicate il giorno 1 di ogni mese
- **Sinking funds** per spese annuali mensilizzate (assicurazione auto, regali Natale, ecc.)
- **Dashboard KPI**: tasso di risparmio, semaforo settimanale Desideri, runway liquidità, barre per categoria con soglie 75%/100%
- **Review mensile** stile Kakeibo (4 domande)
- **Backup JSON** export/import
- **PWA** installabile su iPhone/Android via "Aggiungi a Home"
- **Dark mode** automatica
- **Offline-first** via service worker

## Stack

HTML + CSS + JS vanilla. Nessuna dipendenza, nessun framework. ~50KB totali.

## Uso locale

```bash
python -m http.server 8000
# apri http://localhost:8000
```

## Installazione iPhone

1. Apri l’URL della PWA in Safari
2. Tap "Condividi" → "Aggiungi a Home"
3. L’app appare come icona nativa, funziona offline, status bar trasparente

## Privacy

Tutti i dati restano nel localStorage del browser. Nessun dato lascia il dispositivo. Backup esportabile in JSON locale.
