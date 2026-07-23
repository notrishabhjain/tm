import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './src/app/_layout';
import { handleNotification, flushOutbox } from './src/services/pipeline';

// Background processing. The native side starts this Headless JS task whenever
// work arrives while the app's JS context is dead:
//  - notification captured  -> run the pipeline (LLM decision -> Google Tasks)
//  - jobType "flush_outbox" -> push queued tasks (e.g. from a finished call
//    analysis) to Google Tasks
AppRegistry.registerHeadlessTask('TaskMindNotificationHandler', () => async (taskData) => {
  if (taskData && taskData.jobType === 'flush_outbox') {
    await flushOutbox();
    return;
  }
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
  // Opportunistically drain the Google Tasks outbox on the same background wake.
  // The outbox is otherwise only flushed when the app is foregrounded, so any
  // task queued by an earlier token blip would stay invisible for hours while
  // the app runs in the background. flushOutbox() is cheap when empty and stops
  // at the first failure, so this stays well within the headless time budget.
  await flushOutbox().catch(() => {});
});

registerRootComponent(App);
