"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Re-renders the (server) page every few seconds while a payment is being
 * confirmed by the webhook. Stops after `maxTries` so a stuck page does not
 * poll forever.
 */
export function AutoRefresh({ everyMs = 3000, maxTries = 20 }: { everyMs?: number; maxTries?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= maxTries) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, everyMs);
    return () => clearTimeout(t);
  }, [tries, everyMs, maxTries, router]);
  if (tries < maxTries) return null;
  return (
    <p className="mt-4 text-sm text-ink-muted">
      Still confirming. You can safely refresh this page; your payment status is recorded as soon as Stripe confirms it.
    </p>
  );
}
