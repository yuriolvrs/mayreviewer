import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "path";
import {
  CODE_LISTING,
  CORRECT_OPTION,
  CUSTOM_FORMAT_ID,
  CUSTOM_REVIEWER_ID,
  LEGACY_REVIEWER_ID,
  REVIEWER_ID,
  SCENARIO_STIMULUS,
  SEEDED_QUESTIONS,
  WRONG_OPTION,
  seedCustom,
  seedLegacyReviewer,
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
    await page.getByRole("tab", { name: /^Questions/i }).click();
  });

  test("lists every seeded question, labelled with all five types", async ({ page }) => {
    const items = page.locator("li").filter({ hasText: /Question \d+ ·/ });
    await expect(items).toHaveCount(SEEDED_QUESTIONS.length);

    // The label is CSS-uppercased, so this is what the DOM text reads as.
    const listText = await page.locator("ul").filter({ hasText: /Question 1 ·/ }).innerText();
    for (const label of ["IDENTIFICATION", "SCENARIO", "TIMELINE", "CODE", "MODIFIED TRUE/FALSE"]) {
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

  test("a Modified True/False question is prose with preserved line breaks, not monospace", async ({
    page,
  }) => {
    // Numbered statements must survive to the screen on separate lines, in a
    // normal font — the monospace block is reserved for trace tables/listings.
    const mtf = page.locator("p", { hasText: "Which combination of statements" }).first();
    expect(await fontFamily(mtf)).not.toMatch(MONO);
    expect(await mtf.evaluate((el) => getComputedStyle(el).whiteSpace)).toMatch(/^pre/);
    expect(await mtf.innerText()).toContain("1. Deadlock requires");
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
    const { found } = await answerAll(page, { missIndex: 1 });

    await page.getByRole("button", { name: /Submit/i }).first().click();
    const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
    if (await confirm.count()) await confirm.click();

    // Seven of eight answered with the correct option's text. If `shuffleOptions`
    // ever reordered options without moving `correctIndex` with them, this
    // score would drift instead of failing outright.
    await expect(page.getByText(/7\s*\/\s*8/)).toBeVisible();

    // Every wanted option was actually found and checked — a question whose
    // text went missing would otherwise pass silently with a lower score.
    // (Slot movement itself is pinned by the shuffleOptions unit test; asserting
    // on random slot spread here would be probabilistic, not deterministic.)
    expect(found).toBe(SEEDED_QUESTIONS.length);
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
    for (const label of ["Identification", "Scenario", "Timeline", "Code", "Modified True/False"]) {
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
    await expect(page.getByText(/\d\s*\/\s*8/)).toBeVisible();

    const body = await openDeleteDialog(page);
    await expect(body).toContainText("has quiz history");
    await expect(body).toContainText("uploaded files");
  });

  test("drops the history clause when there is none", async ({ page }) => {
    const body = await openDeleteDialog(page);
    await expect(body).toContainText("permanently delete");
    await expect(body).toContainText("8 questions");
    await expect(body).toContainText("uploaded files");
    await expect(body).not.toContainText("has quiz history");
  });
});

test.describe("Exam formats", () => {
  test("the new-reviewer form offers the built-in format, preselected", async ({ page }) => {
    await page.goto("/reviewer/new");
    await expect(page.getByRole("radio", { name: /CSOPESY Final/ })).toBeChecked();
    await expect(page.getByText("Modified True/False").first()).toBeVisible();
  });

  test("the library lists the built-in with its type mix and a working entry link", async ({
    page,
  }) => {
    await page.goto("/formats");
    await expect(page.getByRole("heading", { name: "Exam formats" })).toBeVisible();
    await expect(page.getByText("Modified True/False").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /New reviewer with this format/ }).first(),
    ).toHaveAttribute("href", /\/reviewer\/new\?format=csopesy-final/);
  });

  test("the builder offers past-exam inference", async ({ page }) => {
    await page.goto("/formats/new");
    await expect(page.getByText("Learn from a past exam")).toBeVisible();
    await expect(page.getByRole("button", { name: "Infer question types" })).toBeVisible();
  });

  test("the builder creates a custom format that the picker then offers", async ({ page }) => {
    await page.goto("/formats/new");
    await page.getByPlaceholder(/Math 101/).fill("E2E Format");
    await page.getByRole("button", { name: "+ Add question type" }).click();
    await page.getByPlaceholder(/Formula recall/).fill("Recall");
    await page.getByRole("button", { name: "Create format" }).click();

    await expect(page).toHaveURL(/\/formats$/);
    await expect(page.getByText("E2E Format")).toBeVisible();

    await page.goto("/reviewer/new");
    await expect(page.getByRole("radio", { name: /E2E Format/ })).toBeVisible();
  });

  test("a pre-format reviewer migrates on open, total kept", async ({ page }) => {
    // Seeded raw: no examFormatId, no pastExamMaterial, 4-key breakdown.
    // Opening must show all five count fields, the total preserved, and the
    // built-in format selected.
    await seedLegacyReviewer(page);
    await page.goto(`/reviewer/${LEGACY_REVIEWER_ID}`);
    for (const label of ["Identification", "Scenario", "Timeline", "Code", "Modified True/False"]) {
      await expect(page.getByLabel(`${label} questions to generate`)).toBeVisible();
    }
    await expect(page.getByText("Total: 25 questions")).toBeVisible();
    await expect(page.getByLabel("Exam format")).toHaveValue("csopesy-final");
  });
});

