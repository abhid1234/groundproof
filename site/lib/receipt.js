import { contentId } from './canonical.js';
import { normalize } from './normalize.js';
import { verifyNormalized } from './verify.js';

export async function createReceipt(payload, options = {}) {
  const model = options.normalized ? payload : normalize(payload, options);
  const verification = await verifyNormalized(model, options);
  const receipt = { format: 'groundproof/receipt@1', subject: { answer: model.answer, provider: model.provider, metadata: model.metadata }, verification };
  receipt.id = await contentId(receipt);
  return receipt;
}
