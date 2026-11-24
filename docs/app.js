import { CASH_APP_PAYMENT_LINK, PAYPAL_EMAIL, PLANS, STRIPE_PAYMENT_LINK } from './config.js';
import { generateStudySet } from './generator.js';
import { dailyCount, exportCSV, isPro, recordGeneration, scoreQuiz } from './study-data.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'cramly:v1';
const example = `Photosynthesis is the process plants use to turn light energy into chemical energy.
Chlorophyll is the green pigment that absorbs light.
Chloroplasts are the structures in plant cells where photosynthesis happens.
Glucose is a sugar that stores chemical energy for the plant.
Stomata are tiny pores in leaves that allow gases to move in and out.
Cellular respiration is the process that releases energy stored in glucose.`;

let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey)) ?? {};
} catch {
  saved = {};
}
let deck = null;
let mode = 'cards';
let cardIndex = 0;
let flipped = false;
let questionIndex = 0;
let answers = [];
let generating = false;
let remoteVerified = false;

function hasPro() {
  return isPro(saved.access) && (!saved.access?.remote || remoteVerified);
}

async function refreshRemoteAccess() {
  try {
    const response = await fetch('/api/security', { cache: 'no-store' });
    if (!response.ok) return;
    const result = await response.json();
    if (!result.configured) return;
    if (!result.site) { location.reload(); return; }
    if (result.access) { saved.access = result.access; remoteVerified = true; }
    else if (saved.access?.remote) saved.access = null;
    persist(); updateUsage();
  } catch { /* Static development preview has no API. */ }
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, handler, className = 'button quiet small') {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function currentPlan() {
  return hasPro() ? PLANS.pro : PLANS.free;
}

function updateUsage() {
  const plan = currentPlan();
  const length = $('notes').value.length;
  $('note-count').textContent = length.toLocaleString() + ' / ' + plan.notes.toLocaleString();
  $('notes').setAttribute('aria-invalid', String(length > plan.notes));
  const left = Math.max(0, PLANS.free.daily - dailyCount(saved.usage));
  $('usage').textContent = plan === PLANS.pro ? 'Unlimited sets with Pro' : left + ' of 5 free sets left today';
  $('upgrade-button').textContent = plan === PLANS.pro ? 'Pro active' : 'Upgrade';
}

function updateGeneratorNotice() {
  const provider = saved.settings?.provider ?? 'pollinations';
  const providerName = provider === 'gemini' ? 'Google Gemini' : 'Pollinations';
  $('generator-notice').textContent = provider === 'offline'
    ? 'Cramly makes this set on your device.'
    : 'Cramly sends your notes to ' + providerName + '. To keep them on this device, choose Local in Settings.';
}

function resetStudy(nextDeck) {
  deck = nextDeck;
  mode = 'cards';
  cardIndex = 0;
  flipped = false;
  questionIndex = 0;
  answers = [];
  $('study-status').textContent = '';
  renderStudy();
}

function renderCards(container) {
  const { front, back } = deck.flashcards[cardIndex];
  const flip = button('', () => {
    flipped = !flipped;
    renderStudy();
    $('flip-card').focus();
  }, 'flashcard');
  flip.id = 'flip-card';
  flip.setAttribute('aria-pressed', String(flipped));
  flip.append(element('small', flipped ? 'Answer' : 'Question'), element('span', flipped ? back : front, 'card-text'),
    element('small', flipped ? 'Show question' : 'Reveal answer'));
  const pager = element('div', '', 'pager');
  for (const direction of [-1, 1]) {
    const control = button(direction === -1 ? 'Previous card' : 'Next card', () => {
      cardIndex += direction;
      flipped = false;
      renderStudy();
      $('flip-card').focus();
    });
    control.disabled = cardIndex + direction < 0 || cardIndex + direction >= deck.flashcards.length;
    if (direction === 1) pager.append(element('span', (cardIndex + 1) + ' / ' + deck.flashcards.length));
    pager.append(control);
  }
  container.append(flip, pager);
}

function renderQuiz(container) {
  const quiz = deck.quiz;
  if (!quiz.length) {
    container.append(element('p', 'Add notes with at least two related terms and their definitions to make a quiz.', 'feedback'));
    return;
  }
  if (questionIndex >= quiz.length) {
    const result = element('div', '', 'quiz-result');
    const title = element('h3', 'You scored ' + scoreQuiz(quiz, answers) + ' / ' + quiz.length);
    title.id = 'quiz-result';
    title.tabIndex = -1;
    result.append(title, element('p', 'Review your flashcards or retake the quiz.'),
      button('Retake quiz', () => {
        answers = [];
        questionIndex = 0;
        renderStudy();
        $('quiz-progress').focus();
      }));
    container.append(result);
    return;
  }
  const item = quiz[questionIndex];
  const answer = answers[questionIndex];
  const progress = element('p', 'Question ' + (questionIndex + 1) + ' of ' + quiz.length, 'quiz-heading');
  progress.id = 'quiz-progress';
  progress.tabIndex = -1;
  const form = document.createElement('form');
  const fieldset = document.createElement('fieldset');
  fieldset.append(element('legend', item.question));
  item.choices.forEach((choice, i) => {
    const label = element('label', '', 'choice');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'quiz-answer';
    radio.value = String(i);
    radio.required = true;
    radio.checked = answer === i;
    radio.disabled = answer !== undefined;
    label.append(radio, element('span', choice));
    fieldset.append(label);
  });
  form.append(fieldset);
  if (answer === undefined) {
    const submit = element('button', 'Check answer', 'button primary small');
    form.append(submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      answers[questionIndex] = Number(new FormData(form).get('quiz-answer'));
      renderStudy();
      $('quiz-feedback').focus();
    });
  } else {
    const message = answer === item.answerIndex ? 'Correct!' : 'Correct answer: ' + item.choices[item.answerIndex] + '.';
    const feedback = element('p', message + (item.explanation ? ' ' + item.explanation : ''), 'feedback');
    feedback.id = 'quiz-feedback';
    feedback.tabIndex = -1;
    form.append(feedback, button(questionIndex + 1 === quiz.length ? 'Show score' : 'Next question', () => {
      questionIndex++;
      renderStudy();
      ($('quiz-progress') || $('quiz-result')).focus();
    }, 'button primary small'));
  }
  container.append(progress, form);
}

