import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposeProse, decomposeStructured } from '../src/index.js';

test('prose decomposes sentences', () => assert.equal(decomposeProse('One claim. Two claim!').length, 2));
test('prose protects decimal points', () => assert.equal(decomposeProse('Revenue was $2.5 million. It grew.').length, 2));
test('prose protects common abbreviations', () => assert.equal(decomposeProse('Dr. Ada arrived. She spoke.').length, 2));
test('prose paths are stable', () => assert.deepEqual(decomposeProse('A. B.').map((x) => x.path), ['/prose/0', '/prose/1']));
test('structured data creates leaf claims', () => assert.equal(decomposeStructured({ a: 1, b: { c: true } }).length, 2));
test('structured arrays create element claims', () => assert.deepEqual(decomposeStructured({ a: ['x', 'y'] }).map((x) => x.path), ['/a/0', '/a/1']));
test('JSON Pointer characters are escaped', () => assert.equal(decomposeStructured({ 'a/b': 1 })[0].path, '/a~1b'));
