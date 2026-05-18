module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'transform-inline-environment-variables',
        {
          include: ['EXPO_PUBLIC_COMMIT_SHA', 'NODE_ENV'],
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
