import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceipt, normalizeParallel, runParallelTask, verifyContentId } from '../src/index.js';

test('Parallel adapter posts, polls, and returns the raw response unchanged', async () => {
  const final = { result: { output: { content: 'Earth has one Moon.', basis: [{ claim: 'Earth has one Moon.', confidence: 'high', citations: [{ url: 'https://science.nasa.gov/moon/', excerpt: 'Earth has one Moon.' }] }] } } };
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return options.method === 'POST' ? { ok: true, json: async () => ({ run_id: 'run_1' }) } : { ok: true, json: async () => final };
  };
  const raw = await runParallelTask({ apiKey: 'test-secret', input: 'How many moons?', fetch, pollInterval: 0, sleep: async () => {} });
  assert.equal(raw, final);
  assert.deepEqual(JSON.parse(calls[0].options.body), { input: 'How many moons?', processor: 'base' });
  assert.equal(calls[0].options.headers['x-api-key'], 'test-secret');
  assert.match(calls[1].url, /run_1\/result$/);
  const model = normalizeParallel(raw);
  const receipt = await createReceipt(model, { normalized: true });
  assert.equal(receipt.verification.claims[0].verdict, 'supported');
  assert.equal(verifyContentId(receipt), true);
});

test('Parallel adapter rejects missing credentials before fetch', async () => {
  let called = false;
  await assert.rejects(runParallelTask({ input: 'x', fetch: async () => { called = true; } }), /key is required/);
  assert.equal(called, false);
});
