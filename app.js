import { createDecisionRunner } from './api.js';
import { buildPayload, interpretAnswer, MAX_IMAGES, MAX_IMAGE_SIDE, MIN_IMAGE_SIDE, QUESTION_TYPES } from './decision.js';
import { makeExample, recordedExample } from './examples.js';

const find = id => document.getElementById(id);
const runner = createDecisionRunner();
const questions = find('questions');
const context = find('context');
const imageInput = find('images');
const keyDialog = find('key-dialog');
const keyInput = find('api-key');
const percent = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'USD', maximumFractionDigits: 12 });
const contextLabels = { text: 'Testo da valutare', json: 'Contenuto JSON', images: 'Testo di accompagnamento (facoltativo)' };

let apiKey = '';
let selectedPreset = 'clear';
let draft;
let revision = 0;
let nextQuestion = 1;
let result;
let running = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, action, accessibleLabel, disabled = false) {
  const control = node('button', accessibleLabel ? 'button button-secondary icon-button' : 'button button-text criteria-add', label);
  control.type = 'button';
  control.dataset.action = action;
  control.disabled = disabled;
  if (accessibleLabel) {
    control.setAttribute('aria-label', accessibleLabel);
    control.title = accessibleLabel;
  }
  return control;
}

function field(label, id, value, property, index) {
  const wrapper = node('div');
  const caption = node('label', 'field-label', label);
  const input = node('input');
  caption.htmlFor = id;
  input.id = id;
  input.type = 'text';
  input.value = value;
  input.dataset.field = property;
  if (index !== undefined) input.dataset.index = index;
  wrapper.append(caption, input);
  return wrapper;
}

function feedback(element, message = '', error = false) {
  element.hidden = !message;
  element.textContent = message;
  element.toggleAttribute('data-error', error);
}

function editorChanged() {
  revision += 1;
  find('modified').hidden = !result || result.revision === revision;
}

function loadPreset(id) {
  const { state, questions: source } = makeExample(id);
  const mode = id === 'image' ? 'images' : typeof state === 'string' ? 'text' : 'json';
  draft = {
    mode,
    context: {
      text: mode === 'text' ? state : '',
      json: mode === 'json' ? JSON.stringify(state, null, 2) : '',
      images: mode === 'images' ? state[0] : '',
    },
    images: mode === 'images' ? [{ name: 'cerchio-rosso.png', width: 320, height: 320, url: state[1].image_url.url }] : [],
    imageError: '',
    uploading: false,
    questions: Object.entries(source).map(([id, { type, instructions, criteria }]) => ({
      id, type, instructions,
      criteria: type === 'choice'
        ? Object.entries(criteria).map(([key, description]) => ({ key, description }))
        : type === 'noul' ? [criteria?.true ?? '', criteria?.false ?? ''] : criteria,
    })),
  };
  selectedPreset = id;
  editorChanged();
  document.querySelectorAll('[data-preset]').forEach(control => {
    control.setAttribute('aria-pressed', String(control.dataset.preset === id));
  });
  renderContext();
  renderQuestions();
}

function renderContext() {
  document.querySelectorAll('[name="context-mode"]').forEach(control => {
    control.checked = control.value === draft.mode;
  });
  context.dataset.mode = draft.mode;
  context.value = draft.context[draft.mode];
  find('context-label').textContent = contextLabels[draft.mode];
  find('images-panel').hidden = draft.mode !== 'images';
  renderImages();
}

function renderImages() {
  imageInput.disabled = draft.uploading;
  find('discard-images').hidden = !draft.imageError;
  feedback(find('image-feedback'), draft.uploading ? 'Verifica delle immagini in corso…' : draft.imageError, Boolean(draft.imageError));
  const list = draft.images.map(({ name, width, height, url }, index) => {
    const row = node('li', 'image-item');
    const image = node('img');
    image.src = url;
    image.alt = '';
    const details = node('div', 'hint');
    details.append(node('strong', '', name), document.createTextNode(`${width} × ${height} px`));
    const remove = button('×', 'remove-image', `Rimuovi ${name}`);
    remove.dataset.index = index;
    row.append(image, details, remove);
    return row;
  });
  find('image-list').replaceChildren(...list);
}

