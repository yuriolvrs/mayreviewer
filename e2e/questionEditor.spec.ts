import { expect, test } from "@playwright/test";
import { REVIEWER_ID, seedReviewer } from "./seed";

// The question editor: Save/Cancel at the end of the form, no Delete under
// Save's spot afterwards, and option fields that wrap long text.

test.beforeEach(async ({ page }) => {
  await seedReviewer(page);
  await page.goto(`/reviewer/${REVIEWER_ID}?tab=questions`);
});

test("Save sits below the form and no Delete lands under it after saving", async ({ page }) => {
  await page.getByRole("button", { name: "Edit" }).first().click();
  const save = page.getByRole("button", { name: "Save", exact: true });
  const questionBox = await page.getByLabel("Question text").boundingBox();
  const saveBox = await save.boundingBox();
  expect(saveBox!.y).toBeGreaterThan(questionBox!.y);

  await save.scrollIntoViewIfNeeded();
  const box = (await save.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await expect(save).toHaveCount(0);

  const hit = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.textContent?.trim() ?? "",
    [x, y],
  );
  expect(hit).not.toBe("Delete");
});

test("option fields are textareas that wrap long text", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Edit" }).first().click();
  const option = page.getByRole("textbox", { name: "Option A", exact: true });
  expect(await option.evaluate((el) => el.tagName)).toBe("TEXTAREA");
  const before = (await option.boundingBox())!.height;
  await option.fill("T(n) = 2T(n/2) + n log n with a very long trailing explanation of the recurrence that cannot fit one line");
  const after = (await option.boundingBox())!.height;
  expect(after).toBeGreaterThan(before);
  await option.press("Enter");
  await expect(option).not.toHaveValue(/\n/);
});
