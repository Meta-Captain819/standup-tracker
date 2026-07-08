// Prisma CLI configuration (migrations, introspection, generate).
// Loads .env so the CLI can resolve DIRECT_URL.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations & introspection use Neon's DIRECT (unpooled) endpoint — never the pooler (architecture §4).
    // Runtime pooling is handled by the pg adapter against DATABASE_URL (src/db/prisma.ts).
    url: process.env.DIRECT_URL,
  },
});
