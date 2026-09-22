import { formatAvailability } from "@/lib/inventory";
import type { InventoryStatus } from "@/types/campaign";

const styles: Record<InventoryStatus, string> = {
  AVAILABLE: "bg-ok-tint text-ok",
  HELD: "bg-warn-tint text-warn",
  SOLD: "bg-ink text-paper",
  CLOSED: "bg-paper-deep text-ink-muted",
};

export function StatusBadge({ status }: { status: InventoryStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-semibold tracking-wider uppercase ${styles[status]}`}
    >
      {formatAvailability(status)}
    </span>
  );
}
