import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CODE_LISTING,
  CORRECT_OPTION,
  REVIEWER_ID,
  SCENARIO_STIMULUS,
  SEEDED_QUESTIONS,
  WRONG_OPTION,
  seedReviewer,
} from "./seed";

// These cover the Phase 7 rendering guarantees: a Timeline table and a Code
// listing have to survive to the screen with their alignment intact, and the
// edit, quiz, and results screens have to agree on how a stimulus is rendered.
// They were a throwaway script through Phases 4-6; they're here because that
// is what let the same class of bug (7f) sit unnoticed until it was looked for.

const MONO = /mono/i;

function fontFamily(locator: Locator) {
  return locator.evaluate((el) => getComputedStyle(el).fontFamily);
}

test.beforeEach(async ({ page }) => {
  await seedReviewer(page);
});

test.describe("Questions tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}`);
    await page.getByRole("button", { name: /^Questions/i }).click();
  });

  test("lists every seeded question, labelled with all four types", async ({ page }) => {
    const items = page.locator("li").filter({ hasText: /Question \d+ ·/ });
    await expect(items).toHaveCount(SEEDED_QUESTIONS.length);

    // The label is CSS-uppercased, so this is what the DOM text reads as.
    const listText = await page.locator("ul").filter({ hasText: /Question 1 ·/ }).innerText();
    for (const label of ["IDENTIFICATION", "SCENARIO", "TIMELINE", "CODE"]) {
      expect(listText).toContain(label);
    }
  });

  test("a Timeline question with its table inline is monospace and keeps its whitespace", async ({
    page,
  }) => {
    const legacy = page.locator("p", { hasText: "Which process runs at t=5?" }).first();
    expect(await fontFamily(legacy)).toMatch(MONO);
    expect(await legacy.evaluate((el) => getComputedStyle(el).whiteSpace)).toMatch(/^pre/);
  });

  test("a set question's own text is prose, since its table lives in the stimulus", async ({
    page,
  }) => {
    const setQuestion = page.locator("p", { hasText: "what is P3's waiting time" }).first();
    expect(await fontFamily(setQuestion)).not.toMatch(MONO);
  });

  test("set stimuli keep column alignment and blank markers", async ({ page }) => {
    const summaries = page.locator("details summary");
    for (let i = 0; i < (await summaries.count()); i++) await summaries.nth(i).click();

    const table = page.locator("details pre", { hasText: "Gantt" }).first();
    expect(await fontFamily(table)).toMatch(MONO);
    // Collapsing the run of spaces would silently misalign every trace table.
    expect(await table.innerText()).toContain("P1      | 0       | 5");

    const listing = page.locator("details pre", { hasText: "int main()" }).first();
    const listingText = await listing.innerText();
    expect(listingText).toContain('    int fd = ___(1)___("data.txt", O_RDONLY);');
    expect(listingText).toContain("___(2)___");
  });

  test("a prose stimulus is quoted, not rendered as a code block", async ({ page }) => {
    await expect(page.locator("blockquote", { hasText: SCENARIO_STIMULUS })).toHaveCount(1);
    await expect(page.locator("pre", { hasText: SCENARIO_STIMULUS })).toHaveCount(0);
  });
});

