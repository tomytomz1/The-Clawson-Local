"use client";

import { useEffect } from "react";

/**
 * Shown when live campaign/inventory data cannot be loaded. Deliberately
 * offers no purchase path: availability must never be implied from stale data.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-page py-24 text-center">
      <p className="eyebrow">Availability temporarily unavailable</p>
      <h1 className="headline mx-auto mt-3 max-w-2xl text-4xl">
        We can&apos;t load current category availability right now.
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
        Please try again in a few minutes. Categories are only secured by completed payment, so nothing is lost by
        waiting. Questions: <a href="mailto:hello@theclawsonlocal.com" className="text-accent underline">hello@theclawsonlocal.com</a>
      </p>
      <button type="button" onClick={reset} className="btn-secondary mt-8">
        Try again
      </button>
    </div>
  );
}
