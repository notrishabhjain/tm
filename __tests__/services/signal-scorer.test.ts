/**
 * Signal scorer tests.
 *
 * The scorer reads three things from the DB (sender stats, learned keywords,
 * recent thread tasks), each wrapped in try/catch with safe fallbacks. We mock
 * `@/data/db/client` with a thenable query builder that resolves rows based on
 * the table passed to `.from()`. A module-level `mockSenderRow` lets each test
 * choose the sender tier; learned-keyword and recent-task queries return [].
 *
 * `mock`-prefixed identifiers are hoisted by babel-jest ahead of jest.mock().
 */

import type { NotificationData } from '../../modules/notification-listener/src/types';

interface MockSenderRow {
  senderKey: string;
  confirmCount: number;
  rejectCount: number;
  autoAcceptCount: number;
  lastSeenAt: number;
  tier: string;
  seedTrust: number | null;
}

// Default: a trusted WORK sender so scoring (not the UNKNOWN→CONFIRM path) is exercised.
let mockSenderRow: MockSenderRow | null = {
  senderKey: 'com.whatsapp::boss',
  confirmCount: 8,
  rejectCount: 1,
  autoAcceptCount: 4,
  lastSeenAt: Date.now(),
  tier: 'WORK',
  seedTrust: null,
};

function mockTableName(tableObj: unknown): string {
  const nameSym = Symbol.for('drizzle:Name');
  return (tableObj as Record<symbol, string>)?.[nameSym] ?? String(tableObj);
}

jest.mock('@/data/db/client', () => {
  const makeBuilder = () => {
    let table = '';
    const builder: Record<string, unknown> = {
      from(t: unknown) {
        table = mockTableName(t);
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve: (rows: unknown[]) => void) {
        if (table === 'sender_stats') {
          resolve(mockSenderRow ? [mockSenderRow] : []);
        } else {
          resolve([]); // learned_keywords, tasks
        }
      },
    };
    return builder;
  };

  return {
    db: {
      select: () => makeBuilder(),
    },
    initializeDatabase: jest.fn(),
  };
});

import { scoreNotification, buildSenderKey } from '@/services/signal-scorer';

function notif(overrides: Partial<NotificationData> = {}): NotificationData {
  return {
    packageName: 'com.whatsapp',
    appName: 'WhatsApp',
    title: 'Boss',
    text: '',
    bigText: '',
    subText: '',
    postTime: Date.now(),
    isGroup: false,
    thread: [],
    ...overrides,
  } as NotificationData;
}

function workSender(): void {
  mockSenderRow = {
    senderKey: 'com.whatsapp::boss',
    confirmCount: 8,
    rejectCount: 1,
    autoAcceptCount: 4,
    lastSeenAt: Date.now(),
    tier: 'WORK',
    seedTrust: null,
  };
}

beforeEach(() => {
  workSender();
});

describe('buildSenderKey', () => {
  it('normalizes sender into a stable key', () => {
    expect(buildSenderKey('com.whatsapp', 'Ravi Sharma')).toBe('com.whatsapp::ravi_sharma');
  });
});