async function readImage(file) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new Error(`${file.name}. Seleziona un file PNG o JPEG.`);

  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', reject, { once: true });
    reader.readAsDataURL(new Blob([file], { type: png ? 'image/png' : 'image/jpeg' }));
  });
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    throw new Error(`${file.name}. Non è possibile leggere l’immagine.`);
  }
  const { naturalWidth: width, naturalHeight: height } = image;
  if ([width, height].some(side => side < MIN_IMAGE_SIDE || side > MAX_IMAGE_SIDE)) {
    throw new Error(`${file.name} misura ${width} × ${height} px. Ogni lato deve misurare da 280 a 1.568 px.`);
  }
  return { name: file.name, width, height, url };
}

function renderQuestion(question, index) {
  const { id, type, instructions, criteria } = question;
  const position = index + 1;
  const card = node('section', 'question-editor');
  card.dataset.question = id;
  const top = node('div', 'question-top');
  const title = node('h3', '', `Domanda ${position}`);
  title.id = `${id}-title`;
  card.setAttribute('aria-labelledby', title.id);
  const select = node('select');
  select.dataset.field = 'type';
  select.setAttribute('aria-label', `Tipo della domanda ${position}`);
  for (const [value, label] of Object.entries(QUESTION_TYPES)) {
    const option = node('option', '', label);
    option.value = value;
    select.append(option);
  }
  select.value = type;
  const tools = node('div', 'question-tools');
  tools.append(
    button('↑', 'question-up', `Sposta su la domanda ${position}`, index === 0),
    button('↓', 'question-down', `Sposta giù la domanda ${position}`, index === draft.questions.length - 1),
    button('×', 'remove-question', `Rimuovi domanda ${position}`),
  );
  top.append(title, select, tools);
  card.append(top, field('Istruzioni', `${id}-instructions`, instructions, 'instructions'));

  if (type === 'noul') {
    const details = node('details', 'noul-details');
    details.open = criteria.some(Boolean);
    details.append(
      node('summary', '', 'Criteri sì/no facoltativi'),
      field('Criterio per Sì', `${id}-yes`, criteria[0], 'criterion', 0),
      field('Criterio per No', `${id}-no`, criteria[1], 'criterion', 1),
    );
    card.append(details);
    return card;
  }

  const choice = type === 'choice';
  card.append(node('p', 'hint criterion-caption', choice ? 'Opzioni di scelta' : 'Livelli dal minore al maggiore'));
  criteria.forEach((criterion, index) => {
    const row = node('div', choice ? 'criterion-row choice-row' : 'criterion-row');
    const number = index + 1;
    if (choice) {
      row.append(
        field(`ID opzione ${number}`, `${id}-key-${index}`, criterion.key, 'key', index),
        field('Descrizione', `${id}-description-${index}`, criterion.description, 'description', index),
      );
    } else {
      row.append(field(`Livello ${index}`, `${id}-level-${index}`, criterion, 'criterion', index));
    }
    const controls = node('div', 'criterion-tools');
    if (!choice) controls.append(
      button('↑', 'criterion-up', `Sposta su il livello ${index}`, index === 0),
      button('↓', 'criterion-down', `Sposta giù il livello ${index}`, index === criteria.length - 1),
    );
    controls.append(button('×', 'remove-criterion', choice ? `Rimuovi opzione ${number}` : `Rimuovi livello ${index}`, criteria.length <= 2));
    controls.querySelectorAll('button').forEach(control => { control.dataset.index = index; });
    row.append(controls);
    card.append(row);
  });
  card.append(button(choice ? '+ Aggiungi opzione' : '+ Aggiungi livello', 'add-criterion'));
  return card;
}

function renderQuestions(focusId, field = 'instructions', index) {
  questions.replaceChildren(...draft.questions.map(renderQuestion));
  if (!focusId) return;
  const card = questions.querySelector(`[data-question="${focusId}"]`);
  const selector = `[data-field="${field}"]${index === undefined ? '' : `[data-index="${index}"]`}`;
  (card?.querySelector(selector) ?? find('add-question')).focus();
}

function defaultCriteria(type) {
  return type === 'choice' ? [{ key: '', description: '' }, { key: '', description: '' }] : ['', ''];
}

