const ABBREVIATIONS = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|e\.g|i\.e)\.$/i;

export function escapePointer(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function label(path) {
  const part = path.split('/').at(-1)?.replaceAll('~1', '/').replaceAll('~0', '~') || 'value';
  return part.replace(/[_-]+/g, ' ');
}

function render(path, value) {
  const shown = typeof value === 'string' ? value : JSON.stringify(value);
  return `${label(path)}: ${shown}`;
}

export function decomposeStructured(value, path = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path: path || '/', text: render(path || '/value', value) }];
    return value.flatMap((item, index) => decomposeStructured(item, `${path}/${index}`));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return [{ path: path || '/', text: render(path || '/value', value) }];
    return entries.flatMap(([key, item]) => decomposeStructured(item, `${path}/${escapePointer(key)}`));
  }
  return [{ path: path || '/', text: render(path || '/value', value) }];
}

export function decomposeProse(text) {
  const paragraphs = String(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const sentences = [];
  for (const paragraph of paragraphs) {
    let start = 0;
    for (let index = 0; index < paragraph.length; index += 1) {
      if (!'.?!'.includes(paragraph[index])) continue;
      if (/\d/.test(paragraph[index - 1] || '') && /\d/.test(paragraph[index + 1] || '')) continue;
      const candidate = paragraph.slice(start, index + 1).trim();
      if (ABBREVIATIONS.test(candidate)) continue;
      if (candidate) sentences.push(candidate);
      start = index + 1;
    }
    const tail = paragraph.slice(start).trim();
    if (tail) sentences.push(tail);
  }
  return sentences.map((claim, index) => ({ path: `/prose/${index}`, text: claim }));
}

export function decompose(answer) {
  return typeof answer === 'string' ? decomposeProse(answer) : decomposeStructured(answer);
}
