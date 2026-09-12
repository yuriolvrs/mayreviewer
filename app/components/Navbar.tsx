"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  const reviewersActive = pathname === "/" || pathname.startsWith("/reviewer");
  const formatsActive = pathname.startsWith("/formats");
  const historyActive = pathname.startsWith("/history");

  return (
    <header className="flex h-auto shrink-0 flex-wrap items-center justify-between gap-y-3 border-b border-border bg-surface px-4 py-3 md:h-16 md:flex-nowrap md:px-16 md:py-0">
      <Link href="/" className="flex items-center gap-2 hover:opacity-70">
        <Image src="/icon.svg" alt="" width={24} height={24} className="h-6 w-6" aria-hidden="true" />
        <span className="flex flex-col leading-none text-text-primary">
          <span className="mb-[-2px] text-[11px] font-normal">pre,</span>
          <span className="text-xl font-bold tracking-tight">May Reviewer</span>
          <span className="mt-[-2px] self-end text-[11px] font-normal">ka ba?</span>
        </span>
      </Link>

      <nav aria-label="Primary" className="flex flex-wrap items-center gap-3 md:gap-6">
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
          href="/formats"
          className={`text-[14px] md:text-[15px] ${
            formatsActive
              ? "font-semibold text-text-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Formats
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

        <div
          className="relative"
          ref={menuRef}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closeMenu();
            }
          }}
        >
          <button
            ref={menuButtonRef}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-white"
          >
            U
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-11 w-40 rounded-lg border border-border bg-surface py-1 shadow-menu">
              <Link
                href="/about"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-left text-[15px] text-text-primary hover:bg-surface-alt"
              >
                About
              </Link>
              <button
                disabled
                title="Coming soon"
                className="block w-full px-3 py-2 text-left text-[15px] text-text-tertiary disabled:cursor-not-allowed"
              >
                Settings
              </button>
              <button
                disabled
                title="Coming soon"
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
