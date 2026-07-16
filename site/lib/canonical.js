function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value)
    .filter((key) => key !== 'id' && key !== 'signature').sort().map((key) => [key, clean(value[key])]));
  return value;
}

export function canonicalize(value) {
  return JSON.stringify(clean(JSON.parse(JSON.stringify(value))));
}

export async function contentId(value) {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
