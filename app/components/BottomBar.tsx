"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", match: (p: string) => p === "/" || p.startsWith("/reviewer") },
  { href: "/formats", label: "Formats", match: (p: string) => p.startsWith("/formats") },
  { href: "/history", label: "History", match: (p: string) => p.startsWith("/history") },
  { href: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

// Mobile-only bottom nav. Desktop keeps the top Navbar — this renders nothing
// useful there, so it stays hidden from md up.
export default function BottomBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[48px] items-center justify-center px-2 py-1.5 text-[14px] ${
                active ? "font-semibold text-text-primary" : "text-text-secondary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