function formatPercent(value) {
  if (value === null) return '—';
  if (value > 0 && value < 0.0001) return '<0,01%';
  if (value < 1 && value > 0.9999) return '>99,99%';
  return percent.format(value);
}

function renderResultCard(id, question, answer, threshold) {
  const card = node('article', 'result-card');
  card.dataset.answer = id;
  const details = interpretAnswer(question, answer, threshold);
  const heading = node('div', 'result-pills');
  heading.append(
    node('span', 'pill pill-type', QUESTION_TYPES[question.type]),
    node('span', `pill ${details?.passed ? 'pill-pass' : 'pill-review'}`, details?.passed ? 'Soglia raggiunta' : 'Da rivedere'),
  );
  card.append(heading, node('h3', '', question.instructions));
  if (!details) {
    card.append(node('p', 'hint incomplete', 'Risposta assente o non leggibile.'));
    return card;
  }

  const title = question.type === 'score'
    ? details.score === null ? 'Punteggio assente' : `${decimal.format(details.score)} / ${question.criteria.length - 1}`
    : details.winner ?? (question.type === 'noul' ? 'Pari merito' : 'Scelta assente');
  card.append(node('p', 'result-title', title));
  if (question.type === 'score' && details.winner) {
    card.append(node('p', 'hint result-extra', `Livello più probabile · ${details.winner}`));
  }
  if (question.type !== 'noul') {
    const confidence = details.confidence === null ? 'non disponibile' : formatPercent(details.confidence);
    card.append(node('p', 'hint result-extra', `Confidenza API · ${confidence}`));
  }
  const bars = node('ul', 'bars');
  for (const { label, value } of details.rows) {
    const row = node('li');
    row.toggleAttribute('data-winner', label === details.winner);
    row.append(node('span', '', label), node('strong', '', formatPercent(value)));
    if (value !== null) {
      const bar = node('progress');
      bar.max = 1;
      bar.value = value;
      bar.setAttribute('aria-hidden', 'true');
      row.append(bar);
    }
    bars.append(row);
  }
  card.append(bars);
  if (details.incomplete) card.append(node('p', 'hint incomplete', 'Risposta parziale.'));
  return card;
}

function renderResults() {
  const threshold = Number(find('threshold').value) / 100;
  find('threshold-value').textContent = percent.format(threshold);
  const { payload, response, mode } = result;
  const source = find('result-source');
  source.textContent = mode === 'live' ? 'Esecuzione live' : 'Esempio registrato';
  source.className = `pill pill-${mode}`;
  find('modified').hidden = result.revision === revision;
  find('results').replaceChildren(...Object.entries(payload.questions).map(([id, question]) =>
    renderResultCard(id, question, Object.hasOwn(response.answers, id) ? response.answers[id] : undefined, threshold)));
}

function showResult(mode, payload, response, sourceRevision) {
  result = { mode, payload, response, revision: sourceRevision };
  renderResults();
  const usage = response.usage;
  const metadata = Object.entries({
    Modello: response.model,
    Provider: response.provider,
    'Token in ingresso': usage?.input_tokens,
    'Token in uscita': usage?.output_tokens,
    'Costo riportato': Number.isFinite(usage?.cost) ? usd.format(usage.cost) : undefined,
    'ID richiesta': response.id,
  }).filter(([, value]) => typeof value === 'string' || Number.isFinite(value)).map(([label, value]) => {
    const entry = node('div');
    entry.append(node('dt', '', label), node('dd', '', value));
    return entry;
  });
  find('metadata').replaceChildren(...metadata);
  find('diagnostics').hidden = false;
  find('copy-feedback').textContent = '';
  document.querySelectorAll('[data-json][open]').forEach(renderJson);
}

function renderJson(panel) {
  const value = panel.dataset.json === 'request' ? result.payload : result.response;
  panel.querySelector('pre').textContent = JSON.stringify(value, null, 2);
}

function showExample() {
  const payload = makeExample(selectedPreset);
  let sourceRevision = -1;
  try {
    if (JSON.stringify(buildPayload(draft)) === JSON.stringify(payload)) sourceRevision = revision;
  } catch {
    // An incomplete draft can still be compared with the original example.
  }
  showResult('demo', payload, recordedExample(selectedPreset), sourceRevision);
}

