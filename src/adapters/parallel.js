const DEFAULT_ENDPOINT = 'https://api.parallel.ai/v1/tasks/runs';

async function json(response, label) {
  if (!response?.ok) {
    const detail = typeof response?.text === 'function' ? await response.text() : '';
    throw new Error(`Parallel ${label} failed (${response?.status ?? 'unknown'})${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

export async function runParallelTask({
  apiKey, input, processor = 'base', taskSpec, endpoint = DEFAULT_ENDPOINT,
  fetch: fetchLike = globalThis.fetch, pollInterval = 1000, maxAttempts = 3600,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)), signal
} = {}) {
  if (!apiKey) throw new Error('Parallel API key is required');
  if (input === undefined || input === null || input === '') throw new Error('Parallel task input is required');
  if (typeof fetchLike !== 'function') throw new Error('A fetch-like function is required');
  const headers = { 'content-type': 'application/json', 'x-api-key': apiKey };
  const body = { input, processor, ...(taskSpec ? { task_spec: taskSpec } : {}) };
  const created = await json(await fetchLike(endpoint, {
    method: 'POST', headers, body: JSON.stringify(body), signal
  }), 'task creation');
  if (created?.result?.output || created?.output) return created;
  const runId = created?.run_id ?? created?.id;
  if (!runId) throw new Error('Parallel task creation returned no run_id');
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0 || pollInterval > 0) await sleep(pollInterval);
    const result = await json(await fetchLike(`${endpoint}/${encodeURIComponent(runId)}/result`, {
      method: 'GET', headers: { 'x-api-key': apiKey }, signal
    }), 'task result');
    if (result?.result?.output || result?.output) return result;
    if (['failed', 'cancelled'].includes(result?.status)) throw new Error(`Parallel task ${result.status}`);
  }
  throw new Error(`Parallel task did not complete after ${maxAttempts} checks`);
}

export { DEFAULT_ENDPOINT as PARALLEL_TASK_ENDPOINT };
