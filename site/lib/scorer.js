import { entities, hasNegation, normalizeText, numbers, tokens } from './text.js';

const round = (value) => Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;

function recall(needles, haystack) {
  if (!needles.length) return null;
  const set = new Set(haystack);
  return needles.filter((item) => set.has(item)).length / needles.length;
}

function bigramRecall(claimTokens, excerptTokens) {
  if (claimTokens.length < 2) return recall(claimTokens, excerptTokens);
  const excerpt = new Set(excerptTokens.slice(0, -1).map((token, index) => `${token} ${excerptTokens[index + 1]}`));
  const claim = claimTokens.slice(0, -1).map((token, index) => `${token} ${claimTokens[index + 1]}`);
  return recall(claim, excerpt);
}

function numberSignal(claim, excerpt) {
  const expected = numbers(claim);
  if (!expected.length) return { value: null, mismatch: false, expected, observed: [] };
  const observed = numbers(excerpt);
  const value = recall(expected, observed);
  return { value, mismatch: value < 1 && observed.length > 0, expected, observed };
}

// Extract the items of a trailing coordinated list ("A, B, and C" / "A and B") of
// proper-noun-ish members. Returns lowercased item strings, or [] if there is no list.
function coordinatedList(text) {
  const item = "[A-Z][\\p{L}.&'-]*(?:\\s+[A-Z][\\p{L}.&'-]*)*";
  const match = String(text).match(new RegExp(`(${item}(?:\\s*,\\s*${item})*)\\s*,?\\s+and\\s+(${item})`, 'u'));
  if (!match) return [];
  const clean = (part) => part.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
  const head = match[1].split(/\s*,\s*/).map(clean).filter(Boolean);
  return [...head, clean(match[2])].filter(Boolean);
}

// True when the claim states a coordinated list that is a PROPER SUBSET of the excerpt's
// list — i.e. the answer dropped one or more members the source includes. General: not
// tied to any phrasing ("led by", "includes", etc.).
function incompleteCoordinatedList(claim, excerpt) {
  const claimItems = coordinatedList(claim);
  if (claimItems.length < 2) return false;
  const excerptItems = coordinatedList(excerpt);
  if (excerptItems.length <= claimItems.length) return false;
  const present = new Set(excerptItems);
  return claimItems.every((member) => present.has(member));
}

export function judgeHeuristic({ claim, excerpt }) {
  const claimTokens = tokens(claim, { content: true });
  const excerptTokens = tokens(excerpt, { content: true });
  const tokenRecall = recall([...new Set(claimTokens)], excerptTokens) ?? 0;
  const phraseCoverage = bigramRecall(claimTokens, excerptTokens) ?? 0;
  const claimEntities = entities(claim);
  const entityAgreement = recall(claimEntities, entities(excerpt));
  const number = numberSignal(claim, excerpt);
  const claimNegated = hasNegation(claim);
  const excerptNegated = hasNegation(excerpt);
  const sharedContent = tokenRecall >= 0.35;
  const negationMismatch = sharedContent && claimNegated !== excerptNegated;
  const listIncomplete = incompleteCoordinatedList(claim, excerpt);

  const weighted = [
    [tokenRecall, 0.35], [phraseCoverage, 0.20], [entityAgreement, 0.15],
    [number.value, 0.20], [negationMismatch ? 0 : 1, 0.10]
  ].filter(([value]) => value !== null);
  let score = weighted.reduce((sum, [value, weight]) => sum + value * weight, 0) /
    weighted.reduce((sum, [, weight]) => sum + weight, 0);
  const contradiction = number.mismatch || negationMismatch;
  if (contradiction) score = Math.min(score, 0.2);
  else if (listIncomplete) score = Math.min(score, 0.71);
  score = round(score);
  const verdict = contradiction ? 'contradicted' : score >= 0.72 ? 'supported' : score >= 0.45 ? 'partial' : 'unsupported';
  const reasons = [];
  if (number.mismatch) reasons.push('number-mismatch');
  if (negationMismatch) reasons.push('negation-mismatch');
  if (listIncomplete) reasons.push('incomplete-list');
  if (tokenRecall < 0.45) reasons.push('low-content-overlap');
  return {
    score, verdict,
    signals: { tokenRecall: round(tokenRecall), phraseCoverage: round(phraseCoverage), entityAgreement: entityAgreement === null ? null : round(entityAgreement), numberAgreement: number.value === null ? null : round(number.value), polarityAgreement: !negationMismatch, listComplete: !listIncomplete },
    reasons
  };
}

export const heuristicJudge = { name: 'groundproof-heuristic', version: '1', judge: judgeHeuristic };

export function confidenceFor(score) {
  return score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
}

export { normalizeText, round };
