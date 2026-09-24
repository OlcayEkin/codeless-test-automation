import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { clearFailures, isLocked, recordFailure } from "./login-guard";

export const credentialsSchema = z.object({
  // An email address or a username. Both are stored in lower case.
  login: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(200),
});

// Compared against when the login is unknown, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

export async function verifyCredentials(input: unknown): Promise<LoginResult> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter your email or username and password." };
  const { login, password } = parsed.data;

  if (isLocked(login)) {
    return { ok: false, error: "Too many failed attempts. Try again in 15 minutes." };
  }

  const user = await db.user.findFirst({
    where: login.includes("@") ? { email: login } : { username: login },
    select: { id: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    recordFailure(login);
    return { ok: false, error: "Login or password is incorrect." };
  }
  clearFailures(login);
  return { ok: true, userId: user.id };
}
