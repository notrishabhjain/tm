import { extractDeadline } from '../../../src/domain/extraction/deadlineExtractor';

function daysFromNow(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

function todayAt(h: number, m: number): number {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TOLERANCE_MS = 60 * 1000; // 1 minute tolerance for time-based assertions

describe('extractDeadline', () => {
  it('returns null for plain text with no deadline', () => {
    expect(extractDeadline('good morning')).toBeNull();
    expect(extractDeadline('please review the document')).toBeNull();
  });

  describe('today / EOD patterns', () => {
    it('detects "by today"', () => {
      const result = extractDeadline('please send by today');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      const today = new Date();
      expect(d.getDate()).toBe(today.getDate());
      expect(d.getHours()).toBe(23);
    });

    it('detects "EOD"', () => {
      const result = extractDeadline('submit the report by EOD');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getDate()).toBe(new Date().getDate());
    });

    it('detects "end of day"', () => {
      const result = extractDeadline('need this by end of day');
      expect(result).not.toBeNull();
    });

    it('detects Hindi "aaj" (today)', () => {
      const result = extractDeadline('aaj bhejna hai');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getDate()).toBe(new Date().getDate());
    });
  });

  describe('tomorrow patterns', () => {
    it('detects "by tomorrow"', () => {
      const result = extractDeadline('please confirm by tomorrow');
      expect(result).not.toBeNull();
      expect(Math.abs(result! - daysFromNow(1))).toBeLessThan(TOLERANCE_MS);
    });

    it('detects bare "tomorrow"', () => {
      const result = extractDeadline('send the invoice tomorrow');
      expect(result).not.toBeNull();
      const expected = daysFromNow(1);
      expect(Math.abs(result! - expected)).toBeLessThan(TOLERANCE_MS);
    });

    it('detects Hindi "kal" (tomorrow)', () => {
      const result = extractDeadline('kal tak bhejna');
      expect(result).not.toBeNull();
      const expected = daysFromNow(1);
      expect(Math.abs(result! - expected)).toBeLessThan(TOLERANCE_MS);
    });
  });

  describe('"in N days" pattern', () => {
    it('detects "in 3 days"', () => {
      const result = extractDeadline('please complete this in 3 days');
      expect(result).not.toBeNull();
      const expected = daysFromNow(3);
      expect(Math.abs(result! - expected)).toBeLessThan(TOLERANCE_MS);
    });

    it('detects "in 1 day"', () => {
      const result = extractDeadline('finish in 1 day');
      expect(result).not.toBeNull();
      const expected = daysFromNow(1);
      expect(Math.abs(result! - expected)).toBeLessThan(TOLERANCE_MS);
    });
  });

  describe('weekday patterns', () => {
    it('detects "by Monday"', () => {
      const result = extractDeadline('need approval by Monday');
      expect(result).not.toBeNull();
      // Must be in the future and within 7 days
      expect(result!).toBeGreaterThan(Date.now());
      expect(result!).toBeLessThan(Date.now() + 8 * DAY_MS);
    });

    it('detects "by Friday"', () => {
      const result = extractDeadline('submit by Friday');
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(Date.now());
    });

    it('detects abbreviated day "by Mon"', () => {
      const result = extractDeadline('review by Mon');
      expect(result).not.toBeNull();
    });
  });

  describe('month+day patterns', () => {
    it('detects "by Jan 15"', () => {
      const result = extractDeadline('submit report by Jan 15');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getMonth()).toBe(0); // January
      expect(d.getDate()).toBe(15);
    });

    it('detects "by March 10"', () => {
      const result = extractDeadline('pay invoice by March 10');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getMonth()).toBe(2); // March
      expect(d.getDate()).toBe(10);
    });
  });

  describe('"this/next week" patterns', () => {
    it('detects "this week"', () => {
      const result = extractDeadline('complete this week');
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(Date.now());
    });

    it('detects "next week"', () => {
      const result = extractDeadline('schedule for next week');
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(Date.now());
    });
  });

  describe('"by Npm/pm" time patterns', () => {
    it('detects "by 5pm"', () => {
      const result = extractDeadline('send this by 5pm');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getHours()).toBe(17);
      expect(d.getMinutes()).toBe(0);
    });

    it('detects "by 3:30 PM"', () => {
      const result = extractDeadline('meeting by 3:30 PM');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getHours()).toBe(15);
      expect(d.getMinutes()).toBe(30);
    });

    it('detects "by 9am"', () => {
      const result = extractDeadline('report by 9am');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getHours()).toBe(9);
    });
  });

  describe('deadline keyword patterns', () => {
    it('detects "deadline: 20"', () => {
      const result = extractDeadline('deadline: 20 complete the form');
      expect(result).not.toBeNull();
      const d = new Date(result!);
      expect(d.getDate()).toBe(20);
    });

    it('detects "due by 15"', () => {
      const result = extractDeadline('due by 15 submit the report');
      expect(result).not.toBeNull();
    });
  });

  it('returns a future timestamp for all non-past patterns', () => {
    const patterns = [
      'finish by tomorrow',
      'complete in 2 days',
      'submit by next week',
      'due by Friday',
    ];
    for (const p of patterns) {
      const result = extractDeadline(p);
      expect(result).not.toBeNull();
      expect(result!).toBeGreaterThan(Date.now() - DAY_MS);
    }
  });
});
