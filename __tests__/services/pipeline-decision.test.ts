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

  it('parses JSON wrapped in markdown code fences', () => {
    const raw =
      '```json\n{"reasoning":"boss asks for report","isTask":true,"title":"Send report to boss","priority":"URGENT","dueDate":null,"notes":null}\n```';
    const d = parseDecision(raw);
    expect(d).not.toBeNull();
    expect(d!.isTask).toBe(true);
    expect(d!.title).toBe('Send report to boss');
    expect(d!.priority).toBe('URGENT');
  });

  it('treats whitespace-only or literal "null" titles as missing', () => {
    for (const title of ['   ', 'null']) {
      const d = parseDecision(
        JSON.stringify({ reasoning: 'x', isTask: true, title, priority: 'HIGH' })
      );
      expect(d!.title).toBeNull();
      expect(d!.isTask).toBe(false);
    }
  });

  it('keeps isTask=false even when the model included a title', () => {
    const d = parseDecision(
      JSON.stringify({ reasoning: 'group chatter', isTask: false, title: 'Book tickets' })
    );
    expect(d!.isTask).toBe(false);
  });

  it('truncates absurdly long titles to 120 chars', () => {
    const d = parseDecision(
      JSON.stringify({ reasoning: 'x', isTask: true, title: 'a'.repeat(300), priority: 'LOW' })
    );
    expect(d!.title).toHaveLength(120);
  });

  it('treats "null" strings and unparseable strings as no due date', () => {
    for (const dueDate of ['null', 'someday soon', '']) {
      const d = parseDecision(
        JSON.stringify({ reasoning: 'x', isTask: true, title: 'T', priority: 'LOW', dueDate })
      );
      expect(d!.dueDate).toBeNull();
    }
  });

  it('leaves a due date from yesterday alone (recent past ≠ hallucinated year)', () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const d = parseDecision(
      JSON.stringify({
        reasoning: 'x',
        isTask: true,
        title: 'T',
        priority: 'LOW',
        dueDate: yesterday.toISOString(),
      })
    );
    expect(d!.dueDate).toBeLessThan(Date.now());
    expect(d!.dueDate).toBeGreaterThan(Date.now() - 2 * 86_400_000);
  });

  it('leaves a far-future due date alone', () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const d = parseDecision(
      JSON.stringify({
        reasoning: 'x',
        isTask: true,
        title: 'T',
        priority: 'LOW',
        dueDate: nextYear.toISOString(),
      })
    );
    expect(Math.abs(d!.dueDate! - nextYear.getTime())).toBeLessThan(1000);
  });

  it('normalises "null" notes and non-string reasoning', () => {
    const d = parseDecision(
      JSON.stringify({ reasoning: 42, isTask: true, title: 'T', priority: 'LOW', notes: 'null' })
    );
    expect(d!.notes).toBeNull();
    expect(d!.reasoning).toBe('');
  });

  it('returns null for empty input and bare arrays', () => {
    expect(parseDecision('')).toBeNull();
    expect(parseDecision('[]')).toBeNull();
    expect(parseDecision('{broken')).toBeNull();
  });
});
