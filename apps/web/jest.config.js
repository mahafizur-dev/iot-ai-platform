const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Jest's haste-map crawls the whole project regardless of testPathIgnorePatterns;
  // without this it trips over .next mid-write when `build` runs concurrently
  // with `test` (e.g. `turbo run build test`).
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
};

module.exports = createJestConfig(customJestConfig);
