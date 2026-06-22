import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/release/**/*.test.ts"]
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".mjs"]
  }
});
