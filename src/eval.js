import { readFile } from 'node:fs/promises';

const GOLD = new Set(['supported', 'contradicted', 'unsupported']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);

export function mapFeverLabel(label) {
  return ({ SUPPORTED: 'supported', REFUTED: 'contradicted', NOTENOUGHINFO: 'unsupported', 'NOT ENOUGH INFO': 'unsupported' })[String(label).toUpperCase()] ?? null;
}

export function mapNliLabel(label) {
  return ({ ENTAILMENT: 'supported', CONTRADICTION: 'contradicted', NEUTRAL: 'unsupported' })[String(label).toUpperCase()] ?? null;
}

export function adaptFever(item) {
  return { id: String(item.id ?? item.claim_id ?? ''), claim: item.claim, excerpt: item.excerpt ?? item.evidence, gold: mapFeverLabel(item.label), ...(item.assertedConfidence ? { assertedConfidence: item.assertedConfidence } : {}) };
}

export function adaptNli(item) {
  return { id: String(item.id ?? item.pairID ?? ''), claim: item.hypothesis ?? item.claim, excerpt: item.premise ?? item.excerpt, gold: mapNliLabel(item.label ?? item.gold_label), ...(item.assertedConfidence ? { assertedConfidence: item.assertedConfidence } : {}) };
}

export function validateEvalItem(item, index = 0) {
  if (!item || typeof item !== 'object' || !String(item.id ?? '') || !String(item.claim ?? '') || !String(item.excerpt ?? '') || !GOLD.has(item.gold)) throw new Error(`Invalid eval item at line ${index + 1}: require id, claim, excerpt, and mapped gold`);
  if (item.assertedConfidence !== undefined && !CONFIDENCE.has(item.assertedConfidence)) throw new Error(`Invalid assertedConfidence at line ${index + 1}`);
  return { id: String(item.id), claim: String(item.claim), excerpt: String(item.excerpt), gold: item.gold, ...(item.assertedConfidence ? { assertedConfidence: item.assertedConfidence } : {}) };
}

export function parseEvalJsonl(text, { format = 'generic' } = {}) {
  const parsed = String(text).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line, index) => {
    let value;
    try { value = JSON.parse(line); } catch { throw new Error(`Invalid JSON at eval data line ${index + 1}`); }
    return format === 'fever' ? adaptFever(value) : format === 'nli' ? adaptNli(value) : value;
  });
  return parsed.map(validateEvalItem);
}

export async function loadEvalDataset(path, options) { return parseEvalJsonl(await readFile(path, 'utf8'), options); }

export function judgeAgreement(heuristic, model) {
  if (heuristic.length !== model.length) throw new Error('Judge result sets must have equal length');
  const labels = ['supported', 'partial', 'unsupported', 'contradicted'];
  const confusion = Object.fromEntries(labels.map((a) => [a, Object.fromEntries(labels.map((b) => [b, 0]))]));
  const disagreements = [];
  let exact = 0;
  heuristic.forEach((item, index) => {
    const other = model[index];
    confusion[item.verdict][other.verdict]++;
    if (item.verdict === other.verdict) exact++; else disagreements.push({ id: item.id, claim: item.claim, heuristic: item.verdict, model: other.verdict });
  });
  return { n: heuristic.length, exactVerdictAgreement: heuristic.length ? Math.round(exact / heuristic.length * 1e6) / 1e6 : 0, confusion, disagreements };
}
