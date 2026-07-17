import { confidenceFor, heuristicJudge, normalizeText, round } from './scorer.js';

const LEVEL = { low: 0, medium: 1, high: 2 };
const INTEGRITY_WEIGHT = { verified: 1, 'unverified-source': 0.9, drifted: 0.45, unreachable: 0.7 };

function excerptPresent(excerpt, content) {
  if (!excerpt || !content) return false;
  return normalizeText(content).includes(normalizeText(excerpt));
}

async function checkIntegrity(evidence, sources, fetcher) {
  const source = sources.find((item) => item.url === evidence.url);
  if (source?.content !== undefined) {
    const present = excerptPresent(evidence.excerpt, source.content);
    return { status: present ? 'verified' : 'drifted', excerptPresent: present };
  }
  if (!fetcher) return { status: 'unverified-source', excerptPresent: null };
  try {
    const result = await fetcher(evidence.url);
    if (!result?.ok) return { status: 'unreachable', excerptPresent: null };
    const content = typeof result.text === 'function' ? await result.text() : result.content;
    const present = excerptPresent(evidence.excerpt, content);
    return { status: present ? 'verified' : 'drifted', excerptPresent: present, checkedAt: new Date().toISOString() };
  } catch {
    return { status: 'unreachable', excerptPresent: null, checkedAt: new Date().toISOString() };
  }
}

function overallVerdict(bestEvidence, score) {
  if (bestEvidence?.entailment.verdict === 'contradicted') return 'contradicted';
  return score >= 0.72 ? 'supported' : score >= 0.45 ? 'partial' : 'unsupported';
}

export async function verifyNormalized(model, { judge = heuristicJudge, fetcher } = {}) {
  const claims = [];
  for (const claim of model.claims) {
    const evidence = [];
    for (const item of claim.evidence ?? []) {
      const entailment = await judge.judge({ claim: claim.text, excerpt: item.excerpt ?? '' });
      const integrity = await checkIntegrity(item, model.sources, fetcher);
      evidence.push({ url: item.url ?? '', title: item.title ?? null, excerpt: item.excerpt ?? '', entailment, integrity });
    }
    const ranked = evidence.map((item) => ({ item, value: item.entailment.score * (INTEGRITY_WEIGHT[item.integrity.status] ?? 0.9) })).sort((a, b) => b.value - a.value);
    let score = ranked[0]?.value ?? 0;
    const supportedUrls = new Set(ranked.filter(({ item }) => item.entailment.verdict === 'supported' && item.url).map(({ item }) => item.url));
    if (supportedUrls.size > 1) score += Math.min(0.05, (supportedUrls.size - 1) * 0.025);
    if (ranked[0]?.item.entailment.verdict === 'contradicted') score = Math.min(score, 0.2);
    score = round(score);
    const independent = confidenceFor(score);
    const flags = [];
    if (!evidence.length) flags.push('no-evidence');
    if (evidence.some((item) => item.integrity.status === 'unverified-source')) flags.push('unverified-source');
    if (evidence.some((item) => item.integrity.status === 'drifted')) flags.push('citation-drift');
    if (evidence.some((item) => item.integrity.status === 'unreachable')) flags.push('source-unreachable');
    if (claim.assertedConfidence && LEVEL[claim.assertedConfidence] > LEVEL[independent]) flags.push('over-confident');
    claims.push({ path: claim.path, claim: claim.text, assertedConfidence: claim.assertedConfidence, evidence, score, confidence: independent, verdict: overallVerdict(ranked[0]?.item, score), flags });
  }
  const score = round(claims.length ? claims.reduce((sum, claim) => sum + claim.score, 0) / claims.length : 0);
  const verdicts = ['supported', 'partial', 'unsupported', 'contradicted'];
  const integrity = ['verified', 'unverified-source', 'drifted', 'unreachable'];
  return {
    judge: { name: judge.name, version: judge.version, ...(judge.model ? { model: judge.model } : {}) }, network: Boolean(fetcher), claims,
    summary: {
      score, confidence: confidenceFor(score),
      counts: {
        claims: claims.length,
        ...Object.fromEntries(verdicts.map((name) => [name, claims.filter((claim) => claim.verdict === name).length])),
        overConfident: claims.filter((claim) => claim.flags.includes('over-confident')).length,
        integrity: Object.fromEntries(integrity.map((name) => [name, claims.flatMap((claim) => claim.evidence).filter((item) => item.integrity.status === name).length]))
      }
    }
  };
}
