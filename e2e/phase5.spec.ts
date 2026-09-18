import { expect, test } from "@playwright/test";
import { REVIEWER_ID, seedAttempts, seedReviewer } from "./seed";

// Phase 5 daily loop: the home strip renders goal progress + streak from
// real attempt data. Default goal is 10 (no settings seeded); attempt
// timestamps are built at test time so "today" is always today.

function attempt(id: string, takenAt: string, total: number) {
  return {
    id,
    reviewerId: REVIEWER_ID,
    takenAt,
    score: total,
    total,
    questions: [],
    answers: {},
    unsureIds: [],
    questionSetGeneratedAt: "legacy",
    examFormatId: "csopesy-final",
    examFormatName: "CSOPESY Final",
  };
}

const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

test.describe("Daily strip", () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
  });

  test("shows today's goal progress", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 6), attempt("a2", at(1), 4)]);
    await page.goto("/");
    await expect(page.getByText("Today 6/10")).toBeVisible();
  });

  test("celebrates a met goal", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 6), attempt("a2", at(0), 5)]);
    await page.goto("/");
    await expect(page.getByText("Goal met")).toBeVisible();
  });

  test("shows zero progress with no history", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Today 0/10")).toBeVisible();
  });
});

test.describe("Timed quiz", () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
  });

  test("counts down the typed limit and records the duration", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "5 min", exact: true }).click();
    await page.getByLabel("Time limit in minutes").fill("2");
    await page.getByRole("button", { name: "Start quiz" }).click();

    // The timer renders on both the mobile and desktop surfaces with the
    // same text; only one is visible at a time.
    const timer = page.getByTestId("quiz-timer").filter({ visible: true });
    await expect(timer).toHaveText(/^(2:00|1:5\d) left$/);
    const before = await timer.innerText();
    await expect(timer).not.toHaveText(before, { timeout: 5000 });

    // Submit blank: the confirm path records the attempt like any other.
    await page.getByRole("button", { name: "Submit quiz" }).click();
    await page.getByRole("button", { name: "Submit anyway" }).click();
    await expect(page.getByText(/Finished in \d+:\d+/)).toBeVisible();
  });
});
