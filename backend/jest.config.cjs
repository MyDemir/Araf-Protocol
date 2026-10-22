module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/backend/**/*.test.js'],
  modulePaths: ['<rootDir>/backend/node_modules'],
  // E1-08: clearMocks bilinçli olarak yok; cleanupSensitiveData.test.js'i kırıyor (3 test).
  testTimeout: 15000,
  // E1-08: yalnız kapsam görünürlüğü; coverageThreshold bilinçli olarak yok (CI'yı kırabilir).
  collectCoverageFrom: [
    '<rootDir>/backend/scripts/**/*.js',
    '!<rootDir>/backend/scripts/**/node_modules/**',
  ],
};
