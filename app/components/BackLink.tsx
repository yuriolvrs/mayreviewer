import Link from "next/link";

export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="back-link mb-4 inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[0.9375rem] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
