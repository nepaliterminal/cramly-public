import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CASH_APP_PAYMENT_LINK, PAYPAL_EMAIL, STRIPE_PAYMENT_LINK } from '../docs/config.js';
import { generateOffline, generateStudySet, parseStudySet } from '../docs/generator.js';
import { dailyCount, exportCSV, isPro, recordGeneration, redeemCode, scoreQuiz } from '../docs/study-data.js';

const notes = 'A cell is the basic unit of life. The nucleus is the control center. Mitochondria are organelles that supply energy. Ribosomes are structures that build proteins.';
const fixture = {
  flashcards: [{ front: 'What is a cell?', back: 'Basic unit of life' }],
  quiz: [{ question: 'What is a cell?', choices: ['Unit of life', 'Tissue', 'Organ', 'Organism'], answerIndex: 0, explanation: 'Cells make up living things.' }],
};

test('keeps personal payment destinations out of the public configuration while checkout is closed', async () => {
  assert.equal(CASH_APP_PAYMENT_LINK, '');
  assert.equal(PAYPAL_EMAIL, '');
  assert.equal(STRIPE_PAYMENT_LINK, '');
  const page = await readFile(new URL('../docs/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /cash\.app\/\$|\$[a-z_]+\b/i);
  assert.match(page, /id="cash-app-link"[^>]*>Pay with Cash App/);
  assert.match(page, /id="paypal-link"[^>]*>Open PayPal/);
  assert.match(page, /id="stripe-link"[^>]*>Pay with Stripe/);
});

test('normalizes fenced AI output, rejects invalid items, and respects the limit', () => {
  const response = { flashcards: [null, ...fixture.flashcards, ...fixture.flashcards],
    quiz: [{ ...fixture.quiz[0], choices: ['A', 'a', 'C', 'D'] }, ...fixture.quiz, ...fixture.quiz] };
  assert.deepEqual(parseStudySet('```json\n' + JSON.stringify(response) + '\n```', 1), fixture);
  assert.throws(() => parseStudySet('{"flashcards":[]}', 5), /usable study set/);
});

test('builds definition and cloze cards and grades four distinct choices offline', () => {
  const { flashcards, quiz } = generateOffline(notes + ' Chloroplasts capture sunlight.', 10, () => 0.5);
  assert.ok(flashcards.some(({ back }) => back === 'the basic unit of life.'));
  assert.ok(flashcards.some(({ front, back }) => front.includes('___') && back === 'Chloroplasts'));
  assert.ok(quiz.length >= 4);
  assert.ok(quiz.every(({ choices }) => choices.length === 4 && new Set(choices).size === 4));
  const concepts = ['A cell', 'The nucleus', 'Mitochondria', 'Ribosomes'];
  assert.ok(quiz.every(({ choices }) => choices.every((choice) => concepts.includes(choice))));
  assert.equal(scoreQuiz(quiz, quiz.map(({ answerIndex }) => answerIndex)), quiz.length);
  assert.equal(scoreQuiz(quiz, []), 0);
});

test('uses fewer choices instead of padding with words or a different answer type', () => {
  const sparseNotes = 'Photosynthesis is how plants turn light into energy. ' +
    'Chlorophyll is the green pigment. Stomata are pores that let gases out. 1776: independence.';
  const { quiz } = generateOffline(sparseNotes, 10, () => 0.5);
  const expected = ['Chlorophyll', 'Photosynthesis', 'Stomata'];
  assert.equal(quiz.length, expected.length);
  assert.deepEqual(quiz.map(({ choices, answerIndex }) => choices[answerIndex]).sort(), expected);
  assert.ok(quiz.every(({ choices }) => choices.length === 3 && choices.every((choice) => expected.includes(choice))));
});

test('rejects filler choices and remaps the correct answer when validating a cloud question', () => {
  const set = {
    ...fixture,
    quiz: [{
      question: 'Which term describes the control center?',
      choices: ['structures', 'Nucleus', 'proteins', 'Ribosomes'],
      answerIndex: 1,
    }],
  };
  assert.deepEqual(parseStudySet(JSON.stringify(set), 10, notes).quiz, [{
    question: set.quiz[0].question,
    choices: ['Nucleus', 'Ribosomes'],
    answerIndex: 0,
    explanation: '',
  }]);
  set.quiz[0].choices[3] = 'Organism';
  assert.throws(() => parseStudySet(JSON.stringify(set), 10, notes), /usable study set/);
});

test('retains short valid decks even when notes provide no plausible wrong answers', () => {
  assert.deepEqual(generateOffline('Ice is cold.', 10), {
    flashcards: [{ front: 'What is Ice?', back: 'cold.' }], quiz: [],
  });
});

test('sends the Gemini key as a header and normalizes the result', async () => {
  const grounded = { ...fixture, quiz: [{
    question: 'Which term describes the control center?',
    choices: ['The nucleus', 'Mitochondria'],
    answerIndex: 0,
    explanation: 'The nucleus is the control center.',
  }] };
  const result = await generateStudySet(notes, { limit: 10, provider: 'gemini', geminiKey: 'fake-key', fetcher: async (url, options) => {
    assert.match(url, /gemini-2\.5-flash:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'], 'fake-key');
    assert.match(options.body, /Mitochondria/);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(grounded) }] } }] }) };
  } });
  assert.deepEqual(result, { ...grounded, source: 'gemini' });
});

test('uses local generation if Pollinations or Gemini fails', async () => {
  const blocked = await generateStudySet(notes, { limit: 3, provider: 'pollinations', fetcher: async (url) => {
    assert.equal(url, 'https://text.pollinations.ai/openai');
    return { ok: false, status: 403 };
  } });
  assert.equal(blocked.source, 'fallback');
  assert.equal(blocked.flashcards.length, 3);
  const offline = await generateStudySet(notes, { limit: 3, provider: 'gemini', geminiKey: 'fake-key',
    fetcher: async () => { throw new Error('Offline'); } });
  assert.equal(offline.source, 'fallback');
  assert.equal(offline.flashcards.length, 3);
  const junk = await generateStudySet(notes, { limit: 3, provider: 'pollinations', fetcher: async () => ({
    ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(fixture) } }] }),
  }) });
  assert.equal(junk.source, 'fallback');
  assert.equal(junk.quiz.length, 3);
});

test('resets generation usage on the next local calendar day', () => {
  const day = new Date(2026, 10, 22, 23, 59);
  const usage = recordGeneration(recordGeneration(null, day), day);
  assert.equal(dailyCount(usage, day), 2);
  assert.equal(dailyCount(usage, new Date(2026, 10, 23)), 0);
});

test('redeems a valid code once on this browser for 31 days', async () => {
  const hash = createHash('sha256').update('CRAMLY-TEST').digest('hex');
  const result = await redeemCode(' cramly-test ', [hash], [], 1_000);
  assert.deepEqual(result, { hash, expiresAt: 1_000 + 31 * 86_400_000 });
  assert.ok(isPro(result, result.expiresAt - 1));
  assert.equal(isPro(result, result.expiresAt), false);
  assert.equal(await redeemCode('CRAMLY-TEST', [hash], [hash]), null);
  assert.equal(await redeemCode('CRAMLY-OTHER', [hash]), null);
});

test('escapes multiline CSV and neutralizes spreadsheet formulas', () => {
  assert.equal(exportCSV([{ front: 'What is "life"?', back: '=A1\nB' }]), '"Front","Back"\r\n"What is ""life""?","\'=A1\nB"');
});
