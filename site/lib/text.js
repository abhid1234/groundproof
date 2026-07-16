const STOP = new Set('a an and are as at be been being by for from has have in into is it its of on or that the their there they this to was were will with'.split(' '));
const NEGATIONS = new Set(['no', 'not', 'never', 'neither', 'nor', "isn't", "wasn't", "didn't", "doesn't", "hasn't", "haven't", 'without']);

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}%$€£.'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function stem(token) {
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokens(value, { content = false } = {}) {
  const result = normalizeText(value).match(/[\p{L}\p{N}]+(?:[.'-][\p{L}\p{N}]+)*|[%$€£]/gu) || [];
  return result.map(stem).filter((token) => !content || (!STOP.has(token) && token.length > 1));
}

export function numbers(value) {
  return [...String(value ?? '').matchAll(/(?:[$€£]\s*)?\d[\d,]*(?:\.\d+)?\s*%?/g)].map((match) =>
    match[0].replace(/\s+/g, '').replaceAll(',', '').toLowerCase());
}

export function entities(value) {
  const matches = String(value ?? '').match(/\b(?:[A-Z]{2,}|[A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)*)\b/gu) || [];
  return [...new Set(matches.filter((item) => !/^(The|A|An|This|That)$/.test(item)).map(normalizeText))];
}

export function hasNegation(value) {
  return tokens(value).some((token) => NEGATIONS.has(token)) || /\b(?:cannot|can't|won't)\b/i.test(String(value));
}
