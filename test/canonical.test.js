import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, contentId } from '../src/index.js';

test('canonicalize sorts object keys', () => assert.equal(canonicalize({ z: 1, a: 2 }), '{"a":2,"z":1}'));
test('canonicalize retains array order', () => assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1])));
test('canonicalize removes id recursively', () => assert.equal(canonicalize({ child: { id: 'x', ok: true } }), '{"child":{"ok":true}}'));
test('canonicalize removes signature recursively', () => assert.equal(canonicalize({ signature: 'x', a: 1 }), '{"a":1}'));
test('content IDs are stable across key order', () => assert.equal(contentId({ a: 1, b: 2 }), contentId({ b: 2, a: 1 })));
test('content IDs use sha256 prefix and hex', () => assert.match(contentId({ a: 1 }), /^sha256:[a-f0-9]{64}$/));
test('content ID ignores an existing ID', () => assert.equal(contentId({ a: 1, id: 'old' }), contentId({ a: 1 })));
