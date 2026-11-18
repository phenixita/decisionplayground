import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDecisionRunner } from '../api.js';
import { buildPayload, interpretAnswer } from '../decision.js';
import { makeExample, recordedExample } from '../examples.js';

function ticketDraft(mode = 'text') {
  return {
    mode,
    context: { text: 'Terza segnalazione.', json: '{"contatti":3}', images: '' },
    images: [{ url: 'data:image/png;base64,AAA' }],
    questions: [
      { id: 'team', type: 'choice', instructions: 'A chi?', criteria: [
        { key: 'tech', description: 'Tecnico' }, { key: 'billing', description: 'Fatturazione' },
      ] },
      { id: 'level', type: 'score', instructions: 'Quanto grave?', criteria: ['Minima', 'Alta'] },
      { id: 'repeat', type: 'noul', instructions: 'È un ricontatto?', criteria: ['', ''] },
    ],
  };
}

test('serializes all input modes and preserves question IDs and criterion order', () => {
  const draft = ticketDraft();
  const ticket = buildPayload(draft);
  assert.equal(ticket.model, 'microsoft/microsoft-decision-1.1');
  assert.equal(ticket.state, 'Terza segnalazione.');
  assert.deepEqual(ticket.questions.team.criteria, { tech: 'Tecnico', billing: 'Fatturazione' });
  assert.equal(Object.hasOwn(ticket.questions.repeat, 'criteria'), false);

  draft.mode = 'json';
  assert.deepEqual(buildPayload(draft).state, { contatti: 3 });
  draft.context.json = '[1, {"contatti":3}]';
  assert.deepEqual(buildPayload(draft).state, [1, { contatti: 3 }]);
  draft.questions.reverse();
  draft.questions[1].criteria.reverse();
  assert.deepEqual(Object.keys(buildPayload(draft).questions), ['repeat', 'level', 'team']);
  assert.deepEqual(buildPayload(draft).questions.level.criteria, ['Alta', 'Minima']);

  draft.mode = 'images';
  const image = { type: 'image_url', image_url: { url: draft.images[0].url } };
  assert.deepEqual(buildPayload(draft).state, [image]);
  draft.context.images = 'Foto';
  assert.deepEqual(buildPayload(draft).state, ['Foto', image]);
});

test('validates JSON, media count, question instructions and criteria', () => {
  const draft = ticketDraft('json');
  draft.context.json = '{';
  assert.throws(() => buildPayload(draft), /Correggi il JSON/);
  draft.context.json = '123';
  assert.throws(() => buildPayload(draft), /oggetto o un array/);
  draft.mode = 'images';
  draft.images = new Array(9).fill(draft.images[0]);
  assert.throws(() => buildPayload(draft), /da 1 a 8/);
  draft.mode = 'text';
  draft.questions[0].criteria[1].key = 'tech';
  assert.throws(() => buildPayload(draft), /identificatore diverso/);
  draft.questions.shift();
  draft.questions[0].criteria = ['Minima', ''];
  assert.throws(() => buildPayload(draft), /due livelli/);
  draft.questions.shift();
  draft.questions[0].criteria = ['Terzo contatto', ''];
  assert.throws(() => buildPayload(draft), /entrambi i criteri/);
  draft.questions[0].criteria[1] = 'Primo contatto';
  assert.deepEqual(buildPayload(draft).questions.repeat.criteria, { true: 'Terzo contatto', false: 'Primo contatto' });
  draft.questions[0].instructions = ' ';
  assert.throws(() => buildPayload(draft), /Scrivi le istruzioni/);
});

