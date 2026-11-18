import { isRecord } from './decision.js';

const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';

const statusMessages = {
  400: 'OpenRouter ha rifiutato la richiesta. Controlla contesto e domande.',
  401: 'Chiave OpenRouter mancante, non valida o scaduta.',
  402: 'Crediti OpenRouter insufficienti o limite di spesa raggiunto.',
  403: 'La chiave o l’account non ha i permessi necessari.',
  404: 'Microsoft Decision 1.1 non è disponibile per questa richiesta.',
  413: 'La richiesta è troppo grande. Riduci il testo o il numero di immagini.',
  422: 'OpenRouter non ha potuto elaborare il contenuto o i criteri.',
  429: 'Troppe richieste. Attendi prima di riprovare.',
};

export class DecisionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createDecisionRunner({ fetchRequest = globalThis.fetch, timeoutMs = 30_000 } = {}) {
  let active = null;

  function run(payload, key) {
    if (active) return null;
    const controller = new AbortController();
    let interrupt;
    const interrupted = new Promise((_, reject) => { interrupt = reject; });
    const request = {
      stop(code, message) {
        interrupt(new DecisionError(code, message));
        controller.abort();
      },
    };
    active = request;
    const timer = setTimeout(() => request.stop('timeout', 'Tempo scaduto dopo 30 secondi. Puoi riprovare.'), timeoutMs);

    const send = async () => {
      let response;
      try {
        response = await fetchRequest(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
        });
      } catch {
        throw new DecisionError('connection', 'Impossibile raggiungere OpenRouter. Controlla la rete o le restrizioni del browser.');
      }
      if (!response.ok) {
        const message = statusMessages[response.status] ?? (response.status >= 500
          ? 'OpenRouter o il provider è temporaneamente indisponibile.'
          : 'OpenRouter ha rifiutato la richiesta.');
        throw new DecisionError(response.status, `${message} (HTTP ${response.status})`);
      }

      let result;
      try {
        result = await response.json();
      } catch {
        throw new DecisionError('response', 'La risposta di OpenRouter non è leggibile.');
      }
      if (!isRecord(result) || !isRecord(result.answers)) {
        throw new DecisionError('response', 'La risposta di OpenRouter non contiene decisioni leggibili.');
      }
      const json = JSON.stringify(result);
      const escapedKey = JSON.stringify(key).slice(1, -1);
      return escapedKey && json.includes(escapedKey)
        ? JSON.parse(json.replaceAll(escapedKey, '[chiave rimossa]'))
        : result;
    };

    return Promise.race([send(), interrupted]).finally(() => {
      clearTimeout(timer);
      active = null;
    });
  }

  return {
    run,
    cancel() {
      active?.stop('cancelled', 'Esecuzione annullata.');
    },
  };
}
