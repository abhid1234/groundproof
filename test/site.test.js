import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { contentId } from '../src/index.js';
import { contentId as browserContentId } from '../site/lib/canonical.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

for (const name of ['decompose.js', 'normalize.js', 'scorer.js', 'text.js', 'verify.js']) {
  test(`browser ${name} stays byte-identical to core`, async () => {
    const [core, browser] = await Promise.all([readFile(new URL(`../src/${name}`, import.meta.url), 'utf8'), readFile(new URL(`../site/lib/${name}`, import.meta.url), 'utf8')]);
    assert.equal(browser, core);
  });
}

test('browser WebCrypto content ID matches Node identity', async () => {
  const value = { z: 1, nested: { id: 'ignored', a: ['é', 2] } };
  assert.equal(await browserContentId(value), contentId(value));
});
