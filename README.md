# Decision Playground

Playground statico in italiano per Microsoft Decision 1.1. Gli esempi registrati si aprono senza credenziali. Per una prova live, inserisci la tua chiave OpenRouter da **Chiave API** e seleziona **Esegui decisione**.

## Avvio locale

Dalla cartella del progetto, avvia il server locale e apri [Decision Playground](http://127.0.0.1:8000/).

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

## Verifica e hosting

Esegui i test con `node --test` (Node 24). Per l’hosting HTTPS, carica insieme `index.html`, `styles.css`, `app.js`, `decision.js`, `api.js`, `examples.js` e `recordings.js`. Fai una prova live dall’indirizzo definitivo per verificare l’accesso a OpenRouter.
