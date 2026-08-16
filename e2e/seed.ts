import type { Page } from "@playwright/test";
import type { Question, Reviewer } from "@/app/types";

// One Reviewer covering every shape the render paths branch on, so a single
// seeded fixture exercises all of them:
//   - standalone Identification and Scenario (prose)
//   - a Scenario carrying a prose stimulus (the shape that used to render as a
//     monospace problem block in the quiz but a blockquote in the edit tab)
//   - a Timeline set over a table and a Code set over a listing with blanks
//   - a Timeline question with its table inline in `question` and no stimulus,
//     which is what generation produced before sets existed

export const REVIEWER_ID = "rv-e2e-render";

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
    questionCount: SEEDED_QUESTIONS.length,
    questionCountByType: { identification: 1, scenario: 1, timeline: 3, code: 2 },
    questions: SEEDED_QUESTIONS,
    createdAt: now,
    updatedAt: now,
    questionsGeneratedAt: now,
  };
}

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
    window.localStorage.setItem("mayreviewer-reviewers", JSON.stringify([reviewer]));
  }, seededReviewer());
}
