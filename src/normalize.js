import { decompose } from './decompose.js';

function confidence(value) {
  const normalized = String(value ?? '').toLowerCase();
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : null;
}

function citationToEvidence(item, sources = []) {
  if (typeof item === 'string') {
    const source = sources.find((entry) => entry.url === item || entry.id === item);
    return source ? { url: source.url, title: source.title ?? null, excerpt: source.excerpt ?? source.content ?? '' } : { url: item, title: null, excerpt: '' };
  }
  if (!item || typeof item !== 'object') return null;
  const source = sources.find((entry) => entry.id && [item.sourceId, item.source_id, item.id].includes(entry.id));
  return {
    url: item.url ?? source?.url ?? '',
    title: item.title ?? source?.title ?? null,
    excerpt: item.excerpt ?? item.quote ?? item.text ?? source?.excerpt ?? ''
  };
}

function normalizeSources(sources = []) {
  return sources.map((source, index) => typeof source === 'string' ? { id: String(index), url: source, title: null } : {
    id: source.id ?? String(index), url: source.url ?? source.uri ?? '', title: source.title ?? null,
    content: source.content, excerpt: source.excerpt
  });
}

function basisEntries(basis) {
  if (Array.isArray(basis)) return basis;
  if (!basis || typeof basis !== 'object') return [];
  if (Array.isArray(basis.claims)) return basis.claims;
  return Object.entries(basis).map(([path, value]) => ({ path, ...(typeof value === 'object' ? value : { value }) }));
}

function normalizeClaims(answer, supplied, sources) {
  const generated = decompose(answer);
  if (!supplied?.length) return generated.map((claim) => ({ ...claim, assertedConfidence: null, evidence: [] }));
  return supplied.map((item, index) => {
    const path = item.path ?? item.field ?? generated[index]?.path ?? `/claims/${index}`;
    const text = item.claim ?? item.text ?? item.statement ?? generated.find((entry) => entry.path === path)?.text ?? generated[index]?.text ?? String(item.value ?? '');
    const citations = item.evidence ?? item.citations ?? item.sources ?? [];
    const list = Array.isArray(citations) ? citations : [citations];
    const excerpts = item.excerpts ?? (item.excerpt ? [item.excerpt] : []);
    let evidence = list.map((citation) => citationToEvidence(citation, sources)).filter(Boolean);
    if (!evidence.length && excerpts.length) evidence = excerpts.map((excerpt) => ({ url: item.url ?? '', title: null, excerpt }));
    if (excerpts.length) evidence = evidence.map((entry, evidenceIndex) => ({ ...entry, excerpt: excerpts[evidenceIndex] ?? entry.excerpt }));
    return { path, text, assertedConfidence: confidence(item.confidence), evidence, reasoning: item.reasoning ?? null };
  });
}

export function normalizeGeneric(payload) {
  const sources = normalizeSources(payload.sources);
  return { answer: payload.answer, provider: payload.provider ?? 'generic', claims: normalizeClaims(payload.answer, payload.claims, sources), sources, metadata: payload.metadata ?? {} };
}

export function normalizeParallel(payload) {
  const output = payload?.result?.output ?? payload?.output ?? payload;
  const answer = output?.content;
  const sources = normalizeSources(output?.sources ?? payload?.sources ?? []);
  const basis = basisEntries(output?.basis);
  return { answer, provider: 'parallel', claims: normalizeClaims(answer, basis, sources), sources, metadata: { ...(payload.metadata ?? {}), basisReasoning: basis.map((item) => item.reasoning ?? null) } };
}

export function detectProvider(payload) {
  return payload?.result?.output?.basis || payload?.output?.basis || (payload?.content !== undefined && payload?.basis) ? 'parallel' : 'generic';
}

export function normalize(payload, { provider = 'auto' } = {}) {
  const selected = provider === 'auto' ? detectProvider(payload) : provider;
  return selected === 'parallel' ? normalizeParallel(payload) : normalizeGeneric(payload);
}