function updateKeyStatus() {
  find('open-key').toggleAttribute('data-ready', Boolean(apiKey));
  find('key-label').textContent = apiKey ? 'Chiave attiva' : 'Chiave API';
}

function openKey() {
  keyInput.value = apiKey;
  keyInput.type = 'password';
  find('toggle-key').textContent = 'Mostra';
  find('forget-key').hidden = !apiKey;
  feedback(find('key-feedback'));
  keyDialog.showModal();
}

function setRunning(value) {
  running = value;
  find('run').disabled = value;
  find('sample').disabled = value;
  find('cancel').hidden = !value;
  find('run').lastChild.textContent = value ? ' Esecuzione in corso…' : ' Esegui decisione';
}

document.querySelectorAll('[data-preset]').forEach(control => control.addEventListener('click', () => {
  loadPreset(control.dataset.preset);
  if (!running) feedback(find('run-feedback'));
}));
document.querySelectorAll('[name="context-mode"]').forEach(control => control.addEventListener('change', () => {
  draft.mode = control.value;
  editorChanged();
  renderContext();
}));
context.addEventListener('input', () => {
  draft.context[draft.mode] = context.value;
  editorChanged();
});

imageInput.addEventListener('change', async () => {
  const files = Array.from(imageInput.files);
  imageInput.value = '';
  if (!files.length) return;
  if (draft.images.length + files.length > MAX_IMAGES) {
    draft.imageError = 'Puoi usare al massimo 8 immagini per richiesta.';
    renderImages();
    return;
  }

  const pendingDraft = draft;
  draft.uploading = true;
  draft.imageError = '';
  renderImages();
  const images = await Promise.allSettled(files.map(readImage));
  if (draft !== pendingDraft) return;
  draft.uploading = false;
  const rejected = images.find(image => image.status === 'rejected');
  if (rejected) {
    draft.imageError = rejected.reason instanceof Error ? rejected.reason.message : 'Non è possibile leggere la selezione.';
  } else {
    draft.images.push(...images.map(image => image.value));
    editorChanged();
  }
  renderImages();
});

find('image-list').addEventListener('click', event => {
  const control = event.target.closest('[data-action="remove-image"]');
  if (!control) return;
  draft.images.splice(Number(control.dataset.index), 1);
  draft.imageError = '';
  editorChanged();
  renderImages();
  (find('image-list').querySelector('button') ?? imageInput).focus();
});
find('discard-images').addEventListener('click', () => {
  draft.imageError = '';
  renderImages();
  imageInput.focus();
});

find('add-question').addEventListener('click', () => {
  const id = `q${nextQuestion++}`;
  draft.questions.push({ id, type: 'noul', instructions: '', criteria: defaultCriteria('noul') });
  editorChanged();
  renderQuestions(id);
});
questions.addEventListener('input', event => {
  const { field, index } = event.target.dataset;
  const id = event.target.closest('[data-question]')?.dataset.question;
  const question = draft.questions.find(item => item.id === id);
  if (!question || !field || field === 'type') return;
  const value = event.target.value;
  if (field === 'instructions') question.instructions = value;
  else if (field === 'criterion') question.criteria[index] = value;
  else question.criteria[index][field] = value;
  editorChanged();
});
questions.addEventListener('change', event => {
  if (event.target.dataset.field !== 'type') return;
  const id = event.target.closest('[data-question]').dataset.question;
  const question = draft.questions.find(item => item.id === id);
  question.type = event.target.value;
  question.criteria = defaultCriteria(question.type);
  editorChanged();
  renderQuestions(id, 'type');
});
questions.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const id = control.closest('[data-question]').dataset.question;
  const position = draft.questions.findIndex(item => item.id === id);
  const question = draft.questions[position];
  const { action } = control.dataset;
  const row = Number(control.dataset.index);
  let focus = id;
  let focusField = 'instructions';
  let focusRow;

  switch (action) {
    case 'question-up':
    case 'question-down': {
      const destination = position + (action === 'question-up' ? -1 : 1);
      draft.questions.splice(position, 1);
      draft.questions.splice(destination, 0, question);
      break;
    }
    case 'remove-question':
      draft.questions.splice(position, 1);
      focus = draft.questions[position]?.id ?? draft.questions.at(-1)?.id ?? id;
      break;
    case 'criterion-up':
    case 'criterion-down': {
      const destination = row + (action === 'criterion-up' ? -1 : 1);
      const [level] = question.criteria.splice(row, 1);
      question.criteria.splice(destination, 0, level);
      focusField = 'criterion';
      focusRow = destination;
      break;
    }
    case 'add-criterion':
    case 'remove-criterion': {
      const choice = question.type === 'choice';
      if (action === 'add-criterion') question.criteria.push(choice ? { key: '', description: '' } : '');
      else question.criteria.splice(row, 1);
      focusField = choice ? 'key' : 'criterion';
      focusRow = action === 'add-criterion' ? question.criteria.length - 1 : Math.min(row, question.criteria.length - 1);
      break;
    }
    default:
      return;
  }
  editorChanged();
  renderQuestions(focus, focusField, focusRow);
});

