import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAssertedCalibration, computeCalibration } from '../src/index.js';

test('calibration math matches hand-computed values exactly', () => {
  const result = computeCalibration([
    { confidence: 0.1, grounded: false }, { confidence: 0.3, grounded: true },
    { confidence: 0.8, grounded: true }, { confidence: 0.9, grounded: false }
  ], { bins: 2, minBinCount: 3 });
  assert.deepEqual(result.table.map(({ count, meanPredicted, empiricalGroundedRate, gap, lowConfidence }) => ({ count, meanPredicted, empiricalGroundedRate, gap, lowConfidence })), [
    { count: 2, meanPredicted: 0.2, empiricalGroundedRate: 0.5, gap: 0.3, lowConfidence: true },
    { count: 2, meanPredicted: 0.85, empiricalGroundedRate: 0.5, gap: 0.35, lowConfidence: true }
  ]);
  assert.equal(result.ece, 0.325);
  assert.equal(result.mce, 0.35);
  assert.equal(result.brier, 0.3375);
  assert.equal(result.n, 4);
});

test('asserted confidence exposes label frequencies and numeric assumption', () => {
  const result = computeAssertedCalibration([{ assertedConfidence: 'high', grounded: true }, { assertedConfidence: 'high', grounded: false }, { assertedConfidence: 'low', grounded: false }]);
  assert.deepEqual(result.assertedTable.map((x) => [x.label, x.count, x.empiricalGroundedRate]), [['low', 1, 0], ['medium', 0, null], ['high', 2, 0.5]]);
  assert.match(result.assumption, /low=0.25/);
});
