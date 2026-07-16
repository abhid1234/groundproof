import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelJudge, createOpenAICompatibleComplete, parseModelJudgment, verifyNormalized } from '../src/index.js';

test('model judge uses injected completion and returns the exact judge shape', async () => {
  let prompt;
  const judge = createModelJudge({ model: 'mock-1', complete: async (value) => { prompt = value; return '```json\n{"score":0.93,"verdict":"supported","signals":{"entailment":true},"reasons":["direct"]}\n```'; } });
  const result = await judge.judge({ claim: 'A', excerpt: 'A' });
  assert.deepEqual(result, { score: 0.93, verdict: 'supported', signals: { entailment: true }, reasons: ['direct'] });
  assert.match(prompt.system, /outside knowledge/);
  assert.match(prompt.user, /CLAIM:\nA/);
});

test('model output parsing is defensive', () => {
  assert.throws(() => parseModelJudgment('not json'), /no valid JSON/);
  assert.throws(() => parseModelJudgment('{"score":2,"verdict":"maybe"}'), /invalid verdict/);
  assert.equal(parseModelJudgment('{"score":2,"verdict":"supported"}').score, 1);
});

test('missing model key fails before fetch', () => {
  let called = false;
  assert.throws(() => createOpenAICompatibleComplete({ apiKey: '', model: 'x', fetchImpl: () => { called = true; } }), /API_KEY is required/);
  assert.equal(called, false);
});

test('async model judge metadata including model id enters verification', async () => {
  const judge = createModelJudge({ model: 'mock-2', complete: async () => ({ score: 1, verdict: 'supported', signals: {}, reasons: [] }) });
  const result = await verifyNormalized({ answer: 'A', provider: 'test', metadata: {}, sources: [], claims: [{ path: '/0', text: 'A', assertedConfidence: null, evidence: [{ excerpt: 'A' }] }] }, { judge });
  assert.deepEqual(result.judge, { name: 'groundproof-model', version: '1', model: 'mock-2' });
});
