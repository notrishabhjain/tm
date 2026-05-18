/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterFramework: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@shopify/flash-list|react-native-reanimated|@notifee|drizzle-orm|react-native-mmkv|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|lucide-react-native|react-native-svg|@gorhom)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/android/', '/ios/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    'src/services/extraction/**/*.{ts,tsx}',
    '!**/__tests__/**',
    '!**/index.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    // Start lenient — tighten to 70 as domain layer fills out
    global: {
      lines: 50,
      functions: 50,
      branches: 40,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testEnvironment: 'node',
  // Silence noisy native module warnings in tests
  silent: false,
  verbose: true,
  // Timeout for async tests
  testTimeout: 10000,
};
