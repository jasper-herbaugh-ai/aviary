import { defineConfig } from "vitest/config";

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
      thresholds: {
        lines: 60,
        functions: 65,
        branches: 70,
        statements: 60
      }
    }
  }
});
