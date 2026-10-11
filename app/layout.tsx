import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Libre_Franklin, Space_Mono } from "next/font/google";
import BottomBar from "@/app/components/BottomBar";
import Navbar from "@/app/components/Navbar";
import ReminderInit from "@/app/components/ReminderInit";
import ServiceWorkerInit from "@/app/components/ServiceWorkerInit";
import SyncInit from "@/app/components/SyncInit";
import ThemeFlashScript from "@/app/components/ThemeFlashScript";
import ThemeInit from "@/app/components/ThemeInit";
import { AuthProvider } from "@/app/components/AuthProvider";
import "./globals.css";

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "May Reviewer",
  description: "Turn your notes into a practice exam that matches your professor's question format.",
  // Explicit icons switch off file-based detection, so app/apple-icon.png
  // (the iOS home-screen icon) has to be named here too.
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  // iOS ignores most of the manifest: this is what makes "Add to Home Screen"
  // open full-screen with the right name instead of as a Safari bookmark.
  appleWebApp: { capable: true, title: "May Reviewer", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#171716" },
  ],
  // The Details tab's unsaved-changes bar is `position: fixed; bottom: 0`.
  // Under the browser default the layout viewport doesn't shrink when the
  // on-screen keyboard opens, so that bar ends up behind the keyboard exactly
  // when it's needed — while editing a field. Resizing the content instead
  // keeps `bottom: 0` meaning "above the keyboard".
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${libreFranklin.variable} ${spaceMono.variable} h-full antialiased`}
      // ThemeFlashScript sets data-theme + color-scheme before hydration;
      // React would otherwise flag the expected divergence in dev.
      suppressHydrationWarning
    >
      {/* Bottom padding lives on body, not main: the footer comes after main,
          so padding main left the footer links under the fixed bottom bar. */}
      <body className="flex min-h-full flex-col bg-bg pb-[calc(4rem+env(safe-area-inset-bottom))] font-sans text-text-primary md:pb-0">
        <ThemeFlashScript />
        <AuthProvider>        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-[0.9375rem] focus:font-medium focus:text-accent"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-2 md:px-16">
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5">
            <Link
              href="/about"
              className="inline-block py-2 text-[0.8125rem] text-text-secondary hover:text-text-primary"
            >
              About
            </Link>
            <Link
              href="/privacy"
              className="inline-block py-2 text-[0.8125rem] text-text-secondary hover:text-text-primary"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="inline-block py-2 text-[0.8125rem] text-text-secondary hover:text-text-primary"
            >
              Terms
            </Link>
            <Link
              href="/about#feedback"
              className="inline-block py-2 text-[0.8125rem] text-text-secondary hover:text-text-primary"
            >
              Feedback
            </Link>
          </nav>
        </footer>
        <BottomBar />
        <ThemeInit />
        <ReminderInit />
        <ServiceWorkerInit />
        <SyncInit />
        </AuthProvider>
      </body>
    </html>
  );
}
