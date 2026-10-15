import Link from "next/link";

export default function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="back-link group mb-3 inline-flex w-fit items-center gap-2 text-[0.9375rem] font-medium text-text-secondary hover:text-accent"
    >
      <span aria-hidden="true" className="transition-transform group-hover:-translate-x-0.5">
        ←
      </span>
      {children}
    </Link>
  );
}