describe('force discard — definitive non-tasks', () => {
  const cases: Array<{ name: string; text: string; reason: string; signal: string }> = [
    {
      name: 'OTP code',
      text: '123456 is your OTP for login. Do not share it with anyone.',
      reason: 'SPAM_OR_OTP',
      signal: 'otp_code',
    },
    {
      name: 'verification code phrasing',
      text: 'Your verification code is 8842',
      reason: 'SPAM_OR_OTP',
      signal: 'otp_code',
    },
    {
      name: 'bank debit alert',
      text: 'Rs. 2,500 has been debited from your account XX1234 on 23-May.',
      reason: 'ANTI_PATTERN',
      signal: 'transaction_alert',
    },
    {
      name: 'UPI credit',
      text: 'UPI payment of Rs 500 received successfully from Amit.',
      reason: 'ANTI_PATTERN',
      signal: 'transaction_alert',
    },
    {
      name: 'shipment delivered',
      text: 'Your order #A123 has been delivered. Thank you for shopping with us.',
      reason: 'ANTI_PATTERN',
      signal: 'shipment_status',
    },
    {
      name: 'promotional discount',
      text: 'FLAT 50% off on all items! Limited time offer, shop now!',
      reason: 'ANTI_PATTERN',
      signal: 'promotional',
    },
    {
      name: 'news headline',
      text: 'BREAKING: Markets hit record high amid global rally',
      reason: 'ANTI_PATTERN',
      signal: 'news_or_sports',
    },
    {
      name: 'empty body',
      text: '  ',
      reason: 'TOO_SHORT',
      signal: 'empty_content',
    },
  ];

  for (const c of cases) {
    it(`discards ${c.name}`, async () => {
      const result = await scoreNotification(notif({ bigText: c.text }));
      expect(result.decision).toBe('DISCARD');
      expect(result.discardReason).toBe(c.reason);
      expect(result.signals).toContain(c.signal);
    });
  }

  it('discards system-level packages', async () => {
    const result = await scoreNotification(
      notif({ packageName: 'android', bigText: 'Screenshot saved' })
    );
    expect(result.decision).toBe('DISCARD');
    expect(result.signals).toContain('system_message');
  });
});

describe('positive signals create tasks for trusted senders', () => {
  it('creates on a direct imperative with deadline', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'Please send the report by EOD today.' })
    );
    expect(result.decision).toBe('CREATE');
    expect(result.signals).toContain('direct_imperative_en');
    expect(result.signals).toContain('deadline_en');
  });

  it('detects hinglish code-switched actions', async () => {
    const result = await scoreNotification(notif({ bigText: 'report send kar do aaj tak' }));
    expect(result.signals).toContain('hinglish_action');
    expect(result.decision).toBe('CREATE');
  });

  it('boosts a polite request', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'Could you please review the document when you get a chance?' })
    );
    expect(result.signals).toContain('polite_request');
  });

  it('flags compound multi-action asks', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'Please send the deck and schedule the review call.' })
    );
    expect(result.signals).toContain('compound_action');
  });

  it('extracts a deadline timestamp', async () => {
    const result = await scoreNotification(notif({ bigText: 'submit this by tomorrow please' }));
    expect(result.extractedDeadline).not.toBeNull();
  });
});

describe('negative signals suppress non-actionable messages', () => {
  it('suppresses negated actions', async () => {
    const result = await scoreNotification(
      notif({ bigText: "Don't send the report, I'll handle it myself." })
    );
    expect(result.signals).toContain('negation_action');
    expect(result.decision).not.toBe('CREATE');
  });

  it('suppresses self-completed updates', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'I have already sent the report to the client.' })
    );
    expect(result.signals).toContain('self_completed');
  });

  it('suppresses auto-replies', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'I am out of office until Monday and will respond soon.' })
    );
    expect(result.signals).toContain('auto_reply');
    expect(result.decision).not.toBe('CREATE');
  });

  it('penalizes forwarded chains', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'Fwd: please review the attached agenda' })
    );
    expect(result.signals).toContain('forward_chain');
  });

  it('penalizes bare link shares', async () => {
    const result = await scoreNotification(notif({ bigText: 'check this https://example.com/x' }));
    expect(result.signals).toContain('link_share');
  });
});

describe('unknown senders always go to confirmation', () => {
  it('routes unknown sender to CONFIRM even with a strong signal', async () => {
    mockSenderRow = null; // no sender stats → UNKNOWN tier
    const result = await scoreNotification(
      notif({ bigText: 'Please send the report by EOD today.' })
    );
    expect(result.decision).toBe('CONFIRM');
  });
});

describe('priority derivation', () => {
  it('marks deadline + high score as URGENT', async () => {
    const result = await scoreNotification(
      notif({ bigText: 'Please send the signed contract ASAP today, it is overdue.' })
    );
    expect(['URGENT', 'HIGH']).toContain(result.priority);
  });
});
