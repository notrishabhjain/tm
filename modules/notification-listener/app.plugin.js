const { withAndroidManifest, withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');
const path = require('path');

/**
 * Expo config plugin for the TaskMind custom notification listener module.
 * Wires the local Kotlin module into the Android build system.
 */
const withNotificationListener = (config) => {
  // 1. Include the module in settings.gradle
  config = withSettingsGradle(config, (mod) => {
    const modulePath = "':notification-listener', project.file('./modules/notification-listener/android')";
    if (!mod.modResults.contents.includes(':notification-listener')) {
      mod.modResults.contents += `\ninclude ${modulePath}\n`;
    }
    return mod;
  });

  // 2. Add the module as an implementation dependency in app/build.gradle
  config = withAppBuildGradle(config, (mod) => {
    const dep = "implementation project(':notification-listener')";
    if (!mod.modResults.contents.includes(dep)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${dep}`
      );
    }
    return mod;
  });

  return config;
};

module.exports = withNotificationListener;
