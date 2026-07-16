#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReceipt, generateEd25519KeyPair, normalize, signEd25519, signHmac,
  heuristicJudge, loadBenchmark, loadEvalDataset, modelJudgeFromEnv, reliabilitySvg,
  runBenchmark, runEvaluation, runParallelTask, validateInput, validateReceipt,
  verifyContentId, verifyEd25519, verifyHmac, verifyNormalized
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args.shift();
const has = (flag) => args.includes(flag);
const option = (flag, fallback) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : fallback; };
const valueFlags = ['--min-score', '--hmac-secret', '--private-key', '--public-key', '--key-id', '--out', '--provider', '--parallel', '--processor', '--judge', '--by', '--report'];
const positional = () => args.find((arg, index) => !arg.startsWith('-') && !valueFlags.includes(args[index - 1]));

async function readJson(path) {
  const text = path === '-' ? await new Promise((accept, reject) => { let data = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', (chunk) => { data += chunk; }); process.stdin.on('end', () => accept(data)); process.stdin.on('error', reject); }) : await readFile(path, 'utf8');
  return JSON.parse(text);
}

function printVerification(verification, provider) {
  console.log(`${provider}: ${(verification.summary.score * 100).toFixed(1)}% grounded (${verification.summary.confidence})`);
  for (const claim of verification.claims) {
    const flags = claim.flags.length ? ` [${claim.flags.join(', ')}]` : '';
    console.log(`  ${claim.verdict.padEnd(12)} ${(claim.score * 100).toFixed(1).padStart(5)}% ${claim.claim}${flags}`);
  }
}

async function networkFetcher(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'groundproof/0.1' }, signal: AbortSignal.timeout(10000) });
  return { ok: response.ok, text: () => response.text() };
}

async function runVerify(receiptMode = false) {
  const question = option('--parallel');
  const path = positional();
  if (!path && !question) throw new Error(`usage: groundproof ${receiptMode ? 'receipt' : 'verify'} <file|->`);
  let payload;
  if (question) {
    const apiKey = process.env.PARALLEL_API_KEY;
    if (!apiKey) throw new Error('PARALLEL_API_KEY is required for --parallel; no request was made');
    payload = await runParallelTask({ apiKey, input: question, processor: option('--processor', 'base') });
  } else payload = await readJson(path);
  const validation = validateInput(payload);
  if (!validation.valid) { console.error(JSON.stringify(validation, null, 2)); process.exitCode = 2; return; }
  const options = { provider: option('--provider', 'auto'), fetcher: has('--network') ? networkFetcher : undefined };
  if (receiptMode) {
    let receipt = await createReceipt(payload, options);
    if (option('--hmac-secret')) receipt = signHmac(receipt, option('--hmac-secret'), { keyId: option('--key-id') });
    if (option('--private-key')) receipt = signEd25519(receipt, await readFile(option('--private-key'), 'utf8'), { keyId: option('--key-id') });
    console.log(JSON.stringify(receipt, null, 2));
    return;
  }
  const model = normalize(payload, options);
  const verification = await verifyNormalized(model, options);
  if (has('--json')) console.log(JSON.stringify(verification, null, 2)); else printVerification(verification, model.provider);
  const min = Number(option('--min-score', 0));
  if (verification.summary.score < min || (has('--fail-unsupported') && verification.claims.some((claim) => ['unsupported', 'contradicted'].includes(claim.verdict)))) process.exitCode = 1;
}

function printBenchmark(report) {
  console.log('groundproof benchmark — small hand-curated illustration (not an official benchmark)\n');
  console.log('variant    mean     supported partial unsupported contradicted over-confident');
  for (const [name, row] of [['grounded', report.grounded], ['degraded', report.degraded]]) {
    console.log(`${name.padEnd(10)} ${(row.meanGroundedness * 100).toFixed(1).padStart(5)}% ${String(row.verdicts.supported).padStart(9)} ${String(row.verdicts.partial).padStart(7)} ${String(row.verdicts.unsupported).padStart(11)} ${String(row.verdicts.contradicted).padStart(12)} ${String(row.overConfidence).padStart(14)}`);
  }
  console.log(`\n${report.items} items; grounded/degraded separation: ${(report.separation * 100).toFixed(1)} points`);
}

async function runBenchmarkCommand() {
  const directory = resolve(positional() ?? resolve(here, '../fixtures/benchmark'));
  const report = await runBenchmark(await loadBenchmark(directory));
  if (has('--json')) console.log(JSON.stringify(report, null, 2)); else printBenchmark(report);
}

