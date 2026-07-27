import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "chain-config",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
