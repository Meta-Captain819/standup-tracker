// Base Prisma client for the Express backend.
//
// Prisma 7 runs all queries through a driver adapter. Per architecture §4/§5 the runtime
// connects to Neon's POOLED endpoint (DATABASE_URL) via a warm pg pool; migrations use
// DIRECT_URL (configured in prisma.config.ts).
//
// Team-scoped data access must go through the tenant-scoping data-access layer built on top
// of this client — never call it directly from a handler for team data.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
