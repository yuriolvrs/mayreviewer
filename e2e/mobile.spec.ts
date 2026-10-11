import { expect, test } from "@playwright/test";
import { REVIEWER_ID, seedAttempts, seedReviewer } from "./seed";

// Phone-width pass over every route. The plan's standard is a 360px check;
// this makes it repeatable instead of manual. It catches the two layout
// failures that keep coming back: sideways page scroll, and content hidden
// behind the fixed bottom bar.

const ROUTES = [
  "/",
  "/formats",
  "/formats/new",
  "/history",
  "/progress",
  "/settings",
  "/account",
  "/about",
  "/privacy",
  "/terms",
  "/login",
  "/reviewer/new",
  `/reviewer/${REVIEWER_ID}`,
  `/reviewer/${REVIEWER_ID}/quiz`,
];

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

for (const fontSize of ["normal", "large"] as const) test.describe(`Mobile 360px, ${fontSize} text`, () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
    await page.addInitScript((size) => {
      window.localStorage.setItem("mayreviewer-settings", JSON.stringify({ fontSize: size }));
    }, fontSize);
    await seedAttempts(page, [
      {
        id: "att-mobile",
        reviewerId: REVIEWER_ID,
        takenAt: new Date().toISOString(),
        score: 3,
        total: 5,
        questions: [],
        answers: {},
        unsureIds: [],
        questionSetGeneratedAt: "legacy",
        examFormatId: "csopesy-final",
        examFormatName: "CSOPESY Final",
      },
    ]);
  });

  for (const route of ROUTES) {
    test(`${route} has no sideways scroll`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      if (process.env.MOBILE_SHOTS) {
        const name = `${fontSize}${route.replace(/[^a-z0-9]+/gi, "_")}`;
        await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${name}.png`, fullPage: true });
      }
      const overflow = await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.right <= width + 1) return false;
            // Content inside its own horizontal scroller is fine (code, tables).
            for (let p = el.parentElement; p; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return false;
            }
            return true;
          })
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120));
        return { scroll: document.documentElement.scrollWidth - width, wide };
      });
      expect(overflow.wide, `elements past the right edge on ${route}`).toEqual([]);
      expect(overflow.scroll).toBeLessThanOrEqual(0);
    });
  }

  test("bottom bar never covers the end of the page", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("navigation", { name: "Mobile" });
    await expect(bar).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footer = page.getByRole("navigation", { name: "Legal" });
    const footerBox = await footer.boundingBox();
    const barBox = await bar.boundingBox();
    expect(footerBox && barBox && footerBox.y + footerBox.height <= barBox.y + 1).toBe(true);
  });
});
