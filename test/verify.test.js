import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, verifyNormalized } from '../src/index.js';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url)));

test('Parallel fixture scores higher than baseline', async () => {
  const good = await verifyNormalized(normalize(await fixture('parallel-research.json')));
  const weak = await verifyNormalized(normalize(await fixture('naive-baseline.json')));
  assert.ok(good.summary.score > weak.summary.score);
});
test('baseline catches unsupported claim', async () => {
  const result = await verifyNormalized(normalize(await fixture('naive-baseline.json')));
  assert.ok(result.claims.some((claim) => ['unsupported', 'contradicted'].includes(claim.verdict)));
});
test('weak high-confidence claim is flagged over-confident', async () => {
  const result = await verifyNormalized(normalize(await fixture('naive-baseline.json')));
  assert.ok(result.claims.some((claim) => claim.flags.includes('over-confident')));
});
test('source content verifies excerpt presence', async () => {
  const result = await verifyNormalized(normalize(await fixture('generic.json')));
  assert.equal(result.claims[0].evidence[0].integrity.status, 'verified');
});
test('missing source content is honestly unverified', async () => {
  const model = normalize({ answer: 'Acme grows.', claims: [{ text: 'Acme grows.', evidence: [{ url: 'u', excerpt: 'Acme grows.' }] }] });
  const result = await verifyNormalized(model);
  assert.equal(result.claims[0].evidence[0].integrity.status, 'unverified-source');
});
test('drifted excerpt is detected', async () => {
  const model = normalize({ answer: 'Acme grows.', claims: [{ text: 'Acme grows.', evidence: [{ url: 'u', excerpt: 'Acme grows.' }] }], sources: [{ url: 'u', content: 'Different page.' }] });
  const result = await verifyNormalized(model);
  assert.equal(result.claims[0].evidence[0].integrity.status, 'drifted');
});
test('fetcher can verify source', async () => {
  const model = normalize({ answer: 'Acme grows.', claims: [{ text: 'Acme grows.', evidence: [{ url: 'u', excerpt: 'Acme grows.' }] }] });
  const result = await verifyNormalized(model, { fetcher: async () => ({ ok: true, text: async () => 'Acme grows.' }) });
  assert.equal(result.claims[0].evidence[0].integrity.status, 'verified');
});
test('fetch failure is unreachable', async () => {
  const model = normalize({ answer: 'Acme grows.', claims: [{ text: 'Acme grows.', evidence: [{ url: 'u', excerpt: 'Acme grows.' }] }] });
  const result = await verifyNormalized(model, { fetcher: async () => { throw new Error('offline'); } });
  assert.equal(result.claims[0].evidence[0].integrity.status, 'unreachable');
});
test('claims without evidence score zero', async () => {
  const result = await verifyNormalized(normalize({ answer: 'A claim.' }));
  assert.equal(result.claims[0].score, 0); assert.ok(result.claims[0].flags.includes('no-evidence'));
});
test('custom judge seam is honored', async () => {
  const model = normalize({ answer: 'A', claims: [{ text: 'A', evidence: [{ excerpt: 'B' }] }] });
  const judge = { name: 'test', version: 'x', judge: () => ({ score: 1, verdict: 'supported', signals: {}, reasons: [] }) };
  const result = await verifyNormalized(model, { judge });
  assert.deepEqual(result.judge, { name: 'test', version: 'x' }); assert.equal(result.claims[0].score, 0.9);
});
