// Scrolls to an element by id with a hand-made ease-out. Native smooth
// scrolling is switched off when the OS disables animations, so it is not
// relied on. Instant when the in-app "reduce motion" setting is on.
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;

  const reduce = document.documentElement.dataset.reduceMotion === "true";
  const marginTop = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const to = Math.max(0, target.getBoundingClientRect().top + window.scrollY - marginTop);
  if (reduce) {
    window.scrollTo(0, to);
  } else {
    const from = window.scrollY;
    const delta = to - from;
    const duration = Math.min(700, Math.max(350, Math.abs(delta) / 3));
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      window.scrollTo(0, from + delta * (1 - Math.pow(1 - t, 4)));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  history.replaceState(null, "", `#${id}`);
  return true;
}
