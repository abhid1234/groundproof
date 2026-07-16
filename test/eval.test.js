import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEvalDataset, mapFeverLabel, mapNliLabel, parseEvalJsonl, judgeAgreement, runEvaluation, heuristicJudge } from '../src/index.js';

test('shipped eval sample is a balanced, labeled illustration', async () => {
  const items = await loadEvalDataset(new URL('../fixtures/eval/sample.jsonl', import.meta.url));
  assert.equal(items.length, 24);
  assert.deepEqual(Object.fromEntries(['supported', 'contradicted', 'unsupported'].map((gold) => [gold, items.filter((x) => x.gold === gold).length])), { supported: 8, contradicted: 8, unsupported: 8 });
  assert.ok(items.every((item) => item.assertedConfidence));
});

test('loader skips comments and validates schema', () => {
  assert.equal(parseEvalJsonl('# header\n{"id":"1","claim":"c","excerpt":"e","gold":"supported"}').length, 1);
  assert.throws(() => parseEvalJsonl('{"id":"1"}'), /Invalid eval item/);
});

test('FEVER and NLI mappings state the intended assumption', () => {
  assert.equal(mapFeverLabel('SUPPORTED'), 'supported');
  assert.equal(mapFeverLabel('REFUTED'), 'contradicted');
  assert.equal(mapFeverLabel('NOT ENOUGH INFO'), 'unsupported');
  assert.equal(mapNliLabel('entailment'), 'supported');
  assert.equal(mapNliLabel('contradiction'), 'contradicted');
  assert.equal(mapNliLabel('neutral'), 'unsupported');
});

test('agreement reports rate, confusion, and exact disagreement cases', () => {
  const a = [{ id: '1', claim: 'a', verdict: 'supported' }, { id: '2', claim: 'b', verdict: 'unsupported' }];
  const b = [{ id: '1', claim: 'a', verdict: 'supported' }, { id: '2', claim: 'b', verdict: 'contradicted' }];
  const result = judgeAgreement(a, b);
  assert.equal(result.exactVerdictAgreement, 0.5);
  assert.equal(result.confusion.unsupported.contradicted, 1);
  assert.deepEqual(result.disagreements[0], { id: '2', claim: 'b', heuristic: 'unsupported', model: 'contradicted' });
});

test('evaluation includes n, accuracy, calibration and disclaimer', async () => {
  const report = await runEvaluation([{ id: '1', claim: 'Earth is round.', excerpt: 'Earth is round.', gold: 'supported', assertedConfidence: 'high' }], { judge: heuristicJudge });
  assert.equal(report.n, 1);
  assert.equal(report.verdictAccuracy, 1);
  assert.match(report.calibration.disclaimer, /Small-sample/);
});
