import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize, normalizeGeneric, normalizeParallel } from '../src/index.js';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url)));

test('auto-detects Parallel result payload', async () => assert.equal(normalize(await fixture('parallel-research.json')).provider, 'parallel'));
test('normalizes Parallel content', async () => assert.match(normalizeParallel(await fixture('parallel-research.json')).answer, /machine reasoning/));
test('normalizes Parallel Basis claims', async () => assert.equal(normalizeParallel(await fixture('parallel-research.json')).claims.length, 3));
test('preserves provider confidence', async () => assert.equal(normalizeParallel(await fixture('parallel-research.json')).claims[0].assertedConfidence, 'high'));
test('normalizes enrichment paths', async () => assert.equal(normalizeParallel(await fixture('parallel-enrichment.json')).claims[0].path, '/companies/0/name'));
test('generic explicit claims normalize', async () => assert.equal(normalizeGeneric(await fixture('generic.json')).claims.length, 2));
test('generic absent claims decompose answer', () => assert.equal(normalizeGeneric({ answer: { one: 1, two: 2 } }).claims.length, 2));
test('URL string citations resolve sources', () => {
  const model = normalizeGeneric({ answer: 'A', claims: [{ text: 'A', citations: ['u'] }], sources: [{ url: 'u', excerpt: 'A' }] });
  assert.equal(model.claims[0].evidence[0].excerpt, 'A');
});
