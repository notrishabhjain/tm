import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './src/app/_layout';
import { handleNotification } from './src/services/notification-handler';

// Register headless task for background notification processing
AppRegistry.registerHeadlessTask('TaskMindNotificationHandler', () => handleNotification);

registerRootComponent(App);
