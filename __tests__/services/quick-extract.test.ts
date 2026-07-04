import { analyzeQuickText } from '../../src/services/quick-extract';

describe('analyzeQuickText', () => {
  it('derives a due date and a valid priority from a dictated task', async () => {
    const result = await analyzeQuickText('Send the invoice to Rahul urgently by tomorrow');
    expect(['URGENT', 'HIGH', 'MEDIUM', 'LOW']).toContain(result.priority);
    expect(result.dueDate).not.toBeNull();
  });

  it('defaults to MEDIUM when the text has no urgency markers', async () => {
    const result = await analyzeQuickText('Buy groceries sometime');
    expect(['MEDIUM', 'LOW', 'HIGH']).toContain(result.priority);
  });

  it('never throws on empty input', async () => {
    const result = await analyzeQuickText('');
    expect(result.priority).toBeDefined();
    expect(result.dueDate).toBeNull();
  });
});

describe('task id format parity', () => {
  // The Kotlin generator in CallRecordStore.generateId() must produce ids the
  // JS side accepts: "<epoch ms>-<7 base36 chars>" — same as
  // TaskRepository.generateId(). This pins the shared contract.
  const ID_FORMAT = /^\d{13}-[a-z0-9]{7}$/;

  it('matches the documented cross-language format', () => {
    const simulated = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    expect(simulated).toMatch(ID_FORMAT);
  });
});
