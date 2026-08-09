"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 3.5A1 1 0 0 1 2.5 2.5h3.086a1 1 0 0 1 .707.293l1.121 1.121a1 1 0 0 0 .707.293H13.5a1 1 0 0 1 1 1v7.293a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V3.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.75V8l2.25 1.25" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface pl-16 pr-16">
      <Link href="/" className="text-[19px] font-semibold text-text-primary hover:opacity-70">
        pre, May Reviewer ka ba?
      </Link>

      <nav className="flex items-center gap-6">
        <Link
          href="/"
          className={`flex items-center gap-1.5 text-[15px] ${
            reviewersActive
              ? "font-semibold text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <FolderIcon />
          Reviewers
        </Link>
        <Link
          href="/history"
          className={`flex items-center gap-1.5 text-[15px] ${
            historyActive
              ? "font-semibold text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <ClockIcon />
          History
        </Link>
        <Link
          href="/reviewer/new"
          className="flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-[15px] font-medium text-accent hover:bg-accent-subtle"
        >
          <PlusIcon />
          Create new
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
