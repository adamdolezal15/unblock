import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@/...` as in tsconfig.json paths, so route handlers can be tested directly.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
