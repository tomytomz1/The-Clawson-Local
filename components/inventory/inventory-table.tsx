import Link from "next/link";
import { formatCampaignPrice } from "@/lib/campaign/format";
import type { CategoryInventory } from "@/lib/inventory/progress";
import type { CampaignConfig } from "@/types/campaign";
import { StatusBadge } from "./status-badge";

function RowAction({ item, price }: { item: CategoryInventory; price: string }) {
  const href = `/category/${item.category.slug}`;
  switch (item.status) {
    case "AVAILABLE":
      return (
        <Link href={href} className="font-semibold text-accent underline-offset-4 hover:underline">
          Claim for {price}
          <span className="sr-only"> — {item.category.displayName}</span>
        </Link>
      );
    case "SOLD":
      return (
        <Link href={`${href}#waitlist`} className="font-medium text-ink-soft underline-offset-4 hover:underline">
          Join Waitlist
          <span className="sr-only"> — {item.category.displayName}</span>
        </Link>
      );
    case "HELD":
      return <span className="text-ink-muted">Check back shortly</span>;
    case "CLOSED":
      return <span className="text-ink-muted">Unavailable</span>;
  }
}

function Rows({ items, price }: { items: CategoryInventory[]; price: string }) {
  return (
    <ul className="divide-y divide-rule">
      {items.map((item) => (
        <li
          key={item.category.slug}
          className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_10rem_10rem]"
        >
          <Link href={`/category/${item.category.slug}`} className="font-medium text-ink hover:underline">
            {item.category.displayName}
          </Link>
          <span className="justify-self-end sm:justify-self-start">
            <StatusBadge status={item.status} />
          </span>
          <span className="col-span-2 text-sm sm:col-span-1 sm:justify-self-end">
            <RowAction item={item} price={price} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InventoryTable({
  campaign,
  items,
  initialCount = 10,
}: {
  campaign: CampaignConfig;
  items: CategoryInventory[];
  initialCount?: number;
}) {
  const price = formatCampaignPrice(campaign);
  const first = items.slice(0, initialCount);
  const rest = items.slice(initialCount);
  return (
    <div className="border-y-2 border-ink bg-card px-4 sm:px-6">
      <div className="hidden grid-cols-[1fr_10rem_10rem] border-b border-ink py-2 text-xs font-semibold tracking-wider text-ink-muted uppercase sm:grid">
        <span>Category</span>
        <span>Status</span>
        <span className="justify-self-end">Action</span>
      </div>
      <Rows items={first} price={price} />
      {rest.length > 0 && (
        <details className="group border-t border-rule">
          <summary className="cursor-pointer py-3 text-sm font-semibold text-accent select-none">
            <span className="group-open:hidden">Show all {items.length} categories</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <Rows items={rest} price={price} />
        </details>
      )}
    </div>
  );
}
