module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@shopify/flash-list|react-native-reanimated|@notifee|drizzle-orm|react-native-mmkv|@gorhom|lucide-react-native)',
  ],
  coverageThreshold: {
    'src/domain/**': { lines: 70, functions: 70, branches: 60 },
  },
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/domain/**/*.{ts,tsx}',
    '!src/domain/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
};
