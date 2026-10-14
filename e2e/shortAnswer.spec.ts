import { expect, test, type Page, type Route } from "@playwright/test";
import { SHORT_CHOICE_CORRECT, SHORT_REVIEWER_ID, seedShort } from "./shortSeed";

// Short answers: typed in the quiz, graded in one call at submit, scored with
// partial credit, overridable, and recoverable when grading fails. /api/grade
// is mocked — the route itself is covered by tests/grade-route.test.ts.

type GradeRequest = { items: { id: string; answer: string }[] };

// First typed answer covers one of two key points, the second covers both.
async function mockGrading(page: Page) {
  await page.route("**/api/grade", async (route: Route) => {
    const { items } = route.request().postDataJSON() as GradeRequest;
    const grades: Record<string, unknown> = {};
    for (const item of items) {
      grades[item.id] =
        item.id === "q-short-1"
          ? { met: [0], feedback: "You covered the fixed frame size but not that any frame fits.", credit: 0.5 }
          : { met: [0, 1], feedback: "Complete.", credit: 1 };
    }
    await route.fulfill({ json: { grades, failed: [] } });
  });
}

async function startQuiz(page: Page) {
  await page.goto(`/reviewer/${SHORT_REVIEWER_ID}/quiz`);
  await page.getByRole("button", { name: "Start quiz" }).click();
  await expect(page.locator('div[id^="question-"]')).toHaveCount(3);
}

async function answerAll(page: Page) {
  const choice = page.locator("label", { hasText: SHORT_CHOICE_CORRECT }).first();
  await choice.locator('input[type="radio"]').check();
  await page.getByLabel("Your answer to question 2").fill("Frames have a fixed size.");
  await page.getByLabel("Your answer to question 3").fill("It caches recent page table entries.");
}

test.describe("Short-answer quiz", () => {
  test.beforeEach(async ({ page }) => {
    await seedShort(page);
  });

  test("grades at submit, shows partial credit, and lets the reader override", async ({ page }) => {
    await mockGrading(page);
    await startQuiz(page);

    // The textarea replaces the options, and says when it is graded.
    await expect(page.getByLabel("Your answer to question 2")).toBeVisible();
    await expect(page.getByText("Graded by AI when you submit.")).toHaveCount(2);
    await answerAll(page);
    await expect(page.getByText("3 of 3 answered").filter({ visible: true })).toBeVisible();

    await page.getByRole("button", { name: "Submit quiz" }).click();

    // 1 (choice) + 0.5 + 1.
    await expect(page.getByText(/2\.5\s*\/\s*3/)).toBeVisible();
    await expect(page.getByText("1/2 key points covered")).toBeVisible();
    await expect(page.getByText("You covered the fixed frame size but not that any frame fits.")).toBeVisible();
    // The partly covered answer is in Incorrect, with the student's own text.
    await expect(page.getByText("Frames have a fixed size.")).toBeVisible();

    await page.getByRole("button", { name: "Count as correct" }).click();
    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
    // The row moved to the (collapsed) Correct section.
    await page.getByRole("button", { name: /^Correct/ }).click();
    await expect(page.getByText("Counted as correct (your override)")).toBeVisible();

    // The override is what history shows.
    await page.goto("/history");
    await expect(page.getByText(/3\s*\/\s*3\s*100%/)).toBeVisible();
  });

  test("keeps typed answers across a refresh", async ({ page }) => {
    await mockGrading(page);
    await startQuiz(page);
    await page.getByLabel("Your answer to question 2").fill("Frames have a fixed size.");

    await page.reload();

    await expect(page.locator('div[id^="question-"]')).toHaveCount(3);
    await expect(page.getByLabel("Your answer to question 2")).toHaveValue("Frames have a fixed size.");
  });

  test("a failed grade call can be retried without retyping", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/grade", async (route) => {
      calls += 1;
      if (calls === 1) {
        await route.fulfill({ status: 502, json: { error: "Grading is unavailable right now." } });
        return;
      }
      const { items } = route.request().postDataJSON() as GradeRequest;
      const grades = Object.fromEntries(
        items.map((i) => [i.id, { met: [0, 1], feedback: "Complete.", credit: 1 }]),
      );
      await route.fulfill({ json: { grades, failed: [] } });
    });

    await startQuiz(page);
    await answerAll(page);
    await page.getByRole("button", { name: "Submit quiz" }).click();

    await expect(page.getByRole("heading", { name: "Couldn't grade your answers" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
    expect(calls).toBe(2);
  });

  test("saving without grading keeps the text and can be graded later", async ({ page }) => {
    let healthy = false;
    await page.route("**/api/grade", async (route) => {
      if (!healthy) {
        await route.fulfill({ status: 502, json: { error: "Grading is unavailable right now." } });
        return;
      }
      const { items } = route.request().postDataJSON() as GradeRequest;
      const grades = Object.fromEntries(
        items.map((i) => [i.id, { met: [0, 1], feedback: "Complete.", credit: 1 }]),
      );
      await route.fulfill({ json: { grades, failed: [] } });
    });

    await startQuiz(page);
    await answerAll(page);
    await page.getByRole("button", { name: "Submit quiz" }).click();
    await page.getByRole("button", { name: "Save without grading" }).click();

    // Only the choice question counts until the answers are graded.
    await expect(page.getByText(/1\s*\/\s*3/)).toBeVisible();
    await expect(page.getByText(/2 short answers were saved without a grade/)).toBeVisible();
    await expect(page.getByText("Frames have a fixed size.")).toBeVisible();

    healthy = true;
    await page.getByRole("button", { name: "Grade now" }).click();

    await expect(page.getByText(/3\s*\/\s*3/)).toBeVisible();
    await expect(page.getByText(/saved without a grade/)).toHaveCount(0);
  });

  test("blank short answers are graded locally with no grade call", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/grade", async (route) => {
      calls += 1;
      await route.fulfill({ status: 500, json: { error: "should not be called" } });
    });

    await startQuiz(page);
    await page.locator("label", { hasText: SHORT_CHOICE_CORRECT }).first().locator('input[type="radio"]').check();
    await page.getByRole("button", { name: "Submit quiz" }).click();
    await page.getByRole("button", { name: "Submit anyway" }).click();

    await expect(page.getByText(/1\s*\/\s*3/)).toBeVisible();
    await expect(page.getByText("No answer given.").first()).toBeVisible();
    expect(calls).toBe(0);
  });
});
