import { createReceipt } from './lib/receipt.js';

const good = { provider: 'parallel', answer: 'Parallel Web Systems builds web infrastructure for machine reasoning.', claims: [{ text: 'Parallel Web Systems builds web infrastructure for machine reasoning.', confidence: 'high', evidence: [{ url: 'https://parallel.ai/about', excerpt: 'Parallel Web Systems builds web infrastructure for machine reasoning.' }] }], sources: [{ url: 'https://parallel.ai/about', content: 'Parallel Web Systems builds web infrastructure for machine reasoning.' }] };
const money = { provider: 'naive-baseline', answer: 'The Task API guarantees every answer is factually correct.', claims: [{ text: 'The Task API guarantees every answer is factually correct.', confidence: 'high', evidence: [{ url: 'https://parallel.ai/docs/task-api', excerpt: 'Task API results contain output content and Basis evidence supporting the output.' }] }], sources: [{ url: 'https://parallel.ai/docs/task-api', content: 'Task API results contain output content and Basis evidence supporting the output.' }] };
const presets = { basis: good, caught: money };
const editor = document.querySelector('#editor');
const output = document.querySelector('#output');

function load(name) { editor.value = JSON.stringify(presets[name], null, 2); run(); }
async function run() {
  try {
    const receipt = await createReceipt(JSON.parse(editor.value));
    const { summary } = receipt.verification;
    output.innerHTML = `<div class="receipt"><div class="eyebrow">VERIFIED RECEIPT</div><div class="score">${Math.round(summary.score * 100)}<small>% grounded</small></div><div class="meta"><span>confidence ${summary.confidence}</span><code>${receipt.id}</code></div></div>` + receipt.verification.claims.map((claim) => `<article class="claim ${claim.verdict}"><div><b>${claim.verdict}</b><span>${Math.round(claim.score * 100)}% · recomputed ${claim.confidence}</span></div><p>${escapeHtml(claim.claim)}</p>${claim.flags.length ? `<mark>${claim.flags.join(' · ')}</mark>` : ''}<blockquote>${escapeHtml(claim.evidence[0]?.excerpt || 'No evidence supplied')}</blockquote></article>`).join('');
  } catch (error) { output.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`; }
}
function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
document.querySelector('#preset').addEventListener('change', (event) => load(event.target.value));
document.querySelector('#run').addEventListener('click', run);
editor.addEventListener('input', run);
load('caught');
