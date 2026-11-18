# PRD — Decision Playground

**18 novembre 2026 · Bozza per revisione**

## Obiettivo

Un sito statico in italiano per capire Microsoft Decision 1.1 con prove pratiche. L’utente parte da un esempio, modifica contenuto e criteri, esegue una decisione con la propria chiave OpenRouter e legge il risultato. Può anche vedere un esempio registrato prima di inserire la chiave.

**Pubblico** · Sviluppatori e persone che vogliono valutare il modello per classificazione, verifica, smistamento e valutazione su scala.

**Successo** · Con una chiave già disponibile, una persona esegue il preset di smistamento in meno di due minuti e sa riconoscere l’opzione selezionata, la distribuzione e l’esito della soglia impostata.

## Cosa offre il modello

Microsoft ha reso disponibile Decision 1.1 il 17 novembre 2026. Valuta testo e immagini e restituisce risposte strutturate con probabilità. Un singolo input può alimentare più domande indipendenti. La capacità dichiarata riguarda decisioni con risposte definite dall’utente. La risposta numerica arriva priva di motivazione testuale. La calibrazione si valuta su casi rappresentativi del proprio uso. [Annuncio Microsoft](https://commandline.microsoft.com/microsoft-decision-model-ga/) · [Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision)

| Domanda | Input della domanda | Cosa mostrare |
| --- | --- | --- |
| **Sì/no** · `noul` | Un’affermazione o domanda binaria. L’API accetta criteri opzionali per `true` e `false`. | `noul` come P(Sì) e il complemento come P(No). |
| **Scelta** · `choice` | `criteria` è una mappa con almeno due opzioni nell’editor, ciascuna con identificatore e descrizione. | Opzione selezionata, probabilità di ogni opzione e `confidence` restituita dall’API. |
| **Punteggio** · `score` | `criteria` è un array di almeno due descrizioni, ordinate dal livello minore al maggiore. | `score` decimale, distribuzione, `legend` e `confidence`. Mostrare anche il livello più probabile. |

Il punteggio è la media degli indici dei livelli, a partire da zero, ponderata con le rispettive probabilità. Può quindi cadere tra due livelli. La probabilità della scelta e il campo `confidence` possono avere valori diversi. [Schema Decisions API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)

## Contratto OpenRouter

- **Richiesta.** `POST https://openrouter.ai/api/alpha/decisions`, modello `microsoft/microsoft-decision-1.1`, JSON con `model`, `state` e `questions`, chiave in `Authorization: Bearer …`. `state` accetta una stringa, un oggetto o un array. `questions` è una mappa indicizzata per ID. Ogni domanda ha `type`, `instructions` e gli eventuali `criteria`. Il contratto da integrare è Decisions API. [Riferimento API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)
- **Immagini.** Inserire nella lista `state` stringhe di testo e parti `{"type":"image_url","image_url":{"url":"data:image/png;base64,…"}}`. Usare PNG o JPEG locali, con entrambi i lati tra 280 e 1.568 px inclusi. Il limite documentato è 8 immagini per domanda, comprese le ripetizioni. Le immagini consumano token di input. [Guida multimodale OpenRouter](https://openrouter.ai/docs/guides/community/multimodal-decisions#limits)
- **Risposta.** Leggere `answers[id]` per associare ogni esito alla sua domanda e usare `model`, `provider`, `id` e `usage` per la diagnostica. Il modello restituito può includere la versione, come `microsoft/microsoft-decision-1.1-20261117`. Mostrare token e costo effettivo dichiarato in `usage.cost`, con precisione sufficiente a leggere importi inferiori a un centesimo. [Riferimento API](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)
- **Condizioni verificate il 18 novembre.** OpenRouter indica Azure come provider, una finestra di 32.768 token, 0,042 USD per milione di token in ingresso e tariffa zero in uscita. La scheda indica indisponibilità del routing OpenRouter vincolato alla regione UE. [Scheda del modello](https://openrouter.ai/microsoft/microsoft-decision-1.1)

Microsoft Foundry espone una propria rotta System One e usa un nome di deployment. Serve come riferimento per la semantica delle domande. Il playground usa l’ID pubblico e l’autenticazione OpenRouter. [Microsoft Learn](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-microsoft-decision#call-the-decision-api)

## Prove live del 18 novembre

Quattro chiamate autenticate con `OPEN_ROUTER_API_KEY` letta dalle variabili utente di Windows. Input sintetici in italiano. Tutte le richieste hanno ottenuto HTTP 200 da Azure, costo complessivo riportato **0,000032466 USD**.

| Prova | Risultato osservato |
| --- | --- |
| Ticket chiaro in JSON, tre domande | `choice` Tecnico al 99,85%, `noul` 97,69% Sì per ricontatto, `score` 2,999 su scala 0–3. |
| Ticket ambiguo in testo, stesse tre domande | Tecnico al 53,26%, Fatturazione al 39,00%, `confidence` della scelta 37,68%. |
| PNG 320 × 320 con testo | Rosso al 99,97% e Sì al 95,45% alla domanda «È un cerchio?». |
| Pagina minima su localhost in Edge | Il browser ha letto HTTP 200 via CORS con la chiave e HTTP 401 senza autenticazione. Preflight HTTP 204 con POST, Authorization e Content-Type consentiti. |

I valori sono osservazioni puntuali. I test di rilascio verificano struttura e comportamento, usando risposte campione per le asserzioni numeriche esatte.

## Requisiti MVP

1. **Esempi pronti.** Ticket chiaro per smistamento, gravità e ricontatto in una chiamata. Variante ambigua per confrontare la distribuzione. Immagine dimostrativa locale per riconoscere colore e forma. Il pulsante **Guarda un risultato di esempio** mostra il risultato registrato abbinato all’input originale e lo etichetta come tale. **Esegui decisione** avvia una prova live.
2. **Contesto modificabile.** L’editor accetta testo, JSON oppure da una a otto immagini con testo opzionale. Mostrare anteprima, dimensioni e rimozione per ciascuna immagine. Segnalare formato, dimensioni, conteggio e JSON invalido prima dell’invio. In modalità JSON accettare oggetti e array.
3. **Domande configurabili.** Aggiungere, modificare e rimuovere domande miste sullo stesso contesto. Ogni scheda mantiene un ID univoco stabile. Richiedere almeno una domanda, istruzioni non vuote, opzioni univoche e almeno due livelli per il punteggio. Mantenere l’ordine impostato dall’utente per domande e livelli.
4. **Chiave manuale.** Campo mascherato con mostra/nascondi e rimozione esplicita. Conservare la chiave solo nella pagina corrente. Il reload richiede un nuovo inserimento. Inviare la chiave solo nell’header di autenticazione verso OpenRouter. La variabile utente è riservata alle prove da terminale.
5. **Esecuzione.** Inviare una sola richiesta per azione esplicita. Mostrare stato di invio, bloccare invii concorrenti e offrire annullamento locale e timeout. Gli errori lasciano l’editor pronto per una correzione o un nuovo invio manuale. La pagina indica che testo e immagini vengono inviati a OpenRouter per la prova live.
6. **Risultati leggibili.** Una scheda per domanda, con valori numerici accanto alle barre. Associare i risultati a una copia immutabile dell’input inviato e segnalare se l’editor è stato modificato. Mostrare JSON di richiesta e risposta con pulsanti di copia, limitando la richiesta al corpo e tenendo la chiave fuori da viste, esportazioni, URL e log. Se mancano campi o risposte, segnalarlo nella scheda interessata e conservare le altre risposte valide.
7. **Soglia di revisione.** Valore iniziale dimostrativo 80%, variabile tra 50% e 100%. Per `noul`, evidenziare Sì o No se la relativa probabilità raggiunge la soglia. Un pari merito va in revisione. Per `choice` e `score`, confrontare la `confidence` dell’API con la soglia e indicare revisione anche quando il valore è assente. La soglia aggiorna solo la simulazione locale e l’utente può includere un’opzione esplicita «Contesto insufficiente» nei criteri di scelta.
8. **Errori azionabili.** Distinguere chiave invalida (401), crediti (402), permessi (403), modello indisponibile (404), richiesta invalida o troppo grande (400/413/422), limite di frequenza (429) e servizio (5xx). Gestire separatamente timeout, annullamento e risposta illeggibile. Per un errore di connessione indicare rete o possibile blocco del browser, dato che `fetch` può presentarli nello stesso modo.

**Estensione successiva** · Confronto affiancato di due esecuzioni per vedere come variano probabilità e confidence quando si riformulano le istruzioni o si cambia il contesto.

## Interfaccia e vincoli

- Pagina singola dal layout originale. Su desktop, editor a sinistra e risultati a destra. Su mobile, percorso in una colonna. Pulsanti etichettati, navigazione da tastiera, focus visibile, messaggi di stato leggibili da screen reader e grafici comprensibili anche in assenza di colore.
- HTML5, CSS e JavaScript vanilla, asset locali e richiesta `fetch` diretta al solo endpoint OpenRouter. File statici serviti da `http://localhost` in sviluppo o da hosting HTTPS. Il prodotto è un laboratorio a singolo modello con simulazioni locali e prova live su richiesta.
- Input, risposte e chiave restano in memoria sul browser. Nessuna telemetria del sito. Trattare contenuti e output dell’API come testo quando si inseriscono nella pagina. L’utente può copiare il JSON su richiesta.

## Piano di implementazione

Il progetto parte da una cartella vuota. I file seguenti sono previsti per l’implementazione.

| Fase | File | Consegna verificabile |
| --- | --- | --- |
| 1. Editor e contratto | `D:/repos/decisionplayground/index.html`, `D:/repos/decisionplayground/app.js` | Form in italiano, costruzione e validazione di `state` e `questions`, anteprima JSON con immagini locali. |
| 2. Esempi e trasporto | `D:/repos/decisionplayground/examples.js`, `D:/repos/decisionplayground/api.js` | Preset e risposte registrate. In parallelo, chiamata diretta con gestione timeout, annullamento ed errori. I due lavori condividono il contratto definito nella fase 1. |
| 3. Risultati e verifica | `D:/repos/decisionplayground/app.js`, `D:/repos/decisionplayground/styles.css` | Risultati per tipo, soglia, diagnostica, stati vuoti e caricamento, layout responsive. Dipende dalle fasi precedenti. |

## Criteri di accettazione

| Caso | Verifica |
| --- | --- |
| Primo utilizzo | Il preset ticket produce tre schede in un solo POST. La prova registrata funziona senza chiave e senza richieste a OpenRouter. |
| Input multimodale | PNG e JPEG validi generano parti `image_url`. Un formato incompatibile, un lato fuori intervallo o una nona immagine fermano l’invio con un messaggio sul campo. |
| Contratto e interpretazione | Testare testo e JSON, ID distinti e risposte in ordine diverso. Con P(Sì) 0,20 si vede P(No) 0,80. Con scelta 53,26% e `confidence` 37,68% si leggono entrambi i valori. Un `score` decimale resta tale. |
| Soglia | Con `confidence` 0,82, cambiare soglia da 80% a 90% passa da «Soglia raggiunta» a «Da rivedere», con zero chiamate aggiuntive. Una risposta assente ha uno stato dedicato. |
| Errori e avanzamento | Simulare input invalido, gli stati HTTP sopra elencati, un timeout e una risposta parziale. Il doppio clic produce un solo POST. L’annullamento impedisce a una risposta tardiva di aggiornare l’interfaccia. |
| Chiave e origine | Provare da localhost e dall’origine HTTPS scelta prima del rilascio. Verificare che la credenziale compaia solo nell’header della richiesta OpenRouter e che il reload azzeri il campo. |
| Usabilità | Completare il preset da tastiera e da uno schermo largo 360 px. Verificare che scelte, percentuali, costo e stato siano leggibili e copiare i due JSON. |
