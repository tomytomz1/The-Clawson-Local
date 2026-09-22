import type { FaqItem } from "@/lib/campaign/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-t-2 border-ink">
      {items.map((item) => (
        <details key={item.id} id={`faq-${item.id}`} className="group border-b border-rule">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-left font-serif text-lg font-semibold [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="mt-1.5 h-4 w-4 shrink-0 text-accent transition-transform group-open:rotate-45"
            >
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" />
            </svg>
          </summary>
          <p className="max-w-3xl pb-5 text-ink-soft">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
