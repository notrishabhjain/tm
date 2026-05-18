const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Support for .sql migration files (Drizzle)
config.resolver.assetExts.push('sql');

// Ensure source extensions are correct
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'mjs',
  'cjs',
];

module.exports = config;
