import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCalibration, reliabilitySvg } from '../src/index.js';

test('SVG report is self-contained and carries metrics, n, diagonal and points', () => {
  const svg = reliabilitySvg(computeCalibration([{ confidence: 0.8, grounded: true }]));
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg xmlns=/);
  assert.match(svg, /class="perfect"/);
  assert.match(svg, /<circle/);
  assert.match(svg, /n = 1/);
  assert.match(svg, /ECE = 0.2/);
  assert.doesNotMatch(svg, /<script|(?:href|src)=["']https?:\/\//);
});
