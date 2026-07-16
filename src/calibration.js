const round = (value) => Math.round(value * 1e6) / 1e6;
const ASSERTED = { low: 0.25, medium: 0.6, high: 0.9 };

function check(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Calibration requires at least one item');
  for (const item of items) {
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw new Error('Calibration confidence must be from 0 to 1');
    if (typeof item.grounded !== 'boolean') throw new Error('Calibration grounded outcome must be boolean');
  }
}

export function computeCalibration(items, { bins = 10, minBinCount = 5 } = {}) {
  check(items);
  if (!Number.isInteger(bins) || bins < 1) throw new Error('bins must be a positive integer');
  const groups = Array.from({ length: bins }, (_, index) => ({ index, lower: index / bins, upper: (index + 1) / bins, values: [] }));
  for (const item of items) groups[Math.min(bins - 1, Math.floor(item.confidence * bins))].values.push(item);
  const table = groups.map(({ index, lower, upper, values }) => {
    const count = values.length;
    const meanPredicted = count ? values.reduce((sum, x) => sum + x.confidence, 0) / count : null;
    const empiricalGroundedRate = count ? values.filter((x) => x.grounded).length / count : null;
    const gap = count ? Math.abs(meanPredicted - empiricalGroundedRate) : null;
    return { index, lower: round(lower), upper: round(upper), count, meanPredicted: count ? round(meanPredicted) : null, empiricalGroundedRate: count ? round(empiricalGroundedRate) : null, gap: count ? round(gap) : null, lowConfidence: count < minBinCount };
  });
  const ece = table.reduce((sum, bin) => sum + (bin.count / items.length) * (bin.gap ?? 0), 0);
  const mce = Math.max(...table.map((bin) => bin.gap ?? 0));
  const brier = items.reduce((sum, item) => sum + (item.confidence - Number(item.grounded)) ** 2, 0) / items.length;
  return { n: items.length, bins, minBinCount, table, ece: round(ece), mce: round(mce), brier: round(brier), disclaimer: 'Small-sample ECE is noisy; run on the full development set for a meaningful population figure.' };
}

export function computeAssertedCalibration(items, { minBinCount = 5 } = {}) {
  const normalized = items.map((item) => {
    const label = item.assertedConfidence === 'med' ? 'medium' : item.assertedConfidence;
    if (!(label in ASSERTED)) throw new Error(`Invalid asserted confidence: ${item.assertedConfidence}`);
    return { ...item, label, confidence: ASSERTED[label] };
  });
  const metrics = computeCalibration(normalized, { bins: 10, minBinCount });
  const table = ['low', 'medium', 'high'].map((label) => {
    const values = normalized.filter((item) => item.label === label);
    return { label, representativeConfidence: ASSERTED[label], count: values.length, empiricalGroundedRate: values.length ? round(values.filter((x) => x.grounded).length / values.length) : null, lowConfidence: values.length < minBinCount };
  });
  return { ...metrics, assumption: 'Ordinal asserted labels are represented as low=0.25, medium=0.60, high=0.90 for ECE/Brier; inspect the label table independently.', assertedTable: table };
}