function printEval(report, svgPath, jsonPath) {
  const calibration = report.calibration;
  console.log(`groundproof eval — ${report.n} labeled items; judge ${report.judge.name}${report.judge.model ? ` (${report.judge.model})` : ''}`);
  console.log(`verdict accuracy: ${(report.verdictAccuracy * 100).toFixed(1)}%`);
  console.log(`calibration by ${report.calibrationBy}: ECE ${calibration.ece}, MCE ${calibration.mce}, Brier ${calibration.brier} (n=${calibration.n})`);
  console.log('\nbin/label       n  mean predicted  empirical grounded  note');
  const rows = report.calibrationBy === 'asserted' ? calibration.assertedTable.map((row) => ({ name: row.label, count: row.count, meanPredicted: row.representativeConfidence, empiricalGroundedRate: row.empiricalGroundedRate, lowConfidence: row.lowConfidence })) : calibration.table.map((row) => ({ name: `[${row.lower.toFixed(1)},${row.upper.toFixed(1)}${row.index === calibration.bins - 1 ? ']' : ')'}`, ...row }));
  for (const row of rows) console.log(`${row.name.padEnd(14)} ${String(row.count).padStart(3)} ${row.meanPredicted === null ? '—'.padStart(15) : row.meanPredicted.toFixed(3).padStart(15)} ${row.empiricalGroundedRate === null ? '—'.padStart(19) : row.empiricalGroundedRate.toFixed(3).padStart(19)}  ${row.lowConfidence ? 'low-confidence' : ''}`);
  if (report.comparison) {
    console.log(`\nAGREEMENT ${report.comparison.judges.join(' vs ')}: ${(report.comparison.exactVerdictAgreement * 100).toFixed(1)}% exact verdict (n=${report.comparison.n})`);
    console.log('confusion (rows=first judge, columns=second):');
    console.log(JSON.stringify(report.comparison.confusion));
    for (const item of report.comparison.disagreements) console.log(`  ${item.id}: ${item.heuristic} vs ${item.model} — ${item.claim}`);
  }
  console.log(`\nWrote ${svgPath} and ${jsonPath}`);
  console.log(calibration.disclaimer);
}

async function runEvalCommand() {
  const dataset = resolve(positional() ?? resolve(here, '../fixtures/eval/sample.jsonl'));
  const judgeName = option('--judge', 'heuristic');
  if (!['heuristic', 'model'].includes(judgeName)) throw new Error('--judge must be heuristic or model');
  const modelJudge = () => modelJudgeFromEnv();
  const judge = judgeName === 'model' ? modelJudge() : heuristicJudge;
  const compareJudge = has('--compare-judges') ? (judgeName === 'model' ? heuristicJudge : modelJudge()) : undefined;
  const report = await runEvaluation(await loadEvalDataset(dataset), { judge, compareJudge, by: option('--by', 'recomputed') });
  const svgPath = resolve(option('--report', 'eval-report.svg'));
  const jsonPath = svgPath.replace(/\.svg$/i, '') + '.json';
  await writeFile(svgPath, reliabilitySvg(report.calibration));
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  if (has('--json')) console.log(JSON.stringify(report, null, 2)); else printEval(report, svgPath, jsonPath);
}

async function runCheck() {
  const path = positional();
  if (!path) throw new Error('usage: groundproof check <receipt>');
  const receipt = await readJson(path);
  const schema = validateReceipt(receipt);
  const id = verifyContentId(receipt);
  let signature = null;
  if (option('--hmac-secret')) signature = verifyHmac(receipt, option('--hmac-secret'));
  if (option('--public-key')) signature = verifyEd25519(receipt, await readFile(option('--public-key'), 'utf8'));
  const valid = schema.valid && id && signature !== false;
  console.log(JSON.stringify({ valid, schema, contentId: id, signature }, null, 2));
  if (!valid) process.exitCode = 1;
}

async function runDemo() {
  const parallel = await readJson(resolve(here, '../fixtures/parallel-research.json'));
  const baseline = await readJson(resolve(here, '../fixtures/naive-baseline.json'));
  const good = await verifyNormalized(normalize(parallel));
  const weak = await verifyNormalized(normalize(baseline));
  console.log('groundproof — independent evidence check\n');
  printVerification(good, 'Parallel Basis fixture');
  console.log('');
  printVerification(weak, 'Naive baseline');
  console.log(`\nResult: Basis-style evidence scores ${(good.summary.score * 100).toFixed(1)}% vs ${(weak.summary.score * 100).toFixed(1)}%; baseline flags ${weak.summary.counts.unsupported + weak.summary.counts.contradicted} unsupported/contradicted and ${weak.summary.counts.overConfident} over-confident claim(s).`);
}

async function runKeygen() {
  const pair = generateEd25519KeyPair();
  const out = option('--out');
  if (!out) { console.log(JSON.stringify(pair, null, 2)); return; }
  await writeFile(`${out}.private.pem`, pair.privateKey, { mode: 0o600 });
  await writeFile(`${out}.public.pem`, pair.publicKey);
  console.log(`Wrote ${basename(out)}.private.pem and ${basename(out)}.public.pem`);
}

function help() {
  console.log(`groundproof — portable, independently verified research receipts

Usage:
  groundproof verify <file|-> [--json] [--network] [--min-score 0.7] [--fail-unsupported]
  groundproof verify --parallel <question> [--processor base] [--json]
  groundproof receipt <file|-> [--hmac-secret secret | --private-key key.pem]
  groundproof check <receipt> [--hmac-secret secret | --public-key key.pem]
  groundproof keygen [--out prefix]
  groundproof benchmark [dir] [--json]
  groundproof eval [dataset] [--judge heuristic|model] [--compare-judges] [--by asserted|recomputed] [--report path.svg] [--json]
  groundproof demo`);
}

try {
  if (command === 'verify') await runVerify();
  else if (command === 'receipt') await runVerify(true);
  else if (command === 'check') await runCheck();
  else if (command === 'keygen') await runKeygen();
  else if (command === 'benchmark') await runBenchmarkCommand();
  else if (command === 'eval') await runEvalCommand();
  else if (command === 'demo') await runDemo();
  else { help(); if (command && !['help', '--help', '-h'].includes(command)) process.exitCode = 2; }
} catch (error) {
  console.error(`groundproof: ${error.message}`);
  process.exitCode = 2;
}
