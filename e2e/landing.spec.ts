import { expect, test } from "@playwright/test";
import { seedReviewer } from "./seed";

// "/" is the landing for first-time visitors and the reviewers home for
// everyone else (EntryScript). The landing's sample paper is answerable.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("first visit shows the landing; answering fills the score", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your notes, as your prof's exam." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
  await page.getByRole("button", { name: /^B\.\s*P2/ }).click();
  await page.getByRole("button", { name: /^A\.\s*Page table/ }).click();
  await page.getByRole("button", { name: /^C\.\s*Deadlock/ }).click();
  await expect(page.getByText(/Score\s*2\s*\/\s*5/)).toBeVisible();
});

test("entering the app switches / to the reviewers home for good", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Make my reviewer, free" }).first().click();
  await page.waitForURL("**/reviewer/new");
  await page.goto("/");
  await expect(page.locator(".landing")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Reviewers" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
});

test("a visitor with saved reviewers never sees the landing", async ({ page }) => {
  await seedReviewer(page);
  await page.goto("/");
  await expect(page.locator(".landing")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Reviewers" })).toBeVisible();
});
