import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Values already in the environment win, so tests can point at their own database.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
