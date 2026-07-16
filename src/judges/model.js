const VERDICTS = new Set(['supported', 'partial', 'unsupported', 'contradicted']);

const clamp = (value) => Math.max(0, Math.min(1, Number(value)));

function extractJson(value) {
  if (value && typeof value === 'object') return value;
  const text = String(value ?? '').trim();
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) try { return JSON.parse(fenced); } catch {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  throw new Error('Model judge returned no valid JSON object');
}

export function parseModelJudgment(output) {
  const value = extractJson(output);
  const score = clamp(value.score);
  if (!Number.isFinite(score)) throw new Error('Model judge score must be a number from 0 to 1');
  const verdict = String(value.verdict ?? '').toLowerCase();
  if (!VERDICTS.has(verdict)) throw new Error(`Model judge returned invalid verdict: ${verdict || '(missing)'}`);
  const signals = value.signals && typeof value.signals === 'object' && !Array.isArray(value.signals) ? value.signals : {};
  const reasons = Array.isArray(value.reasons) ? value.reasons.map(String) : value.reasons ? [String(value.reasons)] : [];
  return { score: Math.round(score * 1000) / 1000, verdict, signals, reasons };
}

export function createModelJudge({ complete, model = 'unspecified' } = {}) {
  if (typeof complete !== 'function') throw new Error('Model judge requires an injected complete({system,user}) function');
  return {
    name: 'groundproof-model', version: '1', model,
    async judge({ claim, excerpt }) {
      const system = 'You are a strict citation-faithfulness judge. Decide whether the excerpt entails the claim. Return only JSON with score (0..1 support confidence), verdict (supported, partial, unsupported, or contradicted), signals (object), and reasons (array of short strings). Do not use outside knowledge.';
      const user = `CLAIM:\n${claim}\n\nEXCERPT:\n${excerpt}`;
      return parseModelJudgment(await complete({ system, user }));
    }
  };
}

export function createOpenAICompatibleComplete({
  apiKey = process.env.GROUNDPROOF_JUDGE_API_KEY,
  baseUrl = process.env.GROUNDPROOF_JUDGE_BASE_URL ?? 'https://api.openai.com/v1/chat/completions',
  model = process.env.GROUNDPROOF_JUDGE_MODEL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!apiKey) throw new Error('GROUNDPROOF_JUDGE_API_KEY is required for --judge model; no request was made');
  if (!model) throw new Error('GROUNDPROOF_JUDGE_MODEL is required for --judge model; no request was made');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required for the model judge');
  return async ({ system, user }) => {
    const response = await fetchImpl(baseUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
    });
    if (!response.ok) throw new Error(`Model judge request failed with HTTP ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (content === undefined) throw new Error('Model judge response lacked choices[0].message.content');
    return content;
  };
}

export function modelJudgeFromEnv(options = {}) {
  const model = options.model ?? process.env.GROUNDPROOF_JUDGE_MODEL;
  return createModelJudge({ model, complete: createOpenAICompatibleComplete({ ...options, model }) });
}
