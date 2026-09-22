import Link from "next/link";
import type { ReactNode } from "react";

/** Restrained mobile-only CTA bar pinned to the bottom of the viewport. */
export function StickyCta({
  label,
  detail,
  href,
  action,
}: {
  label: ReactNode;
  detail?: ReactNode;
  href: string;
  action: string;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper/97 px-4 py-3 shadow-[0_-6px_16px_-10px_rgba(27,26,23,0.4)] md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm leading-tight">
          <p className="truncate font-semibold">{label}</p>
          {detail && <p className="truncate text-ink-muted">{detail}</p>}
        </div>
        <Link
          href={href}
          className="shrink-0 rounded-sm bg-accent px-4 py-2.5 text-sm font-bold tracking-wide text-white uppercase"
        >
          {action}
        </Link>
      </div>
    </div>
  );
}
