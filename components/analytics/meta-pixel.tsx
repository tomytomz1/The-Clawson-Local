"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type MetaParams = Record<string, unknown>;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: (...args: unknown[]) => void;
  }
}

/** Send a standard Meta Pixel event without PII. No-op until a Pixel ID is configured. */
export function trackMetaEvent(name: string, params?: MetaParams) {
  if (!pixelId || typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", name, params ?? {});
}

function MetaPageViewTracker() {
  const pathname = usePathname();
  const initialRender = useRef(true);

  useEffect(() => {
    // The base snippet sends the initial PageView. Only send subsequent
    // client-side route changes here so SPA navigation is not double-counted.
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    trackMetaEvent("PageView");
  }, [pathname]);

  return null;
}

export function MetaPixel() {
  if (!pixelId) return null;

  const init = `
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${pixelId}');
    fbq('track', 'PageView');
  `;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {init}
      </Script>
      <MetaPageViewTracker />
    </>
  );
}
