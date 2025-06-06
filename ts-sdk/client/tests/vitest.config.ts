import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: [
      [
        "default",
        {
          summary: false,
        },
      ],
    ],
  },
});
