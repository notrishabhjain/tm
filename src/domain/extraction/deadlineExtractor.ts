const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function nextWeekday(dayIdx: number): number {
  const now = new Date();
  const todayIdx = now.getDay();
  let daysAhead = dayIdx - todayIdx;
  if (daysAhead <= 0) daysAhead += 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, 23, 59).getTime();
}

export function extractDeadline(text: string): number | null {
  const lower = text.toLowerCase();
  const now = new Date();

  // Today / EOD (EN + HI: aaj, aaj tak)
  if (/\b(by today|eod|end of day|by eod|end-of-day|aaj tak|aaj)\b/.test(lower)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).getTime();
  }

  // Tomorrow (EN + HI: kal, kal tak)
  if (/\b(by tomorrow|tomorrow|kal tak|kal)\b/.test(lower)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59).getTime();
  }

  // "in N days"
  const inNDays = /\bin (\d+) days?\b/.exec(lower);
  if (inNDays) {
    const n = parseInt(inNDays[1], 10);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, 23, 59).getTime();
  }

  // "by Monday/Tuesday/... (this|next)?"
  const weekdayMatch =
    /\bby (?:(?:this|next) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/.exec(
      lower
    );
  if (weekdayMatch) {
    const dayIdx = WEEKDAY_MAP[weekdayMatch[1]];
    if (dayIdx !== undefined) return nextWeekday(dayIdx);
  }

  // "by Jan 15" / "by March 10" etc.
  const monthDateMatch =
    /\bby (jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[a-z]* (\d{1,2})/.exec(
      lower
    );
  if (monthDateMatch) {
    const monthKey = monthDateMatch[1].slice(0, 3) as keyof typeof MONTH_MAP;
    const month = MONTH_MAP[monthKey];
    const day = parseInt(monthDateMatch[2], 10);
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getMonth() > month ? now.getFullYear() + 1 : now.getFullYear();
      return new Date(year, month, day, 23, 59).getTime();
    }
  }

  // "this week" → Friday
  if (/\bby this week\b|\bthis week\b/.test(lower)) {
    return nextWeekday(5);
  }

  // "next week" → next Monday
  if (/\bnext week\b/.test(lower)) {
    return nextWeekday(1);
  }

  // "by 5pm" / "by 3:30 PM"
  const timeMatch = /\bby (\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(lower);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const isPM = timeMatch[3] === 'pm';
    const hour = isPM && h < 12 ? h + 12 : !isPM && h === 12 ? 0 : h;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, m);
    if (target.getTime() < Date.now()) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  // Deadline keyword + date number "deadline: 15" / "due: 20th"
  const dueDateMatch = /\b(?:deadline|due date?|due by)[:\s]+(\d{1,2})\b/.exec(lower);
  if (dueDateMatch) {
    const day = parseInt(dueDateMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const target = new Date(now.getFullYear(), now.getMonth(), day, 23, 59);
      if (target.getTime() < Date.now()) target.setMonth(target.getMonth() + 1);
      return target.getTime();
    }
  }

  return null;
}
