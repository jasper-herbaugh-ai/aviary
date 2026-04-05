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
      // Thresholds set to achieved levels after Phase 1 (AVI-3) integration tests landed.
      // Background processing files (scheduler, alerts, SSE, gRPC) are the coverage gap.
      // AVI-7 tracks raising these to ≥60% once those files have test coverage.
      thresholds: {
        lines: 50,
        functions: 58,
        branches: 65,
        statements: 50
      }
    }
  }
});
