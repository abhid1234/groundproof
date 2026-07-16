import { computeAssertedCalibration, computeCalibration } from './calibration.js';
import { judgeAgreement } from './eval.js';

const accuracy = (rows) => rows.length ? Math.round(rows.filter((row) => row.verdict === row.gold).length / rows.length * 1e6) / 1e6 : 0;

export async function evaluateJudge(items, judge) {
  const results = [];
  for (const item of items) results.push({ ...item, ...(await judge.judge({ claim: item.claim, excerpt: item.excerpt })) });
  return results;
}

export async function runEvaluation(items, { judge, compareJudge, by = 'recomputed', bins = 10, minBinCount = 5 } = {}) {
  if (!judge) throw new Error('Evaluation requires a judge');
  if (!['recomputed', 'asserted'].includes(by)) throw new Error('--by must be asserted or recomputed');
  const primary = await evaluateJudge(items, judge);
  const calibrationItems = primary.map((item) => ({ confidence: item.score, grounded: item.gold === 'supported', assertedConfidence: item.assertedConfidence }));
  const calibration = by === 'asserted' ? computeAssertedCalibration(calibrationItems, { minBinCount }) : computeCalibration(calibrationItems, { bins, minBinCount });
  const report = {
    schema: 'groundproof/eval-report@1',
    sample: 'Results depend on the supplied labels; the shipped data is a small hand-authored illustration, not an official benchmark.',
    n: items.length,
    judge: { name: judge.name, version: judge.version, ...(judge.model ? { model: judge.model } : {}) },
    verdictAccuracy: accuracy(primary),
    calibrationBy: by,
    calibration,
    results: primary
  };
  if (compareJudge) {
    const secondary = await evaluateJudge(items, compareJudge);
    const primaryIsHeuristic = judge.name === 'groundproof-heuristic';
    const heuristic = primaryIsHeuristic ? primary : secondary;
    const model = primaryIsHeuristic ? secondary : primary;
    report.comparison = { judges: ['groundproof-heuristic', 'groundproof-model'], ...judgeAgreement(heuristic, model), secondaryVerdictAccuracy: accuracy(secondary) };
  }
  return report;
}