find('open-key').addEventListener('click', openKey);
find('close-key').addEventListener('click', () => keyDialog.close());
keyDialog.addEventListener('close', () => {
  keyInput.value = '';
  keyInput.type = 'password';
});
find('toggle-key').addEventListener('click', () => {
  const reveal = keyInput.type === 'password';
  keyInput.type = reveal ? 'text' : 'password';
  find('toggle-key').textContent = reveal ? 'Nascondi' : 'Mostra';
});
find('forget-key').addEventListener('click', () => {
  apiKey = '';
  updateKeyStatus();
  runner.cancel();
  keyDialog.close();
});
find('key-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = keyInput.value.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    feedback(find('key-feedback'), 'Inserisci la chiave OpenRouter senza spazi o virgolette.', true);
    return;
  }
  apiKey = value;
  updateKeyStatus();
  keyDialog.close();
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  apiKey = '';
  keyInput.value = '';
  updateKeyStatus();
  runner.cancel();
});

find('editor').addEventListener('submit', async event => {
  event.preventDefault();
  if (running) return;
  const status = find('run-feedback');
  let payload;
  try {
    if (draft.mode === 'images' && draft.uploading) throw new Error('Attendi la verifica delle immagini.');
    if (draft.mode === 'images' && draft.imageError) throw new Error('Correggi o scarta l’ultima selezione di immagini.');
    payload = buildPayload(draft);
    if (apiKey && JSON.stringify(payload).includes(apiKey)) throw new Error('Rimuovi la chiave API dal contesto o dalle domande.');
  } catch (error) {
    feedback(status, error.message, true);
    status.focus();
    return;
  }
  if (!apiKey) {
    openKey();
    return;
  }

  const sourceRevision = revision;
  const pending = runner.run(payload, apiKey);
  if (!pending) return;
  setRunning(true);
  feedback(status, 'Richiesta inviata a OpenRouter.');
  find('cancel').focus({ preventScroll: true });
  try {
    const response = await pending;
    showResult('live', payload, response, sourceRevision);
    feedback(status, 'Risposta ricevuta.');
    if (document.activeElement === find('cancel')) find('results-title').focus();
  } catch (error) {
    feedback(status, error.message, error.code !== 'cancelled');
    if (document.activeElement === find('cancel')) status.focus();
  } finally {
    setRunning(false);
  }
});

find('cancel').addEventListener('click', () => runner.cancel());
find('sample').addEventListener('click', () => {
  showExample();
  find('results-title').focus();
});
find('threshold').addEventListener('input', renderResults);
document.querySelectorAll('[data-json]').forEach(panel => panel.addEventListener('toggle', () => {
  if (panel.open) renderJson(panel);
}));
find('diagnostics').addEventListener('click', async event => {
  const control = event.target.closest('[data-copy]');
  if (!control) return;
  const value = control.dataset.copy === 'request' ? result.payload : result.response;
  const status = find('copy-feedback');
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    status.textContent = 'JSON copiato negli appunti.';
  } catch {
    status.textContent = 'Copia manualmente il JSON dal riquadro.';
  }
});

loadPreset(selectedPreset);
showExample();

const installButton = find('install-app');
let installPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener('click', async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  installButton.hidden = true;
  try {
    await prompt?.prompt();
  } catch {
    // The browser menu remains available if the prompt expires.
  }
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  installButton.hidden = true;
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(error => {
    console.warn('Impossibile attivare la modalità offline.', error.name);
  });
}
