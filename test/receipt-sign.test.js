import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceipt, generateEd25519KeyPair, signEd25519, signHmac, validateReceipt, verifyContentId, verifyEd25519, verifyHmac } from '../src/index.js';

const input = { answer: 'Acme employs 42 people.', claims: [{ text: 'Acme employs 42 people.', evidence: [{ url: 'u', excerpt: 'Acme employs 42 people.' }] }] };

test('receipt has format and valid content ID', async () => { const receipt = await createReceipt(input); assert.equal(receipt.format, 'groundproof/receipt@1'); assert.ok(verifyContentId(receipt)); });
test('receipt validator accepts generated receipt', async () => assert.equal(validateReceipt(await createReceipt(input)).valid, true));
test('receipt validator is non-throwing on null', () => assert.deepEqual(validateReceipt(null).valid, false));
test('tampered receipt fails content ID', async () => { const receipt = await createReceipt(input); receipt.subject.answer = 'tampered'; assert.equal(verifyContentId(receipt), false); });
test('HMAC signature round trip', async () => { const signed = signHmac(await createReceipt(input), 'secret'); assert.equal(verifyHmac(signed, 'secret'), true); });
test('HMAC rejects wrong secret', async () => { const signed = signHmac(await createReceipt(input), 'secret'); assert.equal(verifyHmac(signed, 'wrong'), false); });
test('HMAC signing preserves content ID', async () => { const receipt = await createReceipt(input); assert.equal(signHmac(receipt, 'secret').id, receipt.id); });
test('HMAC rejects tampering', async () => { const signed = signHmac(await createReceipt(input), 'secret'); signed.subject.answer = 'tampered'; assert.equal(verifyHmac(signed, 'secret'), false); });
test('Ed25519 signature round trip', async () => { const keys = generateEd25519KeyPair(); const signed = signEd25519(await createReceipt(input), keys.privateKey); assert.equal(verifyEd25519(signed, keys.publicKey), true); });
test('Ed25519 rejects another key', async () => { const a = generateEd25519KeyPair(); const b = generateEd25519KeyPair(); const signed = signEd25519(await createReceipt(input), a.privateKey); assert.equal(verifyEd25519(signed, b.publicKey), false); });
