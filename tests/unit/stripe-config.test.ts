import { afterEach, describe, expect, it, vi } from "vitest";
import {
  StripeNotConfiguredError,
  expectedLivemode,
  getStripe,
  isStripeCheckoutEnabled,
  stripeKeyMode,
  stripeKeyStatus,
} from "@/lib/stripe/config";

describe("stripe key guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("classifies keys and blocks live keys unless explicitly allowed", () => {
    expect(stripeKeyStatus(undefined)).toBe("missing");
    expect(stripeKeyStatus("sk_test_abc")).toBe("test");
    expect(stripeKeyStatus("rk_test_abc")).toBe("test");
    expect(stripeKeyStatus("pk_test_abc")).toBe("missing"); // publishable keys are never used server-side
    expect(stripeKeyStatus("sk_live_abc")).toBe("live_blocked");
    vi.stubEnv("STRIPE_ALLOW_LIVE", "true");
    expect(stripeKeyStatus("sk_live_abc")).toBe("live");
  });

  it("checkout is disabled without a key or with a blocked live key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(isStripeCheckoutEnabled()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    expect(isStripeCheckoutEnabled()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    expect(isStripeCheckoutEnabled()).toBe(true);
  });
});

describe("webhook livemode is independent of public checkout permission", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("live key + STRIPE_ALLOW_LIVE=false: checkout closed, live events expected", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("STRIPE_ALLOW_LIVE", "false");
    expect(isStripeCheckoutEnabled()).toBe(false);
    expect(expectedLivemode()).toBe(true);
  });

  it("live key + STRIPE_ALLOW_LIVE unset: checkout closed, live events expected", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "rk_live_abc");
    vi.stubEnv("STRIPE_ALLOW_LIVE", "");
    expect(isStripeCheckoutEnabled()).toBe(false);
    expect(expectedLivemode()).toBe(true);
  });

  it("live key + STRIPE_ALLOW_LIVE=true: checkout open, live events expected", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("STRIPE_ALLOW_LIVE", "true");
    expect(isStripeCheckoutEnabled()).toBe(true);
    expect(expectedLivemode()).toBe(true);
  });

  it("test key: live events not expected (even if STRIPE_ALLOW_LIVE=true)", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    expect(expectedLivemode()).toBe(false);
    vi.stubEnv("STRIPE_ALLOW_LIVE", "true");
    expect(expectedLivemode()).toBe(false);
    expect(stripeKeyMode("rk_test_abc")).toBe("test");
  });

  it("missing or invalid key: checkout fails closed and live events not expected", () => {
    for (const key of ["", "pk_live_abc", "garbage"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", key);
      vi.stubEnv("STRIPE_ALLOW_LIVE", "true");
      expect(isStripeCheckoutEnabled()).toBe(false);
      expect(expectedLivemode()).toBe(false);
      expect(() => getStripe()).toThrow(StripeNotConfiguredError);
    }
  });

  it("a blocked live key still cannot create a Stripe client", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("STRIPE_ALLOW_LIVE", "false");
    expect(() => getStripe()).toThrow(StripeNotConfiguredError);
  });
});
