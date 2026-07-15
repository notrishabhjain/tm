import {
  appDisplayName,
  isMessagingApp,
  isNoiseApp,
  MESSAGING_APPS,
} from '../../src/services/app-name-map';

describe('appDisplayName', () => {
  it('maps known packages to friendly names', () => {
    expect(appDisplayName('com.whatsapp')).toBe('WhatsApp');
    expect(appDisplayName('com.whatsapp.w4b')).toBe('WhatsApp Business');
    expect(appDisplayName('call.transcript')).toBe('Phone call');
    expect(appDisplayName('com.Slack')).toBe('Slack');
  });

  it('falls back to the last package segment for unknown apps', () => {
    expect(appDisplayName('com.example.someapp')).toBe('someapp');
  });

  it('returns the raw string when there is no dot to split on', () => {
    expect(appDisplayName('weirdapp')).toBe('weirdapp');
  });
});

describe('MESSAGING_APPS (native notification filter)', () => {
  it('covers the core messaging apps', () => {
    for (const pkg of [
      'com.whatsapp',
      'com.whatsapp.w4b',
      'org.telegram.messenger',
      'org.thoughtcrime.securesms',
      'com.google.android.apps.messaging',
      'com.microsoft.teams',
      'com.Slack',
      'com.google.android.gm',
    ]) {
      expect(MESSAGING_APPS).toContain(pkg);
    }
  });

  it('contains no duplicates (a duplicate would be a filter-set typo)', () => {
    expect(new Set(MESSAGING_APPS).size).toBe(MESSAGING_APPS.length);
  });

  it('isMessagingApp agrees with the list', () => {
    expect(isMessagingApp('com.whatsapp')).toBe(true);
    expect(isMessagingApp('com.amazon.mShop.android.shopping')).toBe(false);
  });
});

describe('isNoiseApp', () => {
  it('flags shopping/entertainment apps, never messaging apps', () => {
    expect(isNoiseApp('com.amazon.mShop.android.shopping')).toBe(true);
    expect(isNoiseApp('com.swiggy.android')).toBe(true);
    for (const pkg of MESSAGING_APPS) {
      expect(isNoiseApp(pkg)).toBe(false);
    }
  });
});
