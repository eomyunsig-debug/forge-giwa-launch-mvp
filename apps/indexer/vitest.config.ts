import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "indexer",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
