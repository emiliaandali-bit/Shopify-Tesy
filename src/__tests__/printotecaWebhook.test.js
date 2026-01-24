const { normalizePrintotecaWebhook } = require('../utils/printotecaWebhook.util');

describe('normalizePrintotecaWebhook', () => {
  it('extracts external_id from wrapped order payload', () => {
    const payload = { order: { id: '110689', external_id: '7480324555099' } };
    const result = normalizePrintotecaWebhook(payload);
    expect(result.externalId).toBe('7480324555099');
    expect(result.printotecaId).toBe('110689');
  });

  it('extracts external_id from flat payload', () => {
    const payload = { id: '110689', external_id: '7480324555099' };
    const result = normalizePrintotecaWebhook(payload);
    expect(result.externalId).toBe('7480324555099');
    expect(result.printotecaId).toBe('110689');
  });
});
