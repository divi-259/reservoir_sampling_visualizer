module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
        diagnostics: {
          ignoreCodes: [151002]
        }
      }
    ]
  }
};
