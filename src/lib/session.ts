import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export type SessionData = { userId?: string; expiresAt?: number };

const HOUR = 60 * 60;
/** Without "Remember me" the cookie ends with the browser, and the login expires after 8 hours regardless. */
const SHORT_SESSION_SECONDS = 8 * HOUR;
/** With "Remember me" the login survives browser restarts for 30 days. */
const REMEMBER_SESSION_SECONDS = 30 * 24 * HOUR;

function sessionOptions(remember?: boolean): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters. See .env.example.");
  }
  return {
    password,
    cookieName: "codeless_session",
    // The seal must stay readable for the longest session; expiresAt enforces the shorter one.
    ttl: REMEMBER_SESSION_SECONDS,
    cookieOptions: {
      // undefined maxAge makes a browser-session cookie that is deleted when the browser closes.
      maxAge: remember ? REMEMBER_SESSION_SECONDS - 60 : undefined,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions(true));
}

/** Signs the user in. `remember` keeps them signed in for 30 days across browser restarts. */
export async function startSession(userId: string, remember: boolean) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions(remember));
  session.userId = userId;
  session.expiresAt = Date.now() + (remember ? REMEMBER_SESSION_SECONDS : SHORT_SESSION_SECONDS) * 1000;
  await session.save();
}

/** True when the session belongs to a user and has not passed its own expiry time. */
export function isActive(session: SessionData): session is SessionData & { userId: string } {
  return !!session.userId && typeof session.expiresAt === "number" && session.expiresAt > Date.now();
}

/** Returns the signed-in user with their team, or sends the visitor to the login page. */
export async function requireUser() {
  const session = await getSession();
  if (!isActive(session)) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, username: true, role: true, teamId: true, team: { select: { id: true, name: true } } },
  });
  if (!user) {
    session.destroy();
    redirect("/login");
  }
  return user;
}
