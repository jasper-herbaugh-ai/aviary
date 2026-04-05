import { defineConfig } from "vitest/config";

// Unit tests only — no database required.
// For integration tests (requires Docker): vitest.integration.config.ts
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "src/api.integration.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/test-helpers/**"],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      }
    }
  }
});
