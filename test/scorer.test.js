import test from 'node:test';
import assert from 'node:assert/strict';
import { confidenceFor, judgeHeuristic } from '../src/index.js';

test('direct support is supported', () => assert.equal(judgeHeuristic({ claim: 'Acme employs 42 people.', excerpt: 'Acme employs 42 people worldwide.' }).verdict, 'supported'));
test('unrelated text is unsupported', () => assert.equal(judgeHeuristic({ claim: 'Acme employs 42 people.', excerpt: 'The weather is sunny in Lisbon.' }).verdict, 'unsupported'));
test('number mismatch is contradicted', () => {
  const result = judgeHeuristic({ claim: 'Acme employs 42 people.', excerpt: 'Acme employs 24 people.' });
  assert.equal(result.verdict, 'contradicted'); assert.ok(result.reasons.includes('number-mismatch'));
});
test('year mismatch is contradicted', () => assert.equal(judgeHeuristic({ claim: 'Acme was founded in 2021.', excerpt: 'Acme was founded in 2019.' }).verdict, 'contradicted'));
test('matching number is not contradicted', () => assert.notEqual(judgeHeuristic({ claim: 'Revenue was $2.5 million.', excerpt: 'Revenue was $2.5 million in 2025.' }).verdict, 'contradicted'));
test('negation mismatch is contradicted', () => assert.equal(judgeHeuristic({ claim: 'Acme is profitable.', excerpt: 'Acme is not profitable.' }).verdict, 'contradicted'));
test('matching negation can be supported', () => assert.notEqual(judgeHeuristic({ claim: 'Acme is not profitable.', excerpt: 'The report says Acme is not profitable.' }).verdict, 'contradicted'));
test('entity mismatch reduces support', () => {
  const match = judgeHeuristic({ claim: 'Northstar Labs builds rockets.', excerpt: 'Northstar Labs builds rockets.' });
  const mismatch = judgeHeuristic({ claim: 'Northstar Labs builds rockets.', excerpt: 'Juniper Works builds rockets.' });
  assert.ok(match.score > mismatch.score);
});
test('scores stay within bounds', () => {
  for (const pair of [['x', ''], ['', 'x'], ['same', 'same']]) { const score = judgeHeuristic({ claim: pair[0], excerpt: pair[1] }).score; assert.ok(score >= 0 && score <= 1); }
});
test('confidence thresholds are stable', () => {
  assert.equal(confidenceFor(0.8), 'high'); assert.equal(confidenceFor(0.55), 'medium'); assert.equal(confidenceFor(0.549), 'low');
});
