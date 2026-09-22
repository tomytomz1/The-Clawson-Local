import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";
import { site } from "@/config/site";

const links = [
  { href: "/advertise", label: "Advertise" },
  { href: "/categories", label: "Categories" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/terms", label: "Advertiser Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    // Extra bottom padding on mobile leaves room for the sticky CTA bar.
    <footer className="rule-double mt-16 bg-paper-deep pb-24 md:pb-0">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.2fr_2fr]">
        <div>
          <Wordmark />
          <p className="mt-2 text-sm text-ink-soft">{site.servingLine}</p>
          <p className="mt-1 font-serif text-sm text-ink-muted italic">{site.consumerTagline}</p>
          <a
            href={`mailto:${site.email.public}`}
            className="mt-4 inline-block text-sm font-medium text-accent underline underline-offset-4"
          >
            {site.email.public}
          </a>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink-soft hover:text-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-rule">
        <p className="container-page py-4 text-xs text-ink-muted">
          © {year} {site.legalName ?? site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
