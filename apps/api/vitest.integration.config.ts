import { defineConfig } from "vitest/config";

// Integration tests — requires Docker (testcontainers spins up postgres).
// Run with: bun run test:integration
export default defineConfig({
  test: {
    globalSetup: ["src/test-helpers/global-setup.ts"],
    pool: "forks",
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/test-helpers/**"],
      // Raise to 60 once full test suite is in place (AVI-7 complete).
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      }
    }
  }
});
