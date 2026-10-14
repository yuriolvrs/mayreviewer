import { expect, test } from "@playwright/test";
import { REVIEWER_ID, seedReviewer } from "./seed";

// Details tab: the save bar must be tappable above the mobile bottom bar,
// unsaved edits must be guarded, and a format switch must confirm.

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await seedReviewer(page);
  await page.goto(`/reviewer/${REVIEWER_ID}?tab=details`);
});

async function makeDirty(page: import("@playwright/test").Page) {
  const name = page.getByLabel("Reviewer name", { exact: false }).first();
  await name.fill("Render Check edited");
}

test("Save details is the topmost element at its center", async ({ page }) => {
  await makeDirty(page);
  const save = page.getByRole("button", { name: "Save details" });
  await expect(save).toBeVisible();
  const hit = await save.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || el.contains(top);
  });
  expect(hit).toBe(true);
});

test("leaving by a link asks first and stays when declined", async ({ page }) => {
  await makeDirty(page);
  const messages: string[] = [];
  page.on("dialog", (d) => {
    messages.push(d.message());
    void d.dismiss();
  });
  await page.getByRole("link", { name: "History" }).last().click();
  expect(messages).toHaveLength(1);
  await expect(page).toHaveURL(new RegExp(`/reviewer/${REVIEWER_ID}`));
});

test("switching format confirms when counts were edited", async ({ page }) => {
  const select = page.getByLabel("Exam format");
  await expect.poll(() => select.locator("option").count()).toBeGreaterThan(1);
  const values = await select.locator("option").evaluateAll((os) =>
    os.map((o) => (o as HTMLOptionElement).value),
  );
  const current = await select.inputValue();
  const other = values.find((v) => v !== current)!;
  await select.selectOption(other);
  await expect(page.getByText("Switching formats resets your question counts")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(select).toHaveValue(current);
});
