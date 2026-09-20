import { expect, test, type Page } from "@playwright/test";
import { REVIEWER_ID, seedAttempts, seedReviewer } from "./seed";

// Progress page: goal, streak + week dots, restores, milestone claims.
// Dates are built at test time so "today" and "yesterday" are always exact.

const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function attempt(id: string, takenAt: string, score: number, total: number, extra = {}) {
  return {
    id,
    reviewerId: REVIEWER_ID,
    takenAt,
    score,
    total,
    questions: [],
    answers: {},
    unsureIds: [],
    questionSetGeneratedAt: "legacy",
    examFormatId: "csopesy-final",
    examFormatName: "CSOPESY Final",
    ...extra,
  };
}

// Partial settings seed: normalizeSettings backfills every other field, so
// only the stated fields need stating. Overwrites per navigation like
// seedAttempts, so each test seeds, goes to one page, and asserts.
async function seedSettings(page: Page, settings: unknown) {
  await page.addInitScript((s) => {
    window.localStorage.setItem("mayreviewer-settings", JSON.stringify(s));
  }, settings);
}

function seedStreak(page: Page, streak: unknown) {
  return seedSettings(page, { streak });
}

const BANKED_TWO = {
  banked: 2,
  grantedMonth: monthKey(),
  restoredDays: [],
  claimedLevels: {},
};

test.describe("Progress page", () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
  });

  test("renders goal, streak, and week dots from real attempts", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 5, 6), attempt("a2", at(1), 8, 8)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("6 of 10")).toBeVisible();
    await expect(page.getByText("4 more to go")).toBeVisible();
    await expect(page.getByText("2 days")).toBeVisible();
    await expect(page.getByText("2 restores left")).toBeVisible();
    // No missed yesterday here, so no restore action.
    await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
  });

  test("restores a missed yesterday and names the rescued length", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(2), 10, 10)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(page.getByText("Oh no! You forgot to review yesterday.")).toBeVisible();
    const restore = page.getByRole("button", { name: "Restore 2-day streak" });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect(page.getByText("2 days").first()).toBeVisible();
    await expect(page.getByText("1 restore left")).toBeVisible();
    await expect(page.getByText("Oh no! You forgot to review yesterday.")).toHaveCount(0);
  });

  test("claims a milestone into the bank exactly once", async ({ page }) => {
    // 128 lifetime across three sub-marathon attempts, goal parked at 200 so
    // only the Questions family is claimable.
    await seedAttempts(page, [
      attempt("a1", at(0), 30, 40),
      attempt("a2", at(0), 30, 40),
      attempt("a3", at(0), 30, 48),
    ]);
    await seedSettings(page, { streak: { ...BANKED_TWO, banked: 0 }, dailyGoal: 200 });
    await page.goto("/progress");
    const claim = page.getByRole("button", { name: "Claim Riddler level 1, plus 1 restore" });
    await expect(claim).toBeVisible();
    await claim.click();
    await expect(page.getByText("1 restore left")).toBeVisible();
    await expect(page.getByRole("button", { name: "Claim Riddler level 1" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Claim/ })).toHaveCount(0);
  });
});

test.describe("Home strip", () => {
  test.beforeEach(async ({ page }) => {
    await seedReviewer(page);
  });

  test("pairs the goal with the global streak", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 5, 6), attempt("a2", at(1), 8, 8)]);
    await page.goto("/");
    await expect(page.getByText("Today 6/10")).toBeVisible();
    await expect(page.getByText("2-day streak")).toBeVisible();
  });

  test("offers the restore inline when yesterday was missed", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(2), 10, 10)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/");
    await expect(page.getByText("Oh no! You forgot to review yesterday.")).toBeVisible();
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("Oh no! You forgot to review yesterday.")).toHaveCount(0);
  });
});