test('interprets binary and score answers, including ties and missing fields', () => {
  const payload = buildPayload(ticketDraft());
  const binary = interpretAnswer(payload.questions.repeat, { type: 'noul', noul: 0.2 }, 0.8);
  assert.equal(binary.winner, 'No');
  assert.equal(binary.rows[1].value, 0.8);
  assert.equal(binary.passed, true);
  assert.equal(interpretAnswer(payload.questions.repeat, { type: 'noul', noul: 0.5 }, 0.5).passed, false);
  assert.equal(interpretAnswer(payload.questions.repeat, {}, 0.8), null);

  const scoreAnswer = { type: 'score', score: 0.82, probabilities: { 1: 0.82 }, confidence: 0.82 };
  const score = interpretAnswer(payload.questions.level, scoreAnswer, 0.8);
  assert.equal(score.score, 0.82);
  assert.equal(score.winner, 'Alta');
  assert.equal(score.incomplete, true);
  assert.equal(score.passed, true);
  assert.equal(interpretAnswer(payload.questions.level, scoreAnswer, 0.9).passed, false);
});

test('uses API confidence separately from the selected option probability', () => {
  const { questions } = makeExample('ambiguous');
  const { answers } = recordedExample('ambiguous');
  const choice = interpretAnswer(questions.reparto, answers.reparto, 0.5);
  assert.equal(choice.winner, 'tecnico');
  assert.ok(choice.rows[0].value > 0.5);
  assert.ok(choice.confidence < 0.5);
  assert.equal(choice.passed, false);
  const { confidence, ...partial } = answers.reparto;
  assert.equal(interpretAnswer(questions.reparto, partial, 0.5).passed, false);
  assert.equal(interpretAnswer(questions.gravita, answers.gravita, 0.8).passed, true);
});

test('the three recorded responses match their original question IDs', () => {
  for (const id of ['clear', 'ambiguous', 'image']) {
    const payload = makeExample(id);
    const response = recordedExample(id);
    assert.deepEqual(new Set(Object.keys(response.answers)), new Set(Object.keys(payload.questions)));
    assert.ok(Object.entries(payload.questions).every(([id, question]) =>
      interpretAnswer(question, response.answers[id], 0.8)));
  }
});

test('sends once, rejects duplicate runs, and accepts a fresh run after cancellation', async () => {
  const payload = makeExample('clear');
  const key = 'sk-or-v1-example-token';
  const calls = [];
  const runner = createDecisionRunner({
    fetchRequest(url, options) {
      return new Promise(resolve => calls.push({ url, options, resolve }));
    },
  });

  const first = runner.run(payload, key);
  assert.equal(runner.run(payload, key), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${key}`);
  assert.equal(calls[0].options.body.includes(key), false);
  runner.cancel();
  await assert.rejects(first, { code: 'cancelled' });
  assert.equal(calls[0].options.signal.aborted, true);

  const second = runner.run(payload, key);
  calls[0].resolve(Response.json({ id: 'late', answers: {} }));
  calls[1].resolve(Response.json({ id: 'current', answers: {}, note: key }));
  assert.deepEqual(await second, { id: 'current', answers: {}, note: '[chiave rimossa]' });
});

test('interrupts a stalled fetch and a stalled response body', async () => {
  const payload = makeExample('clear');
  const never = new Promise(() => {});
  for (const fetchRequest of [() => never, async () => ({ ok: true, json: () => never })]) {
    const runner = createDecisionRunner({ fetchRequest, timeoutMs: 5 });
    await assert.rejects(runner.run(payload, 'test-key'), { code: 'timeout' });
  }
});

test('identifies HTTP failures, network failure and invalid JSON', async () => {
  const payload = makeExample('clear');
  for (const status of [400, 401, 402, 403, 404, 413, 422, 429, 500]) {
    const runner = createDecisionRunner({ fetchRequest: async () => new Response(null, { status }) });
    await assert.rejects(runner.run(payload, 'test-key'), { code: status });
  }
  const offline = createDecisionRunner({ fetchRequest: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.run(payload, 'test-key'), { code: 'connection' });
  const invalid = createDecisionRunner({ fetchRequest: async () => new Response('invalid JSON') });
  await assert.rejects(invalid.run(payload, 'test-key'), { code: 'response' });
});
