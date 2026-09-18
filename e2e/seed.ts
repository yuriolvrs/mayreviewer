import type { Page } from "@playwright/test";
import type { Question, Reviewer } from "@/app/types";
import { CSOPESY_FINAL } from "@/app/lib/examFormats";

// One Reviewer covering every shape the render paths branch on, so a single
// seeded fixture exercises all of them:
//   - standalone Identification, Scenario, and Modified True/False (prose;
//     Modified True/False carries numbered statements with preserved breaks)
//   - a Scenario carrying a prose stimulus (the shape that used to render as a
//     monospace problem block in the quiz but a blockquote in the edit tab)
//   - a Timeline set over a table and a Code set over a listing with blanks
//   - a Timeline question with its table inline in `question` and no stimulus,
//     which is what generation produced before sets existed

export const REVIEWER_ID = "rv-e2e-render";
export const LEGACY_REVIEWER_ID = "rv-e2e-legacy";
export const CUSTOM_FORMAT_ID = "e2e-custom";
export const CUSTOM_REVIEWER_ID = "rv-e2e-custom";

export const TIMELINE_TABLE = `Process | Arrival | Burst
P1      | 0       | 5
P2      | 1       | 3
P3      | 2       | 8

Gantt (FCFS):
| P1        | P2     | P3              |
0           5        8                 16`;

export const CODE_LISTING = `int main() {
    int fd = ___(1)___("data.txt", O_RDONLY);
    char buf[64];
    while (read(fd, buf, ___(2)___) > 0) {
        write(1, buf, 64);
    }
    close(fd);
}`;

export const LEGACY_TIMELINE = `Trace the following schedule:

Time | Running | Ready Queue
-----+---------+------------
0    | P1      | P2, P3
5    | P2      | P3

Which process runs at t=5?`;

export const SCENARIO_STIMULUS =
  "The system uses cooperative multitasking with no preemption timer.";

export const MTF_STATEMENTS = `1. Deadlock requires all four Coffman conditions at the same time.
2. Preempting a resource can never help recover from a deadlock.
3. The Banker's algorithm grants a request only if the resulting state is safe.
4. A single-instance system can still deadlock.`;

// Every question shares one option set so specs can answer by text rather than
// by position — which is the only way to answer deterministically once
// `shuffleOptions` reorders them per attempt.
export const CORRECT_OPTION = "Option two";
export const WRONG_OPTION = "Option three";

function question(id: string, type: Question["type"], text: string, extra: Partial<Question> = {}): Question {
  return {
    id,
    type,
    question: text,
    options: ["Option one", CORRECT_OPTION, WRONG_OPTION, "Option four"],
    correctIndex: 1,
    source: "notes",
    explanation: "Because option two is the one the material states.",
    whyOthersWrong: "The others name unrelated mechanisms.",
    ...extra,
  };
}

export const SEEDED_QUESTIONS: Question[] = [
  question("q-ident", "identification", "What is the term for the illusion that each process has the CPU to itself?"),
  question("q-scen", "scenario", "A user reports the UI freezing during large file copies. What is the most likely cause?", {
    stimulus: SCENARIO_STIMULUS,
  }),
  question("q-tl-1", "timeline", "Under FCFS, what is P3's waiting time?", {
    groupId: "g-timeline",
    groupTitle: "FCFS scheduling trace",
    stimulus: TIMELINE_TABLE,
  }),
  question("q-tl-2", "timeline", "Under FCFS, what is the average turnaround time?", {
    groupId: "g-timeline",
    groupTitle: "FCFS scheduling trace",
    stimulus: TIMELINE_TABLE,
  }),
  question("q-code-1", "code", "Blank (1): which system call belongs here?", {
    groupId: "g-code",
    groupTitle: "File reading program",
    stimulus: CODE_LISTING,
  }),
  question("q-code-2", "code", "Blank (2): what value belongs here?", {
    groupId: "g-code",
    groupTitle: "File reading program",
    stimulus: CODE_LISTING,
  }),
  question("q-legacy-tl", "timeline", LEGACY_TIMELINE),
  question(
    "q-mtf",
    "modified-tf",
    `Which combination of statements about deadlock is true?\n\n${MTF_STATEMENTS}`,
  ),
];

export function seededReviewer(): Reviewer {
  const now = new Date().toISOString();
  return {
    id: REVIEWER_ID,
    reviewerName: "Render Check",
    subject: "Operating Systems",
    topics: ["Scheduling", "File I/O"],
    notes: "seeded by the e2e fixture",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: CSOPESY_FINAL.id,
    questionCount: SEEDED_QUESTIONS.length,
    questionCountByType: { identification: 1, scenario: 1, timeline: 3, code: 2, "modified-tf": 1 },
    questions: SEEDED_QUESTIONS,
    createdAt: now,
    updatedAt: now,
    questionsGeneratedAt: now,
  };
}

// A pre-format reviewer, exactly as browsers still hold them: no examFormatId,
// no pastExamMaterial, and a 4-key breakdown from before Modified True/False
// existed. The app must normalize it on open — five count fields, total kept.
export function legacyReviewer(): { id: string; [key: string]: unknown } {
  const now = new Date().toISOString();
  return {
    id: LEGACY_REVIEWER_ID,
    reviewerName: "Legacy Pre-Format",
    subject: "Operating Systems",
    topics: [],
    notes: "seeded legacy shape",
    projectMaterial: "",
    questionCount: 25,
    questionCountByType: { identification: 7, scenario: 6, timeline: 6, code: 6 },
    questions: [],
    createdAt: now,
    updatedAt: now,
    questionsGeneratedAt: now,
  };
}

