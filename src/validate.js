const error = (path, code, message) => ({ path, code, message });

export function validateReceipt(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: [error('', 'type', 'receipt must be an object')] };
  if (value.format !== 'groundproof/receipt@1') errors.push(error('/format', 'format', 'format must be groundproof/receipt@1'));
  if (typeof value.id !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.id)) errors.push(error('/id', 'id', 'id must be a sha256 content ID'));
  if (!value.subject || !Object.hasOwn(value.subject, 'answer')) errors.push(error('/subject/answer', 'required', 'answer is required'));
  if (!value.verification || !Array.isArray(value.verification.claims)) errors.push(error('/verification/claims', 'type', 'claims must be an array'));
  else value.verification.claims.forEach((claim, index) => {
    if (typeof claim.claim !== 'string') errors.push(error(`/verification/claims/${index}/claim`, 'type', 'claim must be a string'));
    if (typeof claim.score !== 'number' || claim.score < 0 || claim.score > 1) errors.push(error(`/verification/claims/${index}/score`, 'range', 'score must be between 0 and 1'));
    if (!Array.isArray(claim.evidence)) errors.push(error(`/verification/claims/${index}/evidence`, 'type', 'evidence must be an array'));
  });
  return { valid: errors.length === 0, errors };
}

export function validateInput(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(error('', 'type', 'input must be an object'));
  else if (!Object.hasOwn(value, 'answer') && !Object.hasOwn(value, 'content') && !value?.result?.output && !value?.output) errors.push(error('/answer', 'required', 'generic answer or Parallel output is required'));
  return { valid: errors.length === 0, errors };
}
