module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Inline environment variables at build time (used for commit SHA, APP_VARIANT)
      ['transform-inline-environment-variables', {
        include: [
          'NODE_ENV',
          'APP_VARIANT',
          'EXPO_PUBLIC_COMMIT_SHA',
          'EXPO_PUBLIC_BUILD_TIME',
        ],
      }],
      // Reanimated plugin must be last
      'react-native-reanimated/plugin',
    ],
  };
};
