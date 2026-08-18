const { withAndroidManifest } = require('@expo/config-plugins');

function withNotificationListenerManifest(config) {
  return withAndroidManifest(config, async (modConfig) => {
    const manifest = modConfig.modResults;
    const application = manifest.manifest.application[0];

    application.service = application.service ?? [];
    application.receiver = application.receiver ?? [];

    // TaskMindNotificationListenerService
    const nlsExists = application.service.some(
      (s) =>
        s.$?.['android:name'] ===
        'expo.modules.notificationlistener.TaskMindNotificationListenerService'
    );
    if (!nlsExists) {
      application.service.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.TaskMindNotificationListenerService',
          'android:label': 'TaskMind Notification Listener',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.service.notification.NotificationListenerService' } },
            ],
          },
        ],
      });
    }

    // TaskMindForegroundService
    const fgsExists = application.service.some(
      (s) => s.$?.['android:name'] === 'expo.modules.notificationlistener.TaskMindForegroundService'
    );
    if (!fgsExists) {
      application.service.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.TaskMindForegroundService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }

    // CallTranscriptionService
    const ctsExists = application.service.some(
      (s) => s.$?.['android:name'] === 'expo.modules.notificationlistener.CallTranscriptionService'
    );
    if (!ctsExists) {
      application.service.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.CallTranscriptionService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }

    // TranscriptShareActivity — appears in the recorder app's share sheet so a
    // transcribed call can be handed to TaskMind without guessing where the
    // recorder writes its files. Exported because that is what a share target is.
    application.activity = application.activity || [];
    const shareExists = application.activity.some(
      (a) => a.$?.['android:name'] === 'expo.modules.notificationlistener.TranscriptShareActivity'
    );
    if (!shareExists) {
      application.activity.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.TranscriptShareActivity',
          'android:exported': 'true',
          'android:excludeFromRecents': 'true',
          'android:noHistory': 'true',
          'android:taskAffinity': '',
          'android:label': 'Import call transcript',
          'android:theme': '@android:style/Theme.NoDisplay',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
            data: [{ $: { 'android:mimeType': 'text/plain' } }],
          },
        ],
      });
    }

    // BootReceiver
    const bootExists = application.receiver.some(
      (r) => r.$?.['android:name'] === 'expo.modules.notificationlistener.BootReceiver'
    );
    if (!bootExists) {
      application.receiver.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.BootReceiver',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            ],
          },
        ],
      });
    }

    // PhoneStateReceiver — static call-ended trigger for call transcription.
    // Must stay in sync with the hand-maintained android/ manifest.
    const phoneStateExists = application.receiver.some(
      (r) => r.$?.['android:name'] === 'expo.modules.notificationlistener.PhoneStateReceiver'
    );
    if (!phoneStateExists) {
      application.receiver.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.PhoneStateReceiver',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.PHONE_STATE' } }],
          },
        ],
      });
    }

    return modConfig;
  });
}

module.exports = withNotificationListenerManifest;
