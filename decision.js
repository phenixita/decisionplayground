export const MODEL = 'microsoft/microsoft-decision-1.1';
export const MAX_IMAGES = 8;
export const MIN_IMAGE_SIDE = 280;
export const MAX_IMAGE_SIDE = 1568;

export const QUESTION_TYPES = {
  noul: 'Sì/no',
  choice: 'Scelta',
  score: 'Punteggio',
};

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildPayload(draft) {
  const content = draft.context[draft.mode].trim();
  let state = content;
  if (draft.mode === 'json') {
    try {
      state = JSON.parse(content);
    } catch {
      throw new Error('Correggi il JSON del contesto.');
    }
    if (!isRecord(state) && !Array.isArray(state)) {
      throw new Error('Inserisci un oggetto o un array JSON.');
    }
  } else if (draft.mode === 'images') {
    if (draft.images.length < 1 || draft.images.length > MAX_IMAGES) {
      throw new Error('Aggiungi da 1 a 8 immagini.');
    }
    state = content ? [content] : [];
    state.push(...draft.images.map(({ url }) => ({ type: 'image_url', image_url: { url } })));
  } else if (!content) {
    throw new Error('Inserisci il testo da valutare.');
  }

  if (!draft.questions.length) throw new Error('Aggiungi almeno una domanda.');
  const questions = draft.questions.map(({ id, type, instructions, criteria }, index) => {
    const prefix = `Domanda ${index + 1}`;
    if (!instructions.trim()) throw new Error(`${prefix}. Scrivi le istruzioni.`);
    const question = { type, instructions: instructions.trim() };
    if (type === 'choice') {
      const options = criteria.map(({ key, description }) => [key.trim(), description.trim()]);
      if (options.length < 2 || options.some(([key, description]) => !key || !description)) {
        throw new Error(`${prefix}. Compila almeno due opzioni con identificatore e descrizione.`);
      }
      if (new Set(options.map(([key]) => key)).size !== options.length) {
        throw new Error(`${prefix}. Usa un identificatore diverso per ogni opzione.`);
      }
      question.criteria = Object.fromEntries(options);
    }
    if (type === 'score') {
      const levels = criteria.map(level => level.trim());
      if (levels.length < 2 || levels.some(level => !level)) {
        throw new Error(`${prefix}. Compila almeno due livelli della scala.`);
      }
      question.criteria = levels;
    }
    if (type === 'noul' && criteria?.some(value => value.trim())) {
      const [yes, no] = criteria.map(value => value.trim());
      if (!yes || !no) throw new Error(`${prefix}. Compila entrambi i criteri Sì e No.`);
      question.criteria = { true: yes, false: no };
    }
    return [id, question];
  });
  return { model: MODEL, state, questions: Object.fromEntries(questions) };
}

function probability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function interpretAnswer(question, answer, threshold) {
  if (!isRecord(answer) || answer.type !== question.type) return null;

  if (question.type === 'noul') {
    const yes = probability(answer.noul);
    if (yes === null) return null;
    const no = 1 - yes;
    const winner = yes === no ? null : yes > no ? 'Sì' : 'No';
    return {
      winner,
      rows: [{ label: 'Sì', value: yes }, { label: 'No', value: no }],
      confidence: null,
      passed: winner !== null && Math.max(yes, no) >= threshold,
      incomplete: false,
    };
  }

  const confidence = probability(answer.confidence);
  const probabilities = isRecord(answer.probabilities) ? answer.probabilities : {};
  const result = { confidence, passed: confidence !== null && confidence >= threshold };
  if (question.type === 'choice') {
    const winner = typeof answer.choice === 'string' && Object.hasOwn(question.criteria, answer.choice)
      ? answer.choice : null;
    const rows = Object.keys(question.criteria).map(label => ({
      label, value: probability(probabilities[label]),
    }));
    return {
      ...result,
      winner,
      rows,
      incomplete: !winner || rows.some(row => row.value === null),
      passed: result.passed && winner !== null,
    };
  }

  const legend = isRecord(answer.legend) ? answer.legend : {};
  const score = Number.isFinite(answer.score) ? answer.score : null;
  const rows = question.criteria.map((level, index) => ({
    label: typeof legend[index] === 'string' ? legend[index] : level,
    value: probability(probabilities[index]),
  }));
  const highest = Math.max(...rows.map(row => row.value ?? -1));
  const winners = rows.filter(row => row.value === highest).map(row => row.label);
  return {
    ...result,
    score,
    winner: winners.join(' · ') || null,
    rows,
    incomplete: score === null || rows.some(row => row.value === null),
    passed: result.passed && score !== null,
  };
}
