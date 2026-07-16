import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalize } from './normalize.js';
import { verifyNormalized } from './verify.js';

const VERDICTS = ['supported', 'partial', 'unsupported', 'contradicted'];
const round = (value) => Math.round(value * 1000) / 1000;

export async function loadBenchmark(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort();
  const location = (name) => directory instanceof URL
    ? new URL(name, directory.href.endsWith('/') ? directory : new URL(`${directory.href}/`))
    : resolve(directory, name);
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(location(name), 'utf8'))));
}

async function evaluateVariant(item, variant, options) {
  const payload = {
    provider: `benchmark-${variant}`,
    answer: item[variant].answer,
    claims: item[variant].claims,
    sources: item.sources
  };
  return verifyNormalized(normalize(payload), options);
}

export async function runBenchmark(items, options = {}) {
  const results = [];
  for (const item of items) {
    if (!item?.id || !item.grounded?.answer || !item.degraded?.answer || !Array.isArray(item.sources)) {
      throw new Error('Benchmark items require id, sources, grounded, and degraded variants');
    }
    results.push({ id: item.id, question: item.question, grounded: await evaluateVariant(item, 'grounded', options), degraded: await evaluateVariant(item, 'degraded', options) });
  }
  const summarize = (variant) => {
    const verifications = results.map((item) => item[variant]);
    const claims = verifications.flatMap((item) => item.claims);
    return {
      meanGroundedness: round(verifications.reduce((sum, item) => sum + item.summary.score, 0) / (verifications.length || 1)),
      verdicts: Object.fromEntries(VERDICTS.map((name) => [name, claims.filter((claim) => claim.verdict === name).length])),
      overConfidence: claims.filter((claim) => claim.flags.includes('over-confident')).length
    };
  };
  const grounded = summarize('grounded');
  const degraded = summarize('degraded');
  return { label: 'small hand-curated illustration; not an official benchmark', items: results.length, grounded, degraded, separation: round(grounded.meanGroundedness - degraded.meanGroundedness), results };
}
