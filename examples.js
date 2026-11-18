import { MODEL } from './decision.js';
import { recordings } from './recordings.js';

const ticketQuestions = {
  reparto: {
    type: 'choice',
    instructions: 'Quale reparto deve prendere in carico il problema principale?',
    criteria: {
      tecnico: 'Guasti, interruzioni e malfunzionamenti del software',
      fatturazione: 'Addebiti, fatture o rimborsi',
      account: 'Accesso al profilo o alle credenziali',
      revisione: 'Il contesto è insufficiente per scegliere un reparto',
    },
  },
  gravita: {
    type: 'score',
    instructions: 'Quanto è grave la segnalazione del checkout?',
    criteria: [
      'Minima: difetto cosmetico',
      'Bassa: esiste una soluzione alternativa',
      'Alta: blocca una parte dei clienti',
      'Critica: checkout bloccato per tutti',
    ],
  },
  ripetuto: {
    type: 'noul',
    instructions: 'Il cliente ha già contattato il supporto prima di questo messaggio?',
  },
};

export const examples = {
  clear: {
    state: {
      messaggio: 'Il checkout non funziona per nessun cliente. È già la terza segnalazione e non esistono soluzioni alternative.',
      contatti: 3,
    },
    questions: ticketQuestions,
  },
  ambiguous: {
    state: 'Con il mio account il checkout fallisce sul profilo aziendale. Ho ricevuto anche un avviso sul pagamento, ma non so quale sia la causa.',
    questions: ticketQuestions,
  },
  image: {
    state: 'Disegno di prova su sfondo bianco.',
    questions: {
      colore: {
        type: 'choice',
        instructions: 'Di che colore è la figura sullo sfondo bianco?',
        criteria: { rosso: 'Rosso', verde: 'Verde', blu: 'Blu' },
      },
      forma: { type: 'noul', instructions: 'La figura al centro è un cerchio?' },
    },
  },
};

export function makeExample(id) {
  const example = examples[id];
  const state = id === 'image' ? [
    example.state,
    { type: 'image_url', image_url: { url: recordings.imageDataUrl } },
  ] : example.state;
  return structuredClone({ model: MODEL, state, questions: example.questions });
}

export function recordedExample(id) {
  return structuredClone(recordings.responses[id]);
}
