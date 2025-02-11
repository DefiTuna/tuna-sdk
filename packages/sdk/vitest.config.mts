import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["./**/*.spec.{ts,tsx}"],
    globals: true,
    passWithNoTests: true,
    setupFiles: ["dotenv/config"],
  },
  plugins: [tsconfigPaths()],
});
