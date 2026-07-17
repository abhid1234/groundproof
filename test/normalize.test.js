import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, normalizeGeneric, normalizeParallel, verifyNormalized } from '../src/index.js';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url)));

test('auto-detects Parallel result payload', async () => assert.equal(normalize(await fixture('parallel-research.json')).provider, 'parallel'));
test('normalizes Parallel content', async () => assert.match(normalizeParallel(await fixture('parallel-research.json')).answer, /machine reasoning/));
test('normalizes Parallel Basis claims', async () => assert.equal(normalizeParallel(await fixture('parallel-research.json')).claims.length, 3));
test('preserves provider confidence', async () => assert.equal(normalizeParallel(await fixture('parallel-research.json')).claims[0].assertedConfidence, 'high'));
test('normalizes enrichment paths', async () => assert.equal(normalizeParallel(await fixture('parallel-enrichment.json')).claims[0].path, '/companies/0/name'));
test('generic explicit claims normalize', async () => assert.equal(normalizeGeneric(await fixture('generic.json')).claims.length, 2));
test('generic absent claims decompose answer', () => assert.equal(normalizeGeneric({ answer: { one: 1, two: 2 } }).claims.length, 2));
test('structured multi-sentence leaves remain one claim each', () => {
  const model = normalizeGeneric({
    answer: { summary: 'One fact. Two facts.', count: 2 },
    claims: [{ field: 'summary', citations: [{ excerpt: 'One fact. Two facts.' }] }, { field: 'count', citations: [{ excerpt: 'There are 2.' }] }]
  });
  assert.equal(model.claims.length, 2);
  assert.equal(model.claims[0].path, 'summary');
});
test('URL string citations resolve sources', () => {
  const model = normalizeGeneric({ answer: 'A', claims: [{ text: 'A', citations: ['u'] }], sources: [{ url: 'u', excerpt: 'A' }] });
  assert.equal(model.claims[0].evidence[0].excerpt, 'A');
});

test('live Parallel per-field prose Basis decomposes and surfaces an omitted list member', async () => {
  const payload = await fixture('parallel-live-sample.json');
  assert.equal(normalize(payload).provider, 'parallel');
  const model = normalizeParallel(payload);
  assert.ok(model.claims.length > 1);
  assert.ok(model.claims.every((claim) => claim.evidence.length > 0));
  assert.ok(model.claims.every((claim) => claim.assertedConfidence === 'high'));

  const result = await verifyNormalized(model);
  const facts = result.claims.find((claim) => claim.claim.includes('$852 billion'));
  const investors = result.claims.find((claim) => claim.claim.includes('led by Amazon'));
  assert.equal(facts?.verdict, 'supported');
  assert.notEqual(investors?.verdict, 'supported');
  assert.ok(investors?.evidence.some((item) => item.entailment.reasons.includes('incomplete-list')));
  assert.ok(result.summary.score > 0.5);
  assert.equal(result.summary.counts.contradicted, 0);
});
