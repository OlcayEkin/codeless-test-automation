"use client";

import { useEffect } from "react";

// Shown when a page fails on the server, for example when the database is unavailable.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth">
      <section className="card" role="alert">
        <h1>Something went wrong</h1>
        <p className="muted">The page could not load. Please try again in a moment.</p>
        {error.digest && <p className="muted">Reference: {error.digest}</p>}
        <div className="form">
          <button type="button" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
