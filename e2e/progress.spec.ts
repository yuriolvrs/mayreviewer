import { expect, test, type Page } from "@playwright/test";
import { REVIEWER_ID, seedAttempts, seedReviewer } from "./seed";

// Progress page: goal, streak + week track, restores, automatic milestones.
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
    answers: Object.fromEntries(Array.from({ length: total }, (_, i) => [`q${i}`, 0])),
    unsureIds: [],
    questionSetGeneratedAt: "legacy",
    examFormatId: "os-exam",
    examFormatName: "Operating Systems Exam",
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

  test("renders goal, streak, and week track from real attempts", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 5, 6), attempt("a2", at(1), 7, 8)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("4 more to go")).toBeVisible();
    await expect(page.getByRole("link", { name: "Answer 4 more" })).toHaveAttribute(
      "href",
      `/reviewer/${REVIEWER_ID}/quiz`,
    );
    await expect(page.locator("p").filter({ hasText: /^2 restores\. Each repairs one missed day/ })).toBeVisible();
    const week = page.getByRole("list", { name: "Last 7 days" });
    await expect(week.getByRole("listitem")).toHaveCount(7);
    await expect(week.getByRole("listitem").last()).toHaveAttribute("aria-label", "Today, active");
    // No missed yesterday here, so no restore action.
    await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
  });

  test("shows the empty state for a first-run user", async ({ page }) => {
    await seedAttempts(page, []);
    await page.goto("/progress");
    await expect(page.getByText("Start your first quiz")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your reviewers" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("heading", { name: "Milestones" })).toHaveCount(0);
  });

  test("restores a missed yesterday and marks the day restored", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(2), 9, 10)]);
    // Goal parked high so Goal Getter does not bank an extra restore.
    await seedSettings(page, { streak: BANKED_TWO, dailyGoal: 200 });
    await page.goto("/progress");
    await expect(
      page.getByText("Your 1-day streak ended yesterday. Restore it now or it is lost."),
    ).toBeVisible();
    await expect(page.getByText("Uses 1 of 2 restores.")).toBeVisible();
    await page.getByRole("button", { name: "Restore 2-day streak" }).click();
    await expect(page.getByText("ended yesterday")).toHaveCount(0);
    await expect(page.locator("p").filter({ hasText: /^1 restore\. Each repairs/ })).toBeVisible();
    await expect(page.getByRole("listitem", { name: /, restored$/ })).toHaveCount(1);
  });

  test("says a missed streak cannot be repaired with no restores", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(2), 9, 10)]);
    await seedSettings(page, { streak: { ...BANKED_TWO, banked: 0 }, dailyGoal: 200 });
    await page.goto("/progress");
    await expect(page.getByText("You have 0 restores, so")).toBeVisible();
    await expect(page.getByRole("button", { name: /Restore/ })).toHaveCount(0);
  });

  test("warns that a pending streak ends tonight", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(1), 8, 8), attempt("a2", at(0), 2, 2)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(
      page.getByText("Your 1-day streak ends tonight. Answer 3 more to keep it."),
    ).toBeVisible();
  });

  test("a blanks-only attempt does not make a streak day", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 0, 50, { answers: {} })]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(page.getByText("No streak yet.")).toBeVisible();
    await expect(page.getByText("0 of 10", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Answer 10 more" })).toBeVisible();
  });

  test("banks a reached level automatically", async ({ page }) => {
    // 128 answered across three attempts; goal parked at 200 so only Riddler levels.
    await seedAttempts(page, [
      attempt("a1", at(0), 30, 40),
      attempt("a2", at(0), 30, 40),
      attempt("a3", at(0), 30, 48),
    ]);
    await seedSettings(page, { streak: { ...BANKED_TWO, banked: 0 }, dailyGoal: 200 });
    await page.goto("/progress");
    await expect(page.locator("p").filter({ hasText: /^1 restore\. Each repairs/ })).toBeVisible();
    await expect(page.getByText("Riddler I")).toBeVisible();
    await expect(page.getByRole("button", { name: /Claim/ })).toHaveCount(0);
  });

  test("a level reached at a full bank waits as pending", async ({ page }) => {
    await seedAttempts(page, [
      attempt("a1", at(0), 30, 40),
      attempt("a2", at(0), 30, 40),
      attempt("a3", at(0), 30, 48),
    ]);
    await seedSettings(page, { streak: { ...BANKED_TWO, banked: 6 }, dailyGoal: 200 });
    await page.goto("/progress");
    await expect(page.locator("p").filter({ hasText: /^6 restores\..*1 more waiting: the bank holds 6\./ })).toBeVisible();
  });

  test("keeps a full bar and Goal met when the goal is done", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(0), 10, 10)]);
    await seedStreak(page, BANKED_TWO);
    await page.goto("/progress");
    await expect(page.getByText("Goal met")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Today's goal progress" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Answer \d+ more/ })).toHaveCount(0);
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
    await expect(page.getByText("Your 1-day streak ended yesterday.")).toBeVisible();
    await page.getByRole("button", { name: "Restore 2-day streak" }).click();
    await expect(page.getByText("Your 1-day streak ended yesterday.")).toHaveCount(0);
  });

  test("warns when the streak ends tonight", async ({ page }) => {
    await seedAttempts(page, [attempt("a1", at(1), 10, 10)]);
    await page.goto("/");
    await expect(page.getByText("Your 1-day streak ends tonight. 5 more to keep it.")).toBeVisible();
  });
});

test.describe("Bottom bar hint", () => {
  test("shows a dot on Progress when a restore can save the streak", async ({ page }) => {
    await seedReviewer(page);
    await seedAttempts(page, [attempt("a1", at(2), 10, 10)]);
    await seedStreak(page, BANKED_TWO);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Progress, restore available" })).toBeVisible();
  });
});
