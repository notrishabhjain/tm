const APP_NAMES: Record<string, string> = {
  'com.whatsapp': 'WhatsApp',
  'com.whatsapp.w4b': 'WhatsApp Business',
  'org.telegram.messenger': 'Telegram',
  'org.telegram.plus': 'Telegram',
  'com.google.android.gm': 'Gmail',
  'com.microsoft.teams': 'Microsoft Teams',
  'com.Slack': 'Slack', // Slack's Android package really does use a capital S
  'com.discord': 'Discord',
  'com.linkedin.android': 'LinkedIn',
  'com.facebook.katana': 'Facebook',
  'com.instagram.android': 'Instagram',
  'com.twitter.android': 'Twitter/X',
  'com.reddit.frontpage': 'Reddit',
  'com.snapchat.android': 'Snapchat',
  'com.facebook.orca': 'Messenger',
  'com.skype.raider': 'Skype',
  'com.viber.voip': 'Viber',
  'com.google.android.apps.messaging': 'Messages (SMS)',
  'com.samsung.android.messaging': 'Messages (SMS)',
  'com.android.mms': 'SMS',
  'com.google.android.calendar': 'Google Calendar',
  'com.google.android.keep': 'Google Keep',
  'com.microsoft.office.outlook': 'Outlook',
  'com.google.android.apps.tasks': 'Google Tasks',
  'com.todoist': 'Todoist',
  'com.trello': 'Trello',
  'com.asana.app': 'Asana',
  'com.atlassian.jira.mobile': 'Jira',
  'com.github.android': 'GitHub',
  'com.gitlab.android': 'GitLab',
  'com.amazon.mShop.android.shopping': 'Amazon',
  'in.amazon.mShop.android.shopping': 'Amazon',
  'com.flipkart.android': 'Flipkart',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.swiggy.android': 'Swiggy',
  'app.zomato': 'Zomato',
  'com.ubercab': 'Uber',
  'com.olacabs.customer': 'Ola',
  'com.google.android.youtube': 'YouTube',
  'com.netflix.mediaclient': 'Netflix',
  'com.spotify.music': 'Spotify',
  'com.android.chrome': 'Chrome',
};

export function appDisplayName(packageName: string): string {
  return APP_NAMES[packageName] ?? packageName.split('.').pop() ?? packageName;
}

/** True for apps that typically send personal/direct messages requiring replies. */
export function isMessagingApp(packageName: string): boolean {
  return [
    'com.whatsapp',
    'com.whatsapp.w4b',
    'org.telegram.messenger',
    'org.telegram.plus',
    'com.facebook.orca',
    'com.discord',
    'com.skype.raider',
    'com.viber.voip',
    'com.snapchat.android',
    'com.google.android.apps.messaging',
    'com.samsung.android.messaging',
    'com.android.mms',
  ].includes(packageName);
}

/** True for apps that are almost always informational/promotional with no user action. */
export function isNoiseApp(packageName: string): boolean {
  return [
    'com.amazon.mShop.android.shopping',
    'in.amazon.mShop.android.shopping',
    'com.flipkart.android',
    'com.google.android.youtube',
    'com.netflix.mediaclient',
    'com.spotify.music',
    'com.android.chrome',
    'com.google.android.apps.nbu.paisa.user',
    'net.one97.paytm',
    'com.phonepe.app',
    'com.swiggy.android',
    'app.zomato',
    'com.ubercab',
    'com.olacabs.customer',
  ].includes(packageName);
}
