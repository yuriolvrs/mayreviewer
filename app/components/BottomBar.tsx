"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChartNoAxesColumn, History, Settings, type LucideIcon } from "lucide-react";
import { getStreakState, SETTINGS_CHANGED_EVENT } from "@/app/lib/settings";
import { streakStatus } from "@/app/lib/streaks";
import { SYNC_APPLIED_EVENT } from "@/app/lib/sync";
import { getAllQuizHistory } from "@/app/lib/storage";

const TABS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Reviewers", icon: BookOpen, match: (p) => p === "/" || p.startsWith("/reviewer") },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn, match: (p) => p.startsWith("/progress") },
  { href: "/history", label: "History", icon: History, match: (p) => p.startsWith("/history") },
  // Formats lives under Settings on phones: it is setup, not the daily loop.
  { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") || p.startsWith("/formats") },
];

// Mobile-only bottom nav. Desktop keeps the top Navbar — this renders nothing
// useful there, so it stays hidden from md up. Below md the Navbar drops its
// text links, so this bar is the only primary nav on phones.
export default function BottomBar() {
  const pathname = usePathname();
  // Hint on the Progress tab: a restore can save a streak, or awards wait.
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      const state = getStreakState();
      if (state.pending > 0) return setHint("rewards waiting");
      const status = streakStatus(getAllQuizHistory(), state, new Date());
      setHint(status.kind === "restorable" && state.banked >= 1 ? "restore available" : null);
    }
    // localStorage is a browser-only external store; reads after mount are intentional.
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    window.addEventListener(SYNC_APPLIED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
      window.removeEventListener(SYNC_APPLIED_EVENT, refresh);
    };
  }, []);
  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          const dot = tab.href === "/progress" ? hint : null;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={dot ? `${tab.label}, ${dot}` : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.75rem] ${
                active ? "font-semibold text-accent" : "text-text-secondary"
              }`}
            >
              <span className="relative">
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                {dot && (
                  <span
                    data-testid="progress-dot"
                    aria-hidden="true"
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-accent"
                  />
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
