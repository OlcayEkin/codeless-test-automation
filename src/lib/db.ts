import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

// Reuse one client across hot reloads in development, but not across a regenerated client:
// after a schema change `prisma generate` rewrites the client, this module reloads with a new
// PrismaClient class, and the old instance would not know the new tables.
const globalForDb = globalThis as unknown as { db?: PrismaClient };
const cached = globalForDb.db;
const isCurrent = cached instanceof PrismaClient;
if (cached && !isCurrent) void (cached as { $disconnect?: () => Promise<void> }).$disconnect?.().catch(() => undefined);
export const db = isCurrent ? cached : createClient();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
