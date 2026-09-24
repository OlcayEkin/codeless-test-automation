import Link from "next/link";

export const metadata = { title: "Not found" };

/** Shown for unknown pages, and for plans or runs that belong to another team. */
export default function NotFound() {
  return (
    <main className="auth">
      <section className="card">
        <h1>Page not found</h1>
        <p className="muted">This page does not exist, or it belongs to another team.</p>
        <p>
          <Link href="/dashboard">Go to your test plans</Link>
        </p>
      </section>
    </main>
  );
}
