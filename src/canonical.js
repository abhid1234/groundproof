import { createHash } from 'node:crypto';

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter((key) => key !== 'id' && key !== 'signature')
      .sort().map((key) => [key, clean(value[key])]));
  }
  return value;
}

export function canonicalize(value) {
  const normalized = JSON.parse(JSON.stringify(value));
  return JSON.stringify(clean(normalized));
}

export function contentId(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}
