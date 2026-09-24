import { redirect } from "next/navigation";
import { getSession, isActive } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (isActive(session)) redirect("/dashboard");

  return (
    <main className="auth">
      <section className="card">
        <h1>Codeless Test Automation</h1>
        <p className="muted">Sign in to your team workspace.</p>
        <LoginForm />
      </section>
    </main>
  );
}
