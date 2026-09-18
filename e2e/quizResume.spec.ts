import { expect, test } from "@playwright/test";
import { CORRECT_OPTION, REVIEWER_ID, SEEDED_QUESTIONS, seedReviewer } from "./seed";

// Refreshing mid-quiz must resume the taking screen — same questions,
// same answers, and a countdown that kept running — not the setup screen.
test.describe("Quiz resume after refresh", () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
  });

  function timerSeconds(text: string): number {
    const match = text.match(/(\d+):(\d\d)/);
    if (!match) throw new Error(`unparseable timer text: ${text}`);
    return Number(match[1]) * 60 + Number(match[2]);
  }

  test("restores answers and keeps the countdown running", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "10 min", exact: true }).click();
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.locator('div[id^="question-"]')).toHaveCount(SEEDED_QUESTIONS.length);

    // Answer the first question by option text (options are shuffled).
    const first = page.locator('div[id^="question-"]').first();
    const wanted = first.locator("label", { hasText: CORRECT_OPTION }).first();
    await wanted.locator('input[type="radio"]').check();
    await expect(wanted.locator('input[type="radio"]')).toBeChecked();

    const timer = page.getByTestId("quiz-timer").filter({ visible: true });
    await expect(timer).toHaveText(/^10:0\d left$/);
    // Let the wall clock advance so a reset-to-full timer is detectable.
    await page.waitForTimeout(2600);
    const before = timerSeconds(await timer.innerText());

    await page.reload();
    // Still taking, not back on setup: questions render, no Start button.
    await expect(page.locator('div[id^="question-"]')).toHaveCount(SEEDED_QUESTIONS.length);
    await expect(page.getByRole("button", { name: "Start quiz" })).toHaveCount(0);

    // Progress survived: the first answer is still checked.
    const revived = page.locator('div[id^="question-"]').first();
    await expect(
      revived.locator("label", { hasText: CORRECT_OPTION }).first().locator('input[type="radio"]'),
    ).toBeChecked();

    // The timer continued from the saved start, not restarted at 10:00.
    const revivedTimer = page.getByTestId("quiz-timer").filter({ visible: true });
    await expect(revivedTimer).toBeVisible();
    const after = timerSeconds(await revivedTimer.innerText());
    expect(after).toBeLessThan(600);
    expect(after).toBeLessThanOrEqual(before);

    // The resumed quiz still submits normally.
    await page.getByRole("button", { name: "Submit quiz" }).click();
    await page.getByRole("button", { name: "Submit anyway" }).click();
    await expect(page.getByText(/1\s*\/\s*8/)).toBeVisible();
  });

  test("a timer that expired while away auto-submits on reload", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "5 min", exact: true }).click();
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.locator('div[id^="question-"]')).toHaveCount(SEEDED_QUESTIONS.length);

    // Wind the saved start back past the budget, then reload.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("mayreviewer-quiz-in-progress");
      if (!raw) throw new Error("no quiz progress saved");
      const all = JSON.parse(raw) as Record<string, { startedAt: number }>;
      for (const entry of Object.values(all)) entry.startedAt = Date.now() - 400_000;
      window.localStorage.setItem("mayreviewer-quiz-in-progress", JSON.stringify(all));
    });
    await page.reload();

    await expect(page.getByText("Time ran out — submitted automatically")).toBeVisible();
  });
});