// A custom format plus a reviewer on it, so specs can cover everything the
// built-in suite cannot: custom labels in lists/filters/scope chips, grouping
// over a custom set type, and quiz scoring with opaque type keys.
export const CUSTOM_PASSAGE = `Ang bata ay ___(1)___ ng tinapay.
Si Maria ay ___(2)___ ng mansanas.`;

export function customFormat(): Record<string, unknown> {
  return {
    id: CUSTOM_FORMAT_ID,
    name: "E2E Custom",
    description: "Seeded format with opaque type keys.",
    types: [
      { key: "recall-x1", label: "Recall", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 2 },
      { key: "blanks-x2", label: "Blank Set", format: "mc", shape: "set", stimulus: "prose", defaultCount: 2 },
    ],
  };
}

export function customReviewer(): Record<string, unknown> {
  const now = new Date().toISOString();
  const base = (id: string, type: string, text: string, extra: Record<string, unknown> = {}) => ({
    id,
    type,
    question: text,
    options: ["Option one", CORRECT_OPTION, WRONG_OPTION, "Option four"],
    correctIndex: 1,
    source: "notes",
    explanation: "Because option two is the one the material states.",
    whyOthersWrong: "The others name unrelated mechanisms.",
    ...extra,
  });
  return {
    id: CUSTOM_REVIEWER_ID,
    reviewerName: "Custom Render",
    subject: "Filipino",
    topics: [],
    notes: "seeded custom shape",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: CUSTOM_FORMAT_ID,
    questionCount: 4,
    questionCountByType: { "recall-x1": 2, "blanks-x2": 2 },
    questions: [
      base("q-c1", "recall-x1", "What does 'pandiwa' mean?"),
      base("q-c2", "recall-x1", "What is 'panlapi'?"),
      base("q-c3", "blanks-x2", "Blank (1): what belongs here?", {
        groupId: "g-custom",
        groupTitle: "Pangungusap",
        stimulus: CUSTOM_PASSAGE,
      }),
      base("q-c4", "blanks-x2", "Blank (2): what belongs here?", {
        groupId: "g-custom",
        groupTitle: "Pangungusap",
        stimulus: CUSTOM_PASSAGE,
      }),
    ],
    createdAt: now,
    updatedAt: now,
    questionsGeneratedAt: now,
  };
}

// Appends the custom format and its reviewer idempotently. Runs after
// seedReviewer's init script like its legacy sibling.
export async function seedCustom(page: Page): Promise<void> {
  await page.addInitScript(
    ({ format, reviewer }: { format: { id: string }; reviewer: { id: string } }) => {
      const fraw = window.localStorage.getItem("mayreviewer-formats");
      const formats = fraw ? (JSON.parse(fraw) as { id: string }[]) : [];
      if (!formats.some((f) => f.id === format.id)) formats.push(format);
      window.localStorage.setItem("mayreviewer-formats", JSON.stringify(formats));
      const rraw = window.localStorage.getItem("mayreviewer-reviewers");
      const reviewers = rraw ? (JSON.parse(rraw) as { id: string }[]) : [];
      if (!reviewers.some((r) => r.id === reviewer.id)) reviewers.push(reviewer);
      window.localStorage.setItem("mayreviewer-reviewers", JSON.stringify(reviewers));
    },
    { format: customFormat(), reviewer: customReviewer() } as unknown as {
      format: { id: string };
      reviewer: { id: string };
    },
  );
}

// Appends rather than overwrites: it runs after seedReviewer's init script,
// which owns the list. Idempotent across navigations like its sibling.
export async function seedLegacyReviewer(page: Page): Promise<void> {
  await page.addInitScript((reviewer) => {
    const raw = window.localStorage.getItem("mayreviewer-reviewers");
    const list = raw ? (JSON.parse(raw) as { id: string }[]) : [];
    if (!list.some((r) => r.id === reviewer.id)) list.push(reviewer);
    window.localStorage.setItem("mayreviewer-reviewers", JSON.stringify(list));
  }, legacyReviewer());
}
//
// Seeds via an init script rather than goto-then-evaluate, so the Reviewer is
// in localStorage before the app's first read runs — the reviewer page renders
// "Reviewer not found" if it isn't.
//
// The script re-runs on every navigation, so it must be idempotent and must not
// touch quiz attempts: a spec that takes a quiz and then navigates to check its
// history would otherwise wipe the attempt it just recorded. Each test gets a
// fresh context, so attempts start empty without clearing them here.
export async function seedReviewer(page: Page): Promise<void> {
  await page.addInitScript((reviewer) => {
    const raw = window.localStorage.getItem("mayreviewer-reviewers");
    const list = raw ? (JSON.parse(raw) as { id: string }[]) : [];
    if (!list.some((r) => r.id === reviewer.id)) list.push(reviewer);
    window.localStorage.setItem("mayreviewer-reviewers", JSON.stringify(list));
  }, seededReviewer());
}

// Attempts seed for the daily strip. Unlike reviewers this OVERWRITES on
// every navigation (init scripts re-run), so specs using it must seed, go
// to one page, and assert without navigating again — otherwise a recorded
// quiz attempt would be wiped mid-test.
export async function seedAttempts(page: Page, attempts: unknown[]): Promise<void> {
  await page.addInitScript((list) => {
    window.localStorage.setItem("mayreviewer-quiz-attempts", JSON.stringify(list));
  }, attempts);
}
