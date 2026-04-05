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
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/test-helpers/**",
        // Infrastructure files only covered by integration tests (server, env, queue)
        "src/server.ts",
        "src/env.ts",
        "src/queue.ts"
      ],
      thresholds: {
        lines: 60,
        functions: 65,
        branches: 70,
        statements: 60
      }
    }
  }
});
