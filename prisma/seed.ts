import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const providedPassword = process.env.SEED_ADMIN_PASSWORD;
  const team = await db.team.upsert({ where: { name: "QA Team" }, update: {}, create: { name: "QA Team" } });

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && !providedPassword) {
    await db.user.update({ where: { email }, data: { role: "ADMIN" } });
    console.log(`Seed: admin ${email} in team "${team.name}" already exists. Role set to ADMIN, password unchanged.`);
    return;
  }

  const password = providedPassword || randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { passwordHash, teamId: team.id, role: "ADMIN" },
    create: { email, name: "Admin", passwordHash, teamId: team.id, role: "ADMIN" },
  });

  console.log(`Seed: admin ${email} in team "${team.name}".`);
  if (!providedPassword) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
