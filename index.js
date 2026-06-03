import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './src/app/_layout';
import { handleNotification } from './src/services/notification-handler';

// Background notification processing. The native TaskMindNotificationListenerService
// starts this Headless JS task (TaskMindHeadlessTaskService) whenever a notification
// arrives while the app's JS context is dead (app swiped away / killed). It runs the
// exact same pipeline as the in-app path so AI classification, task creation and the
// persistent notification keep working without the user opening the app.
AppRegistry.registerHeadlessTask('TaskMindNotificationHandler', () => async (taskData) => {
  let thread = [];
  try {
    thread = taskData && taskData.threadJson ? JSON.parse(taskData.threadJson) : [];
  } catch {
    thread = [];
  }
  const notification = {
    packageName: taskData?.packageName ?? '',
    appName: taskData?.appName ?? '',
    title: taskData?.title ?? '',
    text: taskData?.text ?? '',
    bigText: taskData?.bigText ?? '',
    subText: taskData?.subText ?? '',
    postTime: typeof taskData?.postTime === 'number' ? taskData.postTime : 0,
    notificationKey: taskData?.notificationKey ?? '',
    isGroup: Boolean(taskData?.isGroup),
    thread,
    category: taskData?.category ?? '',
    channelId: taskData?.channelId ?? '',
    importance: typeof taskData?.importance === 'number' ? taskData.importance : 3,
  };
  await handleNotification({ notification });
});

registerRootComponent(App);
