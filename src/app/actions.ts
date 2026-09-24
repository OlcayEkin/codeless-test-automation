"use server";

import { redirect } from "next/navigation";
import { verifyCredentials } from "@/lib/auth";
import { getSession, startSession } from "@/lib/session";

export type LoginState = { error?: string; login?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const login = String(formData.get("login") ?? "");
  try {
    const result = await verifyCredentials({ login, password: formData.get("password") });
    if (!result.ok) return { error: result.error, login };

    await startSession(result.userId, formData.get("remember") === "on");
  } catch (error) {
    console.error("Login failed unexpectedly", error);
    return { error: "Sign-in is temporarily unavailable. Please try again.", login };
  }
  // redirect() works by throwing, so it must stay outside the try block.
  redirect("/dashboard");
}

// If logout fails, the error reaches app/error.tsx, which offers a retry.
export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
