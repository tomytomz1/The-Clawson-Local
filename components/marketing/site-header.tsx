import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";

const nav = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/categories", label: "Categories" },
  { href: "/faq", label: "FAQ" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur-sm">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="The Clawson Local home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-medium md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-ink-soft hover:text-ink">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/categories"
          className="rounded-sm bg-accent px-3 py-2 text-[0.8125rem] font-semibold whitespace-nowrap text-white hover:bg-accent-dark sm:px-3.5 sm:text-sm"
        >
          Claim<span className="max-[359px]:hidden"> Your</span> Category
        </Link>
      </div>
    </header>
  );
}
