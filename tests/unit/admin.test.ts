import { describe, expect, it } from "vitest";
import { getAdminCredentials, isAuthorized } from "@/lib/admin/basic-auth";
import { campaignUpdateSchema, detroitLocalToIso, isoToDetroitLocal } from "@/lib/admin/schemas";

const basic = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;

describe("admin basic auth", () => {
  const creds = getAdminCredentials({ ADMIN_USERNAME: "tomas", ADMIN_PASSWORD: "a-very-long-password-123" });

  it("is disabled without a strong password", () => {
    expect(getAdminCredentials({})).toBeNull();
    expect(getAdminCredentials({ ADMIN_PASSWORD: "short" })).toBeNull();
  });

  it("accepts only the right credentials", () => {
    expect(isAuthorized(basic("tomas", "a-very-long-password-123"), creds)).toBe(true);
    expect(isAuthorized(basic("tomas", "wrong-password-xxxxxxxx"), creds)).toBe(false);
    expect(isAuthorized(basic("admin", "a-very-long-password-123"), creds)).toBe(false);
    expect(isAuthorized(null, creds)).toBe(false);
    expect(isAuthorized("Basic !!!", creds)).toBe(false);
    expect(isAuthorized(basic("tomas", "a-very-long-password-123"), null)).toBe(false);
  });
});

const base = {
  name: "Founder’s Edition",
  market: "Clawson",
  state: "Michigan",
  status: "OPEN",
  price_dollars: "350",
  max_advertisers: "20",
  planned_reach: "5800",
  reach_is_estimated: "on",
  verified_reach: "",
  included_revisions: "1",
  reservation_minutes: "30",
  sales_open_at: "",
  sales_close_at: "",
  asset_deadline: "",
  proof_deadline: "",
  print_date: "",
  mailing_date: "",
  outside_fulfillment_date: "",
};

describe("campaign update validation", () => {
  it("converts dollars to cents and blanks to null", () => {
    const r = campaignUpdateSchema.parse(base);
    expect(r.price_cents).toBe(35000);
    expect(r.verified_reach).toBeNull();
    expect(r.outside_fulfillment_date).toBeNull();
    expect(r.reach_is_estimated).toBe(true);
  });

  it("requires verified reach when reach is not estimated", () => {
    const unchecked: Partial<typeof base> = { ...base };
    delete unchecked.reach_is_estimated;
    expect(campaignUpdateSchema.safeParse(unchecked).success).toBe(false);
    const ok = campaignUpdateSchema.parse({ ...unchecked, verified_reach: "5812" });
    expect(ok.reach_is_estimated).toBe(false);
    expect(ok.verified_reach).toBe(5812);
  });

  it("rejects bad values", () => {
    expect(campaignUpdateSchema.safeParse({ ...base, status: "LIVE" }).success).toBe(false);
    expect(campaignUpdateSchema.safeParse({ ...base, max_advertisers: "0" }).success).toBe(false);
    expect(campaignUpdateSchema.safeParse({ ...base, print_date: "11/02/2026" }).success).toBe(false);
  });

  it("interprets sales times in Clawson local time (EST and EDT)", () => {
    expect(detroitLocalToIso("2026-11-20T17:00")).toBe("2026-11-20T22:00:00.000Z");
    expect(detroitLocalToIso("2026-07-01T17:00")).toBe("2026-07-01T21:00:00.000Z");
    expect(isoToDetroitLocal("2026-11-20T22:00:00.000Z")).toBe("2026-11-20T17:00");
  });
});
