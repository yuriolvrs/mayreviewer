import { expect, test } from "@playwright/test";
import { CUSTOM_FORMAT_ID, seedCustom, seedReviewer } from "./seed";

// Format builder (02.4) and formats list / read-only view (02.5).

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await seedReviewer(page);
  await seedCustom(page);
});

async function hitsItself(locator: import("@playwright/test").Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || el.contains(top);
  });
}

test("builder Save is tappable above the bottom bar", async ({ page }) => {
  await page.goto("/formats/new");
  const save = page.getByRole("button", { name: "Create format" });
  await expect(save).toBeVisible();
  expect(await hitsItself(save)).toBe(true);
});

test("validation marks the failing card, opens it, and keeps a summary", async ({ page }) => {
  await page.goto("/formats/new");
  await page.getByLabel("Format name").fill("Draft format");
  await page.getByRole("button", { name: "+ Add question type" }).click();
  await page.getByRole("button", { name: "Create format" }).click();
  const label = page.getByLabel("Label");
  await expect(label).toBeFocused();
  await expect(label).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Every type needs a label.")).toBeVisible();
  await expect(page.getByText("Fix 1 problem")).toBeVisible();
});

test("existing types start collapsed and removing offers Undo", async ({ page }) => {
  await page.goto(`/formats/${CUSTOM_FORMAT_ID}`);
  const toggle = page.getByRole("button", { name: /Recall/ }).first();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Remove Recall" }).click();
  await expect(page.getByText("Type removed")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Remove Recall" })).toBeVisible();
});

test("saving lands on the list with a Format saved status", async ({ page }) => {
  await page.goto("/formats/new");
  await page.getByLabel("Format name").fill("Saved by test");
  await page.getByRole("button", { name: "+ Add question type" }).click();
  await page.getByLabel("Label").fill("Recall");
  await page.getByRole("button", { name: "Create format" }).click();
  await expect(page).toHaveURL(/\/formats$/);
  await expect(page.getByRole("status")).toContainText("Format saved");
  await expect(page.getByText("Saved by test")).toBeVisible();
});

test("leaving a dirty builder by link asks first", async ({ page }) => {
  await page.goto("/formats/new");
  await page.getByLabel("Format name").fill("Unsaved");
  const messages: string[] = [];
  page.on("dialog", (d) => {
    messages.push(d.message());
    void d.dismiss();
  });
  await page.getByRole("link", { name: "History" }).last().click();
  expect(messages).toHaveLength(1);
  await expect(page).toHaveURL(/\/formats\/new/);
});

test("built-in format opens a read-only view with a sample", async ({ page }) => {
  await page.goto("/formats/os-exam");
  await expect(page.getByRole("heading", { name: "Operating Systems Exam" })).toBeVisible();
  await expect(page.getByText("Directions:").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Use this format" })).toHaveAttribute(
    "href",
    "/reviewer/new?format=os-exam",
  );
  await page.getByRole("link", { name: "Clone to edit" }).click();
  await expect(page).toHaveURL(/\/formats\/new\?from=os-exam/);
  await expect(page.getByLabel("Format name")).toHaveValue("Operating Systems Exam (copy)");
});

test("clone from the list opens an unsaved draft", async ({ page }) => {
  await page.goto("/formats");
  await page.getByRole("link", { name: "Clone" }).first().click();
  await expect(page).toHaveURL(/\/formats\/new\?from=/);
  await page.goBack();
  // Nothing was written by clicking Clone.
  const count = await page.evaluate(
    () => (JSON.parse(localStorage.getItem("mayreviewer-formats") ?? "[]") as unknown[]).length,
  );
  expect(count).toBe(1);
});
