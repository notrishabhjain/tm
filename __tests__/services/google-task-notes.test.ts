import { buildGoogleTaskNotes } from '../../src/services/google-tasks';

describe('buildGoogleTaskNotes', () => {
  it('includes all metadata lines when every field is present', () => {
    const due = new Date();
    due.setHours(15, 30, 0, 0);
    const notes = buildGoogleTaskNotes({
      priority: 'HIGH',
      sender: 'Rahul',
      sourceApp: 'com.whatsapp',
      howTo: 'Reply with the confirmation',
      estimatedMinutes: 15,
      dueDate: due.getTime(),
      body: 'Please send the invoice by 3:30pm',
    });
    expect(notes).toContain('Priority: HIGH');
    expect(notes).toContain('From: Rahul · WhatsApp');
    expect(notes).toContain('Due:');
    expect(notes).toContain('How to: Reply with the confirmation');
    expect(notes).toContain('Estimated: 15 min');
    expect(notes).toContain('---');
    expect(notes).toContain('Please send the invoice by 3:30pm');
  });

  it('omits the Due line when the deadline is at midnight (date-only)', () => {
    const due = new Date();
    due.setHours(0, 0, 0, 0);
    const notes = buildGoogleTaskNotes({ priority: 'LOW', dueDate: due.getTime() });
    expect(notes).not.toContain('Due:');
  });

  it('truncates long bodies to 500 chars', () => {
    const notes = buildGoogleTaskNotes({ body: 'x'.repeat(600) });
    expect(notes.length).toBeLessThanOrEqual(510);
  });

  it('returns empty string for empty input', () => {
    expect(buildGoogleTaskNotes({})).toBe('');
  });

  it('builds a From line from the source app alone', () => {
    const notes = buildGoogleTaskNotes({ sourceApp: 'com.whatsapp' });
    expect(notes).toBe('From: WhatsApp');
  });

  it('only inserts the --- separator when metadata precedes the body', () => {
    expect(buildGoogleTaskNotes({ body: 'just a body' })).toBe('just a body');
    const withMeta = buildGoogleTaskNotes({ priority: 'LOW', body: 'the body' });
    expect(withMeta).toBe('Priority: LOW\n---\nthe body');
  });

  it('keeps the time-of-day for call tasks (Google Tasks drops it from due)', () => {
    const due = new Date();
    due.setHours(9, 15, 0, 0);
    const notes = buildGoogleTaskNotes({
      priority: 'HIGH',
      sender: 'Sharma Ji',
      sourceApp: 'call.transcript',
      dueDate: due.getTime(),
    });
    expect(notes).toContain('From: Sharma Ji · Phone call');
    expect(notes).toContain('Due:');
    expect(notes).toMatch(/9:15/);
  });
});
