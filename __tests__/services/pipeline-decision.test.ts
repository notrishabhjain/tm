import { parseDecision } from '../../src/services/pipeline';

describe('parseDecision', () => {
  it('parses a full task decision', () => {
    const raw = JSON.stringify({
      reasoning: 'Boss asks user to send the deck',
      isTask: true,
      title: 'Share revised client deck with Boss',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      notes: 'Client call rescheduled',
    });
    const d = parseDecision(raw);
    expect(d).not.toBeNull();
    expect(d!.isTask).toBe(true);
    expect(d!.title).toBe('Share revised client deck with Boss');
    expect(d!.priority).toBe('HIGH');
    expect(d!.dueDate).not.toBeNull();
    expect(d!.notes).toBe('Client call rescheduled');
  });

  it('parses a skip decision and tolerates surrounding prose', () => {
    const raw = `Here is my answer:\n{"reasoning":"bank alert","isTask":false,"title":null,"priority":"LOW","dueDate":null,"notes":null}\nDone.`;
    const d = parseDecision(raw);
    expect(d).not.toBeNull();
    expect(d!.isTask).toBe(false);
    expect(d!.title).toBeNull();
  });

  it('treats isTask=true with no title as not a task (safety)', () => {
    const raw = JSON.stringify({ reasoning: 'x', isTask: true, title: null, priority: 'HIGH' });
    const d = parseDecision(raw);
    expect(d!.isTask).toBe(false);
  });

  it('corrects hallucinated past years on due dates', () => {
    const past = new Date();
    past.setFullYear(past.getFullYear() - 2);
    const raw = JSON.stringify({
      reasoning: 'x',
      isTask: true,
      title: 'Pay Sharma ji',
      priority: 'MEDIUM',
      dueDate: past.toISOString(),
    });
    const d = parseDecision(raw);
    expect(d!.dueDate).toBeGreaterThan(Date.now() - 61 * 86400000);
  });

  it('returns null for garbage', () => {
    expect(parseDecision('not json at all')).toBeNull();
  });

  it('defaults invalid priority to MEDIUM', () => {
    const raw = JSON.stringify({
      reasoning: 'x',
      isTask: true,
      title: 'Do the thing',
      priority: 'MEGA',
    });
    expect(parseDecision(raw)!.priority).toBe('MEDIUM');
  });
});
