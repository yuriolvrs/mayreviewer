"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChartNoAxesColumn, History, LayoutList, Settings, type LucideIcon } from "lucide-react";

const TABS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Reviewers", icon: BookOpen, match: (p) => p === "/" || p.startsWith("/reviewer") },
  { href: "/formats", label: "Formats", icon: LayoutList, match: (p) => p.startsWith("/formats") },
  { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history") },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn, match: (p) => p.startsWith("/progress") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

// Mobile-only bottom nav. Desktop keeps the top Navbar — this renders nothing
// useful there, so it stays hidden from md up. Below md the Navbar drops its
// text links, so this bar is the only primary nav on phones.
export default function BottomBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.75rem] ${
                active ? "font-semibold text-accent" : "text-text-secondary"
              }`}
            >
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
