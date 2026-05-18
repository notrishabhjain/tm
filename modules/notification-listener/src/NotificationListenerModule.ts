import { requireNativeModule } from 'expo-modules-core';

// requireNativeModule looks for the native module registered as
// "NotificationListenerModule" — matches the name in NotificationModule.kt
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NotificationListenerModule = requireNativeModule('NotificationListenerModule') as any;

export default NotificationListenerModule;
