/**
 * Creates or updates a user in a team.
 *
 * Usage:
 *   npm run user:create -- --username pilottest1 --password '...' [--name "Pilot Test 1"] [--role MEMBER|ADMIN] [--team "QA Team"]
 *   npm run user:create -- --email someone@example.com --password '...'
 */
import { parseArgs } from "node:util";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });

const { values } = parseArgs({
  options: {
    username: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "MEMBER" },
    team: { type: "string", default: "QA Team" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const username = values.username?.trim().toLowerCase();
const email = values.email?.trim().toLowerCase();
const roleInput = values.role?.toUpperCase();
if (!username && !email) fail("Give --username or --email.");
if (username && !/^[a-z0-9._-]{3,32}$/.test(username)) fail("Username must be 3-32 letters, digits, dots, dashes or underscores.");
if (email && !email.includes("@")) fail("Email must contain @.");
if (!values.password) fail("Give --password.");
if (roleInput !== "MEMBER" && roleInput !== "ADMIN") fail("Role must be MEMBER or ADMIN.");
const role: "MEMBER" | "ADMIN" = roleInput;

const url = process.env.DATABASE_URL ?? fail("DATABASE_URL is not set.");
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const team = await db.team.upsert({ where: { name: values.team! }, update: {}, create: { name: values.team! } });
  const passwordHash = await bcrypt.hash(values.password!, 12);
  const name = values.name ?? username ?? email!;
  const where = username ? { username } : { email: email! };

  const user = await db.user.upsert({
    where,
    update: { passwordHash, role, teamId: team.id, ...(values.name ? { name } : {}) },
    create: { username, email, name, passwordHash, role, teamId: team.id },
  });
  console.log(`User ${username ?? email} (${user.role}) is ready in team "${team.name}".`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
