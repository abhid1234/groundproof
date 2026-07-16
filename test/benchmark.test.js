import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBenchmark, runBenchmark } from '../src/index.js';

const item = { id: 'tiny', question: 'How many?', sources: [{ url: 'u', content: 'Acme employs 42 people.' }], grounded: { answer: 'Acme employs 42 people.', claims: [{ text: 'Acme employs 42 people.', confidence: 'high', evidence: [{ url: 'u', excerpt: 'Acme employs 42 people.' }] }] }, degraded: { answer: 'Acme employs 24 people.', claims: [{ text: 'Acme employs 24 people.', confidence: 'high', evidence: [{ url: 'u', excerpt: 'Acme employs 42 people.' }] }] } };

test('benchmark reports verdicts, over-confidence, and separation', async () => {
  const report = await runBenchmark([item]);
  assert.equal(report.items, 1);
  assert.equal(report.grounded.verdicts.supported, 1);
  assert.equal(report.degraded.verdicts.contradicted, 1);
  assert.equal(report.degraded.overConfidence, 1);
  assert.ok(report.separation > 0);
});

test('shipped benchmark has ten labeled items', async () => {
  const items = await loadBenchmark(new URL('../fixtures/benchmark', import.meta.url));
  assert.equal(items.length, 10);
  assert.ok(items.every((entry) => entry.goldAnswer && entry.sources[0]?.url.startsWith('https://')));
});
