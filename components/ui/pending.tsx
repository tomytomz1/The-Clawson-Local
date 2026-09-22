/** Visible marker for business facts that are not yet confirmed. Never invent them. */
export function Pending({ value, label }: { value: string | null; label: string }) {
  if (value) return <>{value}</>;
  return (
    <span className="rounded-sm bg-warn-tint px-1.5 py-0.5 text-sm font-medium text-warn">
      {label} — to be published
    </span>
  );
}
