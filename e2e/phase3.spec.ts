import { expect, test, type Page } from "@playwright/test";
import {
  CORRECT_OPTION,
  REVIEWER_ID,
  SEEDED_QUESTIONS,
  WRONG_OPTION,
  seedLegacyReviewer,
  seedReviewer,
} from "./seed";

// Phase 3 guarantees: home search, question starring + starred filter
// (persisted), missed-only quiz scope from the newest attempt, and offline
// gating of the server-dependent buttons.

test.beforeEach(async ({ page }) => {
  await seedReviewer(page);
  await seedLegacyReviewer(page);
});

// Answers every question by option TEXT — the only deterministic way once
// options are shuffled per attempt. Copied from questionRendering.spec.ts:
// shared seed, shared option set, shared constraint.
async function answerAll(page: Page, { missIndex }: { missIndex: number }): Promise<void> {
  const blocks = page.locator('div[id^="question-"]');
  for (let i = 0; i < (await blocks.count()); i++) {
    const wanted = i === missIndex ? WRONG_OPTION : CORRECT_OPTION;
    const labels = blocks.nth(i).locator("label");
    for (let j = 0; j < (await labels.count()); j++) {
      if ((await labels.nth(j).innerText()).includes(wanted)) {
        await labels.nth(j).locator('input[type="radio"]').check();
        break;
      }
    }
  }
}

async function submitQuiz(page: Page) {
  await page.getByRole("button", { name: /Submit/i }).first().click();
  const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
  if (await confirm.count()) await confirm.click();
}

test.describe("Home search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("filters by name, subject, and topic", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search reviewers" });
    await expect(page.getByText("Render Check")).toBeVisible();
    await expect(page.getByText("Legacy Pre-Format")).toBeVisible();

    await search.fill("legacy");
    await expect(page.getByText("Render Check")).toHaveCount(0);
    await expect(page.getByText("Legacy Pre-Format")).toBeVisible();
    await expect(page.getByText("1 of 2 reviewers shown")).toBeVisible();

    // "Scheduling" is a topic on the seeded reviewer, not its name.
    await search.fill("scheduling");
    await expect(page.getByText("Render Check")).toBeVisible();
    await expect(page.getByText("Legacy Pre-Format")).toHaveCount(0);

    await search.fill("zzz-no-match");
    await expect(page.getByText(/No reviewers match/)).toBeVisible();
  });
});

test.describe("Starred questions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}`);
    await page.getByRole("tab", { name: /^Questions/i }).click();
  });

  test("star toggles, filters, and survives reload with its URL param", async ({ page }) => {
    const items = page.locator("li").filter({ hasText: /Question \d+ ·/ });
    await expect(items).toHaveCount(SEEDED_QUESTIONS.length);

    await page.getByRole("button", { name: "Star question 1" }).click();
    await expect(page.getByRole("button", { name: "Unstar question 1" })).toBeVisible();

    await page.getByRole("button", { name: "Starred" }).click();
    await expect(items).toHaveCount(1);
    await expect(page).toHaveURL(/fav=starred/);

    // Persistence is the point of starring: reload keeps the star and filter.
    await page.reload();
    await expect(items).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Unstar question 1" })).toBeVisible();
  });
});

test.describe("Missed-last-time scope", () => {
  test("appears after an attempt and serves only the misses", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await expect(page.getByRole("button", { name: /Missed last time/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Start quiz" }).click();
    await answerAll(page, { missIndex: 1 });
    await submitQuiz(page);
    await expect(page.getByText(/7\s*\/\s*8/)).toBeVisible();

    // Setup remounts fresh on navigation, with the attempt in history.
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    const chip = page.getByRole("button", { name: /Missed last time \(1\)/ });
    await expect(chip).toBeVisible();

    await chip.click();
    await expect(page.getByLabel("Number of questions")).toHaveValue("1");
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.locator('div[id^="question-"]')).toHaveCount(1);
    // Index 1 was the Scenario about freezing UI — the one answered wrong.
    await expect(page.locator("body")).toContainText("freezing");
  });
});

test.describe("Offline gating", () => {
  test("generation disables offline with an explanation, re-enables online", async ({
    page,
    context,
  }) => {
    // Deep-link the tab instead of clicking it: the tab click fires a
    // router.replace whose RSC request, if still in flight when the network
    // drops, makes Next fall back to a document navigation that dies offline
    // (chrome-error page). A document load has no such race.
    await page.goto(`/reviewer/${REVIEWER_ID}?tab=questions`);
    await expect(page.getByRole("searchbox", { name: "Search questions" })).toBeVisible();
    const generate = page.getByRole("button", { name: /^Generate/ });

    await context.setOffline(true);
    await expect(generate).toBeDisabled();
    await expect(page.getByText(/needs a connection/)).toBeVisible();

    await context.setOffline(false);
    await expect(generate).toBeEnabled();
  });
});
