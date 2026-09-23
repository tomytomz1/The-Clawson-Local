import { describe, expect, it } from "vitest";
import {
  formatCampaignDate,
  formatCampaignPrice,
  getCostPerResidenceLabel,
  getPlannedReachPhrase,
  getReachLabel,
  isCheckoutOpen,
} from "@/lib/campaign/format";
import { makeCampaign } from "../support/fixtures";

describe("campaign copy helpers", () => {
  it("qualifies estimated reach with 'approximately'", () => {
    const c = makeCampaign();
    expect(getReachLabel(c)).toBe("approximately 5,800 Clawson residences");
    expect(getPlannedReachPhrase(c)).toBe("planned for approximately 5,800 Clawson residences");
  });

  it("renders verified reach without 'approximately', using the verified count", () => {
    const c = makeCampaign({ reachIsEstimated: false, verifiedReach: 5812 });
    expect(getReachLabel(c)).toBe("5,812 Clawson residences");
    expect(getReachLabel(c)).not.toMatch(/approximately/);
  });

  it("formats price from cents", () => {
    expect(formatCampaignPrice(makeCampaign())).toBe("$350");
    expect(formatCampaignPrice(makeCampaign({ priceCents: 42550 }))).toBe("$425.50");
  });

  it("derives cost per residence from price and reach", () => {
    expect(getCostPerResidenceLabel(makeCampaign())).toBe("About 6¢");
    expect(getCostPerResidenceLabel(makeCampaign({ priceCents: 50000, plannedReach: 2500 }))).toBe("About 20¢");
  });

  it("returns null for unknown dates and does not shift calendar dates", () => {
    expect(formatCampaignDate(null)).toBeNull();
    expect(formatCampaignDate("2026-11-02")).toBe("November 2, 2026");
  });

  it("fails checkout closed unless the approved dates are present and ordered", () => {
    const open = makeCampaign({ status: "OPEN" });
    expect(isCheckoutOpen(open, Date.parse("2026-09-23T12:00:00Z"))).toBe(true);
    expect(isCheckoutOpen({ ...open, salesCloseAt: null }, Date.parse("2026-09-23T12:00:00Z"))).toBe(false);
    expect(isCheckoutOpen({ ...open, outsideFulfillmentDate: null }, Date.parse("2026-09-23T12:00:00Z"))).toBe(false);
    expect(isCheckoutOpen(open, Date.parse("2026-12-01T05:00:00Z"))).toBe(false);
  });
});
