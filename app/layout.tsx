import type { Metadata, Viewport } from "next";
import { Libre_Franklin, Space_Mono } from "next/font/google";
import BottomBar from "@/app/components/BottomBar";
import Navbar from "@/app/components/Navbar";
import ThemeInit from "@/app/components/ThemeInit";
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
  icons: { icon: "/icon.svg" },
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
    >
      <body className="flex min-h-full flex-col bg-bg font-sans text-text-primary">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-[15px] focus:font-medium focus:text-accent"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main" className="flex flex-1 flex-col pb-16 md:pb-0">
          {children}
        </main>
        <BottomBar />
        <ThemeInit />
      </body>
    </html>
  );
}
