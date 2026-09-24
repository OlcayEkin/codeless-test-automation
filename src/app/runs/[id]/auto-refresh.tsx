"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Reloads the server data on an interval while a run is in progress. Stops when the page no longer renders it. */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
