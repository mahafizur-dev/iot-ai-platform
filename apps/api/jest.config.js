/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  // @nestjs/bullmq and @nestjs/bull-shared ship ESM-only JS; jest's default
  // ignores everything under node_modules, so these need an explicit
  // carve-out to get transformed instead of hitting `SyntaxError: Unexpected
  // token 'export'`. `.` (not `/`) between "@nestjs" and the package name
  // matches both the real package dir and pnpm's flattened "@nestjs+x" store dir.
  transformIgnorePatterns: ["node_modules/(?!.*@nestjs.(bullmq|bull-shared))"],
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
};
