# Decision Playground

Playground statico in italiano per Microsoft Decision 1.1. Gli esempi registrati si aprono senza credenziali. Per una prova live, inserisci la tua chiave OpenRouter da **Chiave API** e seleziona **Esegui decisione**.

## Usa e installa l’app

Apri [Decision Playground su GitHub Pages](https://phenixita.github.io/decisionplayground/). In Edge o Chrome scegli **Installa app** nella pagina o usa l’icona di installazione nella barra degli indirizzi. Su iPhone, in Safari usa **Condividi → Aggiungi alla schermata Home**.

Dopo il primo caricamento puoi aprire il playground e consultare gli esempi anche offline. Le prove live richiedono Internet e la tua chiave, che resta in memoria per la durata della pagina.

## Avvio locale

Dalla cartella del progetto, avvia il server locale e apri [Decision Playground](http://127.0.0.1:8000/).

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

## Test e pubblicazione

Esegui i test con `node --test` (Node 24). GitHub Actions pubblica i file statici dopo i test a ogni push su `main`.
