"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const reviewersActive = pathname === "/" || pathname.startsWith("/reviewer");
  const historyActive = pathname.startsWith("/history");

  return (
    <header className="flex h-auto shrink-0 flex-wrap items-center justify-between gap-y-3 border-b border-border bg-surface px-4 py-3 md:h-16 md:flex-nowrap md:px-16 md:py-0">
      <Link href="/" className="flex items-center gap-2 hover:opacity-70">
        <img src="/icon.svg" alt="" className="h-6 w-6" />
        <span className="flex flex-col leading-none text-text-primary">
          <span className="mb-[-2px] text-[11px] font-normal">pre,</span>
          <span className="text-xl font-bold tracking-tight">May Reviewer</span>
          <span className="mt-[-2px] self-end text-[11px] font-normal">ka ba?</span>
        </span>
      </Link>

      <nav className="flex flex-wrap items-center gap-3 md:gap-6">
        <Link
          href="/"
          className={`text-[14px] md:text-[15px] ${
            reviewersActive
              ? "font-semibold text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Reviewers
        </Link>
        <Link
          href="/history"
          className={`text-[14px] md:text-[15px] ${
            historyActive
              ? "font-semibold text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          History
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white"
          >
            U
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-11 w-40 rounded-lg border border-border bg-surface py-1 shadow-menu">
              <Link
                href="/about"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-left text-[15px] text-text-primary hover:bg-surface-alt"
              >
                About
              </Link>
              <button
                disabled
                className="block w-full px-3 py-2 text-left text-[15px] text-text-tertiary disabled:cursor-not-allowed"
              >
                Settings
              </button>
              <button
                disabled
                className="block w-full px-3 py-2 text-left text-[15px] text-text-tertiary disabled:cursor-not-allowed"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