function renderStudy() {
  $('empty').hidden = !!deck;
  $('study').hidden = !deck;
  if (!deck) return;
  const cards = mode === 'cards';
  $('cards-tab').setAttribute('aria-pressed', String(cards));
  $('quiz-tab').setAttribute('aria-pressed', String(!cards));
  const content = $('study-content');
  content.replaceChildren();
  if (cards) renderCards(content);
  else renderQuiz(content);
}

$('notes').addEventListener('input', updateUsage);
$('example').addEventListener('click', () => {
  $('notes').value = example;
  $('note-status').textContent = '';
  updateUsage();
  $('notes').focus();
});
$('upload').addEventListener('change', async ({ target }) => {
  const file = target.files[0];
  target.value = '';
  if (!file) return;
  if (!/\.(txt|md)$/i.test(file.name)) {
    $('note-status').textContent = 'Choose a .txt or .md file.';
    return;
  }
  const limit = currentPlan().notes;
  if (file.size > limit * 4) {
    $('note-status').textContent = 'This file exceeds your plan’s character limit.';
    return;
  }
  try {
    const notes = await file.text();
    if (notes.length > limit) {
      $('note-status').textContent = 'This file exceeds your plan’s character limit.';
      return;
    }
    $('notes').value = notes;
    $('note-status').textContent = 'Notes loaded from ' + file.name + '.';
    updateUsage();
  } catch {
    $('note-status').textContent = 'That file could not be read.';
  }
});
$('notes-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (generating) return;
  const plan = currentPlan();
  const status = $('note-status');
  const notes = $('notes').value.trim();
  if (!notes) {
    status.textContent = 'Add your notes first, or use the sample notes.';
    $('notes').focus();
    return;
  }
  if ($('notes').value.length > plan.notes) {
    status.textContent = 'Shorten your notes to ' + plan.notes.toLocaleString() + ' characters or fewer.';
    return;
  }
  if (dailyCount(saved.usage) >= plan.daily) {
    status.textContent = 'You’ve used today’s free sets. Come back tomorrow or upgrade to Pro.';
    return;
  }
  generating = true;
  $('generate').disabled = true;
  status.textContent = 'Making flashcards and quiz questions…';
  try {
    const set = await generateStudySet(notes, {
      limit: plan.items, provider: saved.settings?.provider ?? 'pollinations', geminiKey: saved.settings?.geminiKey,
    });
    if (plan === PLANS.free) saved.usage = recordGeneration(saved.usage);
    const retained = persist();
    resetStudy({ ...set, title: notes.split(/\r?\n/u)[0].slice(0, 72), id: crypto.randomUUID() });
    const source = { fallback: 'Cloud generator unavailable; generated locally', offline: 'Generated locally',
      gemini: 'Generated with Gemini', pollinations: 'Generated with Pollinations' };
    status.textContent = source[set.source] + ': ' + set.flashcards.length + ' flashcards, ' + set.quiz.length + ' quiz questions.' +
      (retained ? '' : ' Browser storage is unavailable.');
  } catch (error) {
    status.textContent = error.message || 'Could not create a study set.';
  } finally {
    generating = false;
    $('generate').disabled = false;
    updateUsage();
  }
});