test.describe("Custom formats", () => {
  test.beforeEach(async ({ page }) => {
    await seedCustom(page);
  });

  test("lists custom labels and filters by them", async ({ page }) => {
    await page.goto(`/reviewer/${CUSTOM_REVIEWER_ID}`);
    await page.getByRole("tab", { name: /^Questions/i }).click();
    const items = page.locator("li").filter({ hasText: /Question \d+ ·/ });
    await expect(items).toHaveCount(4);

    const listText = await page.locator("ul").filter({ hasText: /Question 1 ·/ }).innerText();
    expect(listText).toContain("RECALL");
    expect(listText).toContain("BLANK SET");

    await page.getByRole("button", { name: "Blank Set", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: /Question \d+ ·/ })).toHaveCount(2);
  });

  test("quiz setup scopes and scores by custom keys", async ({ page }) => {
    await page.goto(`/reviewer/${CUSTOM_REVIEWER_ID}/quiz`);
    await expect(page.getByRole("button", { name: "Recall" })).toBeVisible();
    await page.getByRole("button", { name: "Recall" }).click();
    await page.getByRole("button", { name: "Start quiz" }).click();
    await expect(page.locator('div[id^="question-"]')).toHaveCount(2);

    await answerAll(page, { missIndex: 0 });
    await page.getByRole("button", { name: /Submit/i }).first().click();
    const confirm = page.getByRole("button", { name: /Submit anyway|Submit quiz/i }).last();
    if (await confirm.count()) await confirm.click();
    // No space in the rendered score: the percent rides in a margin-spaced span.
    await expect(page.getByText("1/2(50%)", { exact: true })).toBeVisible();
  });

  test("a prose set quotes its passage per question", async ({ page }) => {
    await page.goto(`/reviewer/${CUSTOM_REVIEWER_ID}/quiz`);
    await page.getByRole("button", { name: "Start quiz" }).click();
    // Mono sets share one block; prose rides with its question (the 7f rule).
    await expect(page.locator("blockquote", { hasText: "Ang bata" })).toHaveCount(2);
    await expect(page.locator("pre", { hasText: "Ang bata" })).toHaveCount(0);
  });

  test("switching format re-seeds counts from the new defaults", async ({ page }) => {
    await page.goto(`/reviewer/${REVIEWER_ID}`);
    await page.getByLabel("Exam format").selectOption(CUSTOM_FORMAT_ID);
    await expect(page.getByLabel("Recall questions to generate")).toHaveValue("2");
    await expect(page.getByLabel("Blank Set questions to generate")).toHaveValue("2");
    await expect(page.getByText("Total: 4 questions")).toBeVisible();
  });

  test("clone creates an editable copy", async ({ page }) => {
    await page.goto("/formats");
    const card = page.locator("li", { hasText: "CSOPESY Final" }).first();
    await card.getByRole("button", { name: "Clone" }).click();
    await expect(page).toHaveURL(/\/formats\/.+/);
    await expect(page.locator('input[value="CSOPESY Final (copy)"]')).toBeVisible();
  });

  test("delete removes a custom format", async ({ page }) => {
    await page.goto("/formats/new");
    await page.getByPlaceholder(/Math 101/).fill("Delete Me");
    await page.getByRole("button", { name: "+ Add question type" }).click();
    await page.getByPlaceholder(/Formula recall/).fill("Recall");
    await page.getByRole("button", { name: "Create format" }).click();
    await expect(page.getByText("Delete Me")).toBeVisible();

    await page.locator("li", { hasText: "Delete Me" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete format" }).click();
    await expect(page.getByText("Delete Me")).toHaveCount(0);
  });

  test("builder validation blocks an unnamed format", async ({ page }) => {
    await page.goto("/formats/new");
    await page.getByRole("button", { name: "+ Add question type" }).click();
    await page.getByRole("button", { name: "Create format" }).click();
    await expect(page.getByText("Give the format a name.")).toBeVisible();
    await expect(page).toHaveURL(/\/formats\/new/);
  });

  test("deep link preselects the custom format in the picker", async ({ page }) => {
    await page.goto(`/reviewer/new?format=${CUSTOM_FORMAT_ID}`);
    await expect(page.getByRole("radio", { name: /E2E Custom/ })).toBeChecked();
  });
});

  test("a past-exam photo uploads through the real browser flow", async ({ page }) => {
    // Drives the actual file input (accept list, IndexedDB write, row
    // render) — the same path a phone photo of an exam takes, minus the
    // model call on the far end. Dual filter pinpoints the Past exam row:
    // ancestors match the text too, so .last() takes the innermost one.
    await page.goto(`/reviewer/${REVIEWER_ID}`);
    const row = page
      .locator("div")
      .filter({ hasText: "A sample exam" })
      .filter({ has: page.locator('input[type="file"]') })
      .last();
    await row.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures", "facts.png"));
    await expect(row.getByText("facts.png")).toBeVisible();
    await expect(row.getByText("IMG")).toBeVisible();
    await expect(row.getByText("sent as-is")).toBeVisible();
  });

// Answers every question by the option's TEXT — the only deterministic way once
// options are shuffled per attempt. Returns which slots the correct option
// landed in, which is what proves the shuffle ran.
async function answerAll(
  page: Page,
  { missIndex }: { missIndex: number },
): Promise<{ found: number }> {
  const blocks = page.locator('div[id^="question-"]');
  let found = 0;

  for (let i = 0; i < (await blocks.count()); i++) {
    const wanted = i === missIndex ? WRONG_OPTION : CORRECT_OPTION;
    const labels = blocks.nth(i).locator("label");

    for (let j = 0; j < (await labels.count()); j++) {
      if ((await labels.nth(j).innerText()).includes(wanted)) {
        await labels.nth(j).locator('input[type="radio"]').check();
        found++;
        break;
      }
    }
  }
  return { found };
}

// Referenced so an accidental edit to the fixture's listing shows up here
// rather than as a puzzling assertion failure above.
test("the code fixture still carries two numbered blanks", () => {
  expect(CODE_LISTING.match(/_{2,}\(\d+\)_{2,}/g)).toHaveLength(2);
});
