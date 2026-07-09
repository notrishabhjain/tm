module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|expo|@expo|@shopify/flash-list|react-native-reanimated|@notifee|drizzle-orm|react-native-mmkv|@gorhom|lucide-react-native)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/services/**/*.{ts,tsx}', '!src/**/__tests__/**'],
};
