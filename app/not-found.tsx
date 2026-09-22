import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="eyebrow">Page not found</p>
      <h1 className="headline mt-3 text-4xl">We couldn&apos;t find that page.</h1>
      <Link href="/categories" className="btn-primary mt-8">
        See all categories
      </Link>
    </div>
  );
}
