"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";

export default function Navbar() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
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
  const settingsActive = pathname.startsWith("/settings");
  const accountActive = pathname.startsWith("/account");

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
          {!loading && !user ? (
            <Link
              href="/login"
              className="flex min-h-[44px] items-center text-[14px] font-medium text-text-secondary hover:text-text-primary md:text-[15px]"
            >
              Log in
            </Link>
          ) : (
            <>
              <button
                ref={menuButtonRef}
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M10 9.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Zm-6.4 7.2c.5-3.1 3.2-5.2 6.4-5.2s5.9 2.1 6.4 5.2a.9.9 0 0 1-.9 1H4.5a.9.9 0 0 1-.9-1Z" />
                </svg>
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-11 w-56 rounded-lg border border-border bg-surface py-1 shadow-menu">
                  {user?.email && (
                    <p className="truncate px-3 py-2 text-[13px] text-text-secondary" aria-hidden="true">
                      {user.email}
                    </p>
                  )}
                  <Link
                    href="/about"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="block min-h-[44px] px-3 py-2 text-left text-[15px] text-text-primary hover:bg-surface-alt"
                  >
                    About
                  </Link>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className={`block min-h-[44px] px-3 py-2 text-left text-[15px] hover:bg-surface-alt ${
                      accountActive ? "font-semibold text-text-primary" : "text-text-primary"
                    }`}
                  >
                    Account
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className={`block min-h-[44px] px-3 py-2 text-left text-[15px] hover:bg-surface-alt ${
                      settingsActive ? "font-semibold text-text-primary" : "text-text-primary"
                    }`}
                  >
                    Settings
                  </Link>
                  <AccountMenuLogout onDone={() => setMenuOpen(false)} />
                </div>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

// Split out so the menu can stay server-renderable in shape while only the
// sign-out action subscribes to auth. Sign-out flushes to the cloud, then
// empties the device — the next login pulls everything back down.
function AccountMenuLogout({ onDone }: { onDone: () => void }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <button
      role="menuitem"
      onClick={() => {
        onDone();
        void signOut();
      }}
      className="block min-h-[44px] w-full px-3 py-2 text-left text-[15px] text-text-primary hover:bg-surface-alt"
    >
      Log out
    </button>
  );
}
