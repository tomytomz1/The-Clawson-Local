import type { ReactNode } from "react";

type Props = {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  tone?: "paper" | "deep" | "ink";
  className?: string;
};

/** Editorial section: top rule, optional eyebrow, serif headline. */
export function Section({ id, eyebrow, title, children, tone = "paper", className = "" }: Props) {
  const tones = {
    paper: "bg-paper",
    deep: "bg-paper-deep",
    ink: "bg-ink text-paper",
  } as const;
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={`${tones[tone]} ${className}`}>
      <div className="container-page border-t border-rule py-14 sm:py-20">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2
          id={headingId}
          className={`headline max-w-3xl text-3xl leading-tight sm:text-4xl ${
            tone === "ink" ? "text-paper" : ""
          }`}
        >
          {title}
        </h2>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
