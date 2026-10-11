import type { MetadataRoute } from "next";

// Web app manifest: makes the site installable (home screen, standalone
// window) and is the base the Android wrapper (TWA) builds from. Colors
// mirror --color-bg / --color-accent in globals.css. Icons are rendered from
// app/icon.svg; the maskable one is full-bleed so Android can crop its shape.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "May Reviewer",
    short_name: "May Reviewer",
    description: "Turn your notes into a practice exam that matches your professor's question format.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f6",
    theme_color: "#f7f7f6",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New reviewer", url: "/reviewer/new" },
      { name: "Progress", url: "/progress" },
    ],
  };
}
