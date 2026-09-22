import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="container-page pt-10 pb-8 sm:pt-16">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="headline mt-3 max-w-3xl text-4xl leading-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-5 max-w-2xl text-lg text-ink-soft">{children}</div>}
    </header>
  );
}
