import { afterEach, describe, expect, it, vi } from "vitest";
import { isStripeCheckoutEnabled, stripeKeyStatus } from "@/lib/stripe/config";

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
