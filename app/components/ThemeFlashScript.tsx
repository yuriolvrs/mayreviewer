// Blocking pre-paint theme script, rendered as the first child of <body>.
// A stored dark theme — or a dark OS under the default "system" preference —
// otherwise flashes light until ThemeInit's effect runs after first paint.
// Mirrors resolveTheme + the theme guard in app/lib/settings.ts, hand-written
// as plain JS because it executes outside the bundle. Theme-only: font-size
// and motion have no visible first-paint flash and stay with ThemeInit,
// which also keeps owning OS-preference change listening.
// Mutating documentElement here is hydration-safe: React never renders those
// attributes, so server and client markup still agree.
const THEME_FLASH_SCRIPT = `(function(){try{var s="system";try{var raw=localStorage.getItem("mayreviewer-settings");if(raw){var t=JSON.parse(raw).theme;if(t==="light"||t==="dark"||t==="system")s=t;}}catch(e){}var dark=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=dark?"dark":"light";document.documentElement.dataset.theme=r;document.documentElement.style.colorScheme=r;}catch(e){}})();`;

export default function ThemeFlashScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_FLASH_SCRIPT }} />;
}
