"use client";

import { scrollToSection } from "@/app/lib/scrollToSection";

// Centered chips that jump to a section on the same page.
export default function AboutNav({
  items,
  className = "mt-6",
}: {
  items: { href: string; label: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="On this page" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {items.map((n) => (
        <a
          key={n.href}
          href={n.href}
          onClick={(e) => {
            if (scrollToSection(n.href.slice(1))) e.preventDefault();
          }}
          className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-4 text-[0.875rem] font-medium text-text-primary hover:border-border-strong hover:bg-surface-alt"
        >
          {n.label}
        </a>
      ))}
    </nav>
  );
}
