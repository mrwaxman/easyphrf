'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{js,jsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleNameMapper: {
    // Stub out CSS imports in component tests.
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
};
