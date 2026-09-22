import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClaimPanel } from "@/components/inventory/claim-panel";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { ProgressMeter } from "@/components/inventory/progress-meter";
import { getCampaignProgress, type CategoryInventory } from "@/lib/inventory/progress";
import type { InventoryStatus } from "@/types/campaign";
import { makeCampaign, makeCategory } from "../support/fixtures";

const campaign = makeCampaign();
const item = (slug: string, name: string, status: InventoryStatus): CategoryInventory => ({
  category: makeCategory(slug, name),
  status,
});
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("InventoryTable", () => {
  const items = [
    item("hvac", "HVAC", "AVAILABLE"),
    item("plumbing", "Plumbing", "SOLD"),
    item("roofing", "Roofing", "HELD"),
    item("auto-repair", "Auto Repair", "CLOSED"),
  ];
  const html = renderToStaticMarkup(<InventoryTable campaign={campaign} items={items} />);

  it("renders every status label", () => {
    const t = text(html);
    expect(t).toContain("Available");
    expect(t).toContain("Claimed");
    expect(t).toContain("Checkout in progress");
    expect(t).toContain("Closed");
  });

  it("links each row only to its own category slug", () => {
    const rows = html.split("<li").slice(1);
    for (const [i, it] of items.entries()) {
      const hrefs = [...rows[i].matchAll(/href="([^"]+)"/g)].map((m) => m[1].split("#")[0]);
      expect(hrefs.length).toBeGreaterThan(0);
      expect(new Set(hrefs)).toEqual(new Set([`/category/${it.category.slug}`]));
    }
  });

  it("only offers Claim on AVAILABLE and Waitlist on SOLD", () => {
    expect(html).toContain('href="/category/hvac"');
    expect(text(html)).toContain("Claim for $350");
    expect(html).toContain('href="/category/plumbing#waitlist"');
    expect(html).not.toContain("/category/roofing#");
    expect(text(html).match(/Claim for/g)).toHaveLength(1);
  });
});

describe("ClaimPanel", () => {
  const render = (status: InventoryStatus, c = campaign) =>
    text(renderToStaticMarkup(<ClaimPanel campaign={c} item={item("plumbing", "Plumbing", status)} />));

  it("AVAILABLE shows price, qualified reach and the claim button", () => {
    const t = render("AVAILABLE");
    expect(t).toContain("$350 one time");
    expect(t).toContain("Approximately 5,800 planned residences");
    expect(t).toContain("Claim Plumbing");
  });

  it("verified reach drops 'approximately'", () => {
    const t = render("AVAILABLE", makeCampaign({ reachIsEstimated: false, verifiedReach: 5812 }));
    expect(t).toContain("5,812 residences");
    expect(t).not.toMatch(/approximately/i);
  });

  it("HELD does not identify the holder and offers no claim", () => {
    const t = render("HELD");
    expect(t).toContain("Checkout in progress");
    expect(t).not.toContain("Claim Plumbing");
  });

  it("SOLD shows claimed + waitlist", () => {
    const t = render("SOLD");
    expect(t).toContain("Plumbing has been claimed.");
    expect(t).toContain("Join Waitlist");
    expect(t).not.toContain("Claim Plumbing");
  });

  it("CLOSED shows closed + waitlist", () => {
    const t = render("CLOSED");
    expect(t).toContain("Plumbing is closed for this edition.");
    expect(t).toContain("Join Waitlist");
    expect(t).not.toContain("Claim Plumbing");
  });
});

describe("ProgressMeter", () => {
  it.each([0, 1, 19, 20])("renders %i of 20 positions claimed", (n) => {
    const html = renderToStaticMarkup(<ProgressMeter campaign={campaign} progress={getCampaignProgress(campaign, n)} />);
    expect(text(html)).toContain(`${n} of 20 positions claimed`);
  });
});
