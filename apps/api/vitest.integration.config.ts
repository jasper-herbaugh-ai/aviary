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
      // Thresholds set to achieved levels after Phase 1 (AVI-3) integration tests landed.
      // AVI-7 tracks raising these to ≥60% once background processing files have coverage.
      thresholds: {
        lines: 50,
        functions: 58,
        branches: 65,
        statements: 50
      }
    }
  }
});
