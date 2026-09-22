import { describe, expect, it } from "vitest";
import { formatAvailability, getCampaignProgress } from "@/lib/inventory/progress";
import { makeCampaign } from "../support/fixtures";

describe("campaign progress", () => {
  const c = makeCampaign();
  it.each([
    [0, "0 of 20", false],
    [1, "1 of 20", false],
    [19, "19 of 20", false],
    [20, "20 of 20", true],
  ])("%i sold -> %s", (sold, text, soldOut) => {
    const p = getCampaignProgress(c, sold);
    expect(`${p.claimed} of ${p.max}`).toBe(text);
    expect(p.soldOut).toBe(soldOut);
  });

  it("is based on advertiser positions, not category count", () => {
    // 30+ categories exist, but progress is always out of maxAdvertisers.
    expect(getCampaignProgress(c, 5).max).toBe(20);
    expect(getCampaignProgress(c, 5).percent).toBe(25);
  });

  it("treats a SOLD_OUT campaign as sold out", () => {
    expect(getCampaignProgress(makeCampaign({ status: "SOLD_OUT" }), 3).soldOut).toBe(true);
  });

  it("labels statuses for humans", () => {
    expect(formatAvailability("AVAILABLE")).toBe("Available");
    expect(formatAvailability("HELD")).toBe("Checkout in progress");
    expect(formatAvailability("SOLD")).toBe("Claimed");
    expect(formatAvailability("CLOSED")).toBe("Closed");
  });
});
