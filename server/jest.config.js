export default {
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/socket/**'],
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