test.describe("Quiz", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.locator('div[id^="question-"]')).toHaveCount(SEEDED_QUESTIONS.length);
  });

  test("shows one shared problem block per set, not one per question", async ({ page }) => {
    // Two sets, two blocks — repeating a 30-line listing under every blank
    // buries the questions between copies of the same program.
    await expect(page.locator("pre")).toHaveCount(2);
    await expect(page.locator("p", { hasText: /questions \d+–\d+/i })).toHaveCount(2);
  });

  test("keeps table alignment and links each code blank to its question", async ({ page }) => {
    const table = page.locator("pre", { hasText: "Gantt" }).first();
    expect(await table.innerText()).toContain("P1      | 0       | 5");

    const blanks = page.locator("pre button", { hasText: /_{2,}\(\d+\)_{2,}/ });
    await expect(blanks).toHaveCount(2);

    // Clicking a blank scrolls to the question that fills it.
    await blanks.first().click();
    await expect(page.locator("#question-q-code-1")).toBeInViewport();
  });

  test("a Timeline question with its table inline stays monospace", async ({ page }) => {
    const legacy = page.locator("p", { hasText: "Which process runs at t=5?" }).first();
    expect(await fontFamily(legacy)).toMatch(MONO);
  });

  test("a prose stimulus is quoted here too, and keeps its problem header off", async ({ page }) => {
    await expect(page.locator("blockquote", { hasText: SCENARIO_STIMULUS })).toHaveCount(1);
    await expect(page.locator("pre", { hasText: SCENARIO_STIMULUS })).toHaveCount(0);
  });

  test("scores a shuffled attempt by option text, not position", async ({ page }) => {
    const { positions } = await answerAll(page, { missIndex: 1 });

    await page.getByRole("button", { name: /Submit/i }).first().click();
    const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
    if (await confirm.count()) await confirm.click();

    // Six of seven answered with the correct option's text. If `shuffleOptions`
    // ever reordered options without moving `correctIndex` with them, this
    // score would drift instead of failing outright.
    await expect(page.getByText(/6\s*\/\s*7/)).toBeVisible();

    // ...and the shuffle has to actually be shuffling.
    expect(positions.size).toBeGreaterThan(1);
  });

  test("results carry the missed question's prose stimulus, still as a quote", async ({ page }) => {
    await answerAll(page, { missIndex: 1 });
    await page.getByRole("button", { name: /Submit/i }).first().click();
    const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
    if (await confirm.count()) await confirm.click();

    const body = page.locator("body");
    await expect(body).toContainText(WRONG_OPTION);
    await expect(body).toContainText(CORRECT_OPTION);
    // Routing prose to the plain result row would drop the stimulus entirely,
    // since ResultRow renders no stimulus of its own for grouped questions.
    await expect(page.locator("blockquote", { hasText: SCENARIO_STIMULUS })).toHaveCount(1);
    await expect(page.locator("pre", { hasText: SCENARIO_STIMULUS })).toHaveCount(0);

    // Title case, not the questions list's uppercase: `toContainText` reads
    // `textContent`, which is the source text before CSS `text-transform`.
    for (const label of ["Identification", "Scenario", "Timeline", "Code"]) {
      await expect(body).toContainText(label);
    }
  });
});

test.describe("Delete warning", () => {
  async function openDeleteDialog(page: Page) {
    await page.goto(`/reviewer/${REVIEWER_ID}`);
    await page.getByRole("button", { name: "Delete reviewer" }).click();
    return page.locator("body");
  }

  test("names the quiz history when the reviewer has some", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "Start quiz" }).click();
    await answerAll(page, { missIndex: 1 });
    await page.getByRole("button", { name: /Submit/i }).first().click();
    const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
    if (await confirm.count()) await confirm.click();
    await expect(page.getByText(/\d\s*\/\s*7/)).toBeVisible();

    const body = await openDeleteDialog(page);
    await expect(body).toContainText("has quiz history");
    await expect(body).toContainText("uploaded files");
  });

  test("drops the history clause when there is none", async ({ page }) => {
    const body = await openDeleteDialog(page);
    await expect(body).toContainText("permanently delete");
    await expect(body).toContainText("7 questions");
    await expect(body).toContainText("uploaded files");
    await expect(body).not.toContainText("has quiz history");
  });
});

// Answers every question by the option's TEXT — the only deterministic way once
// options are shuffled per attempt. Returns which slots the correct option
// landed in, which is what proves the shuffle ran.
async function answerAll(
  page: Page,
  { missIndex }: { missIndex: number },
): Promise<{ positions: Set<number> }> {
  const blocks = page.locator('div[id^="question-"]');
  const positions = new Set<number>();

  for (let i = 0; i < (await blocks.count()); i++) {
    const wanted = i === missIndex ? WRONG_OPTION : CORRECT_OPTION;
    const labels = blocks.nth(i).locator("label");

    for (let j = 0; j < (await labels.count()); j++) {
      if ((await labels.nth(j).innerText()).includes(wanted)) {
        await labels.nth(j).locator('input[type="radio"]').check();
        if (i !== missIndex) positions.add(j);
        break;
      }
    }
  }
  return { positions };
}

// Referenced so an accidental edit to the fixture's listing shows up here
// rather than as a puzzling assertion failure above.
test("the code fixture still carries two numbered blanks", () => {
  expect(CODE_LISTING.match(/_{2,}\(\d+\)_{2,}/g)).toHaveLength(2);
});
