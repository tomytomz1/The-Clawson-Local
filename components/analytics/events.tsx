"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect } from "react";
import { sanitizedPageLocation } from "./google-analytics";

type EventParams = Record<string, unknown>;

type EcommerceItem = {
  item_id: string;
  item_name: string;
  item_category: string;
  item_category2?: string;
};

function ensureGtag(): (...args: unknown[]) => void {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = (function () {
      window.dataLayer!.push(arguments);
    }) as (...args: unknown[]) => void;
  }
  return window.gtag;
}

function track(name: string, params: EventParams) {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || typeof window === "undefined") return;
  // The gtag config pins page_location to the landing URL, so pass the
  // current (sanitized) URL or every funnel event reports the landing page.
  ensureGtag()("event", name, { page_location: sanitizedPageLocation(), ...params });
}

function item(categorySlug: string, categoryName: string, campaignName: string, marketName: string): EcommerceItem {
  return {
    item_id: categorySlug,
    item_name: categoryName,
    item_category: campaignName,
    item_category2: marketName,
  };
}

export function CategoryViewTracker({
  categorySlug,
  categoryName,
  campaignName,
  marketName,
  value,
}: {
  categorySlug: string;
  categoryName: string;
  campaignName: string;
  marketName: string;
  value: number;
}) {
  useEffect(() => {
    track("view_item", {
      currency: "USD",
      value,
      items: [item(categorySlug, categoryName, campaignName, marketName)],
    });
  }, [categorySlug, categoryName, campaignName, marketName, value]);

  return null;
}

export function TrackedCheckoutForm({
  categorySlug,
  categoryName,
  campaignName,
  marketName,
  value,
  children,
}: {
  categorySlug: string;
  categoryName: string;
  campaignName: string;
  marketName: string;
  value: number;
  children: ReactNode;
}) {
  function handleSubmit(_event: FormEvent<HTMLFormElement>) {
    track("begin_checkout", {
      currency: "USD",
      value,
      transport_type: "beacon",
      items: [item(categorySlug, categoryName, campaignName, marketName)],
    });
  }

  return (
    <form action="/api/checkout" method="post" onSubmit={handleSubmit}>
      {children}
    </form>
  );
}

export function PurchaseTracker({
  transactionId,
  categorySlug,
  categoryName,
  campaignName,
  marketName,
  value,
  currency,
}: {
  transactionId: string;
  categorySlug: string;
  categoryName: string;
  campaignName: string;
  marketName: string;
  value: number;
  currency: string;
}) {
  useEffect(() => {
    const dedupeKey = `ga4-purchase:${transactionId}`;
    if (sessionStorage.getItem(dedupeKey)) return;

    track("purchase", {
      transaction_id: transactionId,
      value,
      currency: currency.toUpperCase(),
      items: [item(categorySlug, categoryName, campaignName, marketName)],
    });
    sessionStorage.setItem(dedupeKey, "1");
  }, [transactionId, categorySlug, categoryName, campaignName, marketName, value, currency]);

  return null;
}
