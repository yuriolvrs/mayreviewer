import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    // Default to node; only the storage tests need a DOM (localStorage), and
    // they opt in with a `@vitest-environment jsdom` docblock. Spinning up
    // jsdom for the pure tests roughly doubles the suite's runtime.
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["app/lib/**/*.ts", "app/components/**/*.tsx"],
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
});
