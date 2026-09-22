import type { FaqItem } from "@/lib/campaign/faq";

export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-t-2 border-ink">
      {items.map((item) => (
        <details key={item.id} id={`faq-${item.id}`} className="group border-b border-rule">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-left font-serif text-lg font-semibold [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <span aria-hidden="true" className="mt-0.5 text-accent transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="max-w-3xl pb-5 text-ink-soft">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
