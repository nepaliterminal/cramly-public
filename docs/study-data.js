const DAY_MS = 86_400_000;

export function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
}

export function dailyCount(usage, now = new Date()) {
  return usage?.date === localDate(now) && Number.isInteger(usage.count) ? usage.count : 0;
}

export function recordGeneration(usage, now = new Date()) {
  return { date: localDate(now), count: dailyCount(usage, now) + 1 };
}

export function isPro(access, now = Date.now()) {
  return Number.isFinite(access?.expiresAt) && access.expiresAt > now;
}

export async function redeemCode(input, hashes, redeemed = [], now = Date.now()) {
  const code = input.trim().toUpperCase();
  if (!code || !hashes.length) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (!hashes.includes(hash) || redeemed.includes(hash)) return null;
  return { hash, expiresAt: now + 31 * DAY_MS };
}

export function scoreQuiz(quiz, answers) {
  return quiz.reduce((score, item, i) => score + Number(answers[i] === item.answerIndex), 0);
}

export function exportCSV(cards) {
  const field = (value) => {
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r]/u.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return [['Front', 'Back'], ...cards.map(({ front, back }) => [front, back])]
    .map((row) => row.map(field).join(',')).join('\r\n');
}
