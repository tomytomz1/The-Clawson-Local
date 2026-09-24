"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const PRIVATE_QUERY_KEYS = ["session_id", "reservation", "hold", "checkout", "token"] as const;

function sanitizedPageLocation(): string {
  const url = new URL(window.location.href);
  for (const key of PRIVATE_QUERY_KEYS) url.searchParams.delete(key);
  return url.toString();
}

function PageViewTracker() {
  const pathname = usePathname();
  const initialRender = useRef(true);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    if (!measurementId || !window.gtag) return;

    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: sanitizedPageLocation(),
      page_path: pathname,
    });
  }, [pathname]);

  return null;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  if (!measurementId) return null;

  const privateKeys = JSON.stringify(PRIVATE_QUERY_KEYS);
  const init = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    var pageLocation = new URL(window.location.href);
    ${privateKeys}.forEach(function(key){ pageLocation.searchParams.delete(key); });
    gtag('config', '${measurementId}', { page_location: pageLocation.toString() });
  `;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {init}
      </Script>
      <PageViewTracker />
    </>
  );
}