for (const name of ['cards', 'quiz']) {
  $(name + '-tab').addEventListener('click', () => {
    mode = name;
    renderStudy();
  });
}

for (const control of document.querySelectorAll('[data-close]')) {
  control.addEventListener('click', () => control.closest('dialog').close());
}

function updateProviderField() {
  $('gemini-field').hidden = $('provider').value !== 'gemini';
}

$('settings-button').addEventListener('click', () => {
  $('provider').value = saved.settings?.provider ?? 'pollinations';
  $('gemini-key').value = saved.settings?.geminiKey ?? '';
  updateProviderField();
  $('settings-dialog').showModal();
});
$('provider').addEventListener('change', updateProviderField);
$('settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  saved.settings = { provider: $('provider').value, geminiKey: $('gemini-key').value.trim() };
  const retained = persist();
  $('settings-dialog').close();
  updateGeneratorNotice();
  $('note-status').textContent = retained ? 'Generation settings saved.' : 'Settings applied for this page only; browser storage is unavailable.';
});

function updateUpgrade() {
  const active = hasPro();
  $('upgrade-status').textContent = active
    ? 'Pro is active through ' + new Date(saved.access.expiresAt).toLocaleString() + '.'
    : saved.access ? 'Your Pro access has expired. Enter a new code to renew.' : '';
  // Keep payment collection closed until the new subscription flow is connected.
  const ready = false;
  $('checkout-notice').hidden = ready;
  $('payment-methods').hidden = !ready;
  $('cash-app-link').href = CASH_APP_PAYMENT_LINK;
  $('paypal-details').textContent = ready
    ? 'PayPal: Send $5.99 to ' + PAYPAL_EMAIL + ' with the same note.'
    : '';
  $('stripe-link').hidden = !ready || !STRIPE_PAYMENT_LINK;
  if (STRIPE_PAYMENT_LINK) $('stripe-link').href = STRIPE_PAYMENT_LINK;
}

function openUpgrade() {
  updateUpgrade();
  $('unlock-status').textContent = '';
  $('payment-status').textContent = '';
  $('upgrade-dialog').showModal();
}

