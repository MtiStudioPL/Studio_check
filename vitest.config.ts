import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" rzuca błąd poza Reactem serwerowym — w testach to pusty moduł.
      "server-only": path.resolve(import.meta.dirname, "tests/empty.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    server: { deps: { inline: ["next", "next-auth", "@auth/core"] } },
    env: { DOOR_SECRET: "test-door-secret-".padEnd(40, "x"), ALLOWED_EMAIL_DOMAIN: "mti.edu.pl", ADMIN_NOTIFY_EMAILS: "admin@mti.edu.pl", MAIL_DISABLED: "1" },
  },
});
