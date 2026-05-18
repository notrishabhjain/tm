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

    // QuickActionReceiver
    const qaExists = application.receiver.some(
      (r) => r.$?.['android:name'] === 'expo.modules.notificationlistener.QuickActionReceiver'
    );
    if (!qaExists) {
      application.receiver.push({
        $: {
          'android:name': 'expo.modules.notificationlistener.QuickActionReceiver',
          'android:exported': 'false',
        },
      });
    }

    return modConfig;
  });
}

module.exports = withNotificationListenerManifest;
