import { createHmac, generateKeyPairSync, sign as cryptoSign, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import { canonicalize, contentId } from './canonical.js';

const bytes = (value) => Buffer.from(canonicalize(value));
const equal = (left, right) => left.length === right.length && timingSafeEqual(left, right);

export function signHmac(receipt, secret, { keyId } = {}) {
  const value = createHmac('sha256', secret).update(bytes(receipt)).digest('base64url');
  return { ...receipt, signature: { algorithm: 'hmac-sha256', ...(keyId ? { keyId } : {}), value } };
}

export function verifyHmac(receipt, secret) {
  if (receipt?.signature?.algorithm !== 'hmac-sha256') return false;
  const expected = createHmac('sha256', secret).update(bytes(receipt)).digest();
  try { return equal(expected, Buffer.from(receipt.signature.value, 'base64url')); } catch { return false; }
}

export function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}

export function signEd25519(receipt, privateKey, { keyId } = {}) {
  const value = cryptoSign(null, bytes(receipt), privateKey).toString('base64url');
  return { ...receipt, signature: { algorithm: 'ed25519', ...(keyId ? { keyId } : {}), value } };
}

export function verifyEd25519(receipt, publicKey) {
  if (receipt?.signature?.algorithm !== 'ed25519') return false;
  try { return cryptoVerify(null, bytes(receipt), publicKey, Buffer.from(receipt.signature.value, 'base64url')); } catch { return false; }
}

export function verifyContentId(receipt) {
  return typeof receipt?.id === 'string' && receipt.id === contentId(receipt);
}