$('upgrade-button').addEventListener('click', openUpgrade);
$('copy-paypal').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(PAYPAL_EMAIL);
    $('payment-status').textContent = 'PayPal email copied.';
  } catch {
    $('payment-status').textContent = 'Copy this email manually: ' + PAYPAL_EMAIL;
  }
});
$('unlock-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('unlock-status');
  const submit = event.submitter;
  if (currentPlan() === PLANS.pro) {
    status.textContent = 'Pro is already active. Keep your new code for when it expires.';
    return;
  }
  const code = $('unlock-code').value.trim();
  if (!code.startsWith('CRAMLY-PRO-')) {
    status.textContent = 'Use a code generated in the admin dashboard.';
    return;
  }
  submit.disabled = true;
  try {
    const response = await fetch('/api/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'redeem', code }) });
    const result = await response.json();
    if (!response.ok) { status.textContent = result.error || 'Could not verify the code.'; return; }
    const access = result.access;
    remoteVerified = true;
    if (!access) {
      status.textContent = 'That code is invalid or has already been used in this browser.';
      return;
    }
    saved.access = access;
    const retained = persist();
    $('unlock-code').value = '';
    updateUsage();
    updateUpgrade();
    status.textContent = retained ? 'Pro unlocked.' : 'Pro unlocked for this page only; browser storage is unavailable.';
  } catch {
    status.textContent = 'Could not verify the code. Try again in a browser over HTTPS.';
  } finally {
    submit.disabled = false;
  }
});

function requirePro() {
  if (hasPro()) return true;
  openUpgrade();
  return false;
}

function renderLibrary() {
  const container = $('library-list');
  container.replaceChildren();
  if (!hasPro()) {
    container.append(element('p', 'The saved deck library is a Pro feature.'), button('See Pro', () => {
      $('library-dialog').close();
      openUpgrade();
    }));
    return;
  }
  if (!saved.decks?.length) {
    container.append(element('p', 'No decks yet. Generate a set and select Save deck.'));
    return;
  }
  const list = element('ul', '', 'library-list');
  for (const item of saved.decks) {
    const row = element('li', '', 'deck-row');
    const remove = button('Delete', () => {
      if (!window.confirm('Delete this saved deck?')) return;
      saved.decks = saved.decks.filter(({ id }) => id !== item.id);
      const retained = persist();
      renderLibrary();
      if (!retained) container.append(element('p', 'Browser storage is unavailable; this change won’t survive a reload.'));
    });
    remove.setAttribute('aria-label', 'Delete ' + item.title);
    row.append(button(item.title, () => {
      resetStudy(item);
      $('library-dialog').close();
      $('cards-tab').focus();
    }), remove);
    list.append(row);
  }
  container.append(list);
}

$('library-button').addEventListener('click', () => {
  renderLibrary();
  $('library-dialog').showModal();
});
$('save').addEventListener('click', () => {
  if (!requirePro()) return;
  if (saved.decks?.some(({ id }) => id === deck.id)) {
    $('study-status').textContent = 'This deck is already in your library.';
    return;
  }
  saved.decks = [deck, ...(saved.decks ?? [])];
  $('study-status').textContent = persist() ? 'Saved to your library.' : 'Browser storage is unavailable; this deck won’t survive a reload.';
});
$('export').addEventListener('click', () => {
  if (!requirePro()) return;
  const url = URL.createObjectURL(new Blob([exportCSV(deck.flashcards)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cramly-flashcards.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
});
$('print').addEventListener('click', () => {
  if (!requirePro()) return;
  const list = document.createElement('ol');
  for (const { front, back } of deck.flashcards) {
    const card = document.createElement('li');
    card.append(element('strong', front), element('div', back));
    list.append(card);
  }
  $('print-content').replaceChildren(element('h1', 'Cramly flashcards'), list);
  window.print();
});

updateUsage();
updateGeneratorNotice();
window.addEventListener('focus', updateUsage);
refreshRemoteAccess();
window.addEventListener('focus', refreshRemoteAccess);
