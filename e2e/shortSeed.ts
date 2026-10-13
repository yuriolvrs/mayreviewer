import type { Page } from "@playwright/test";

// A reviewer on a custom format with one choice type and one short-answer
// type: enough to cover typing, submit-time grading, partial credit,
// overrides, and the ungraded fallback. Seeded the same way as the custom
// format in seed.ts (idempotent init script, never touches attempts).

export const SHORT_FORMAT_ID = "e2e-short";
export const SHORT_REVIEWER_ID = "rv-e2e-short";
export const SHORT_CHOICE_CORRECT = "Option two";

const FORMAT = {
  id: SHORT_FORMAT_ID,
  name: "E2E Short",
  description: "Seeded format with a short-answer type.",
  types: [
    { key: "pick-x1", label: "Pick", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 1 },
    { key: "recall-x2", label: "Recall", format: "short-answer", shape: "standalone", stimulus: "none", defaultCount: 2 },
  ],
};

function reviewer() {
  const now = new Date().toISOString();
  return {
    id: SHORT_REVIEWER_ID,
    reviewerName: "Short Answer Check",
    subject: "Operating Systems",
    topics: [],
    notes: "seeded short-answer shape",
    projectMaterial: "",
    pastExamMaterial: "",
    examFormatId: SHORT_FORMAT_ID,
    questionCount: 3,
    questionCountByType: { "pick-x1": 1, "recall-x2": 2 },
    questions: [
      {
        id: "q-pick",
        type: "pick-x1",
        question: "Which structure maps virtual pages to frames?",
        options: ["Option one", SHORT_CHOICE_CORRECT, "Option three", "Option four"],
        correctIndex: 1,
        source: "notes",
        explanation: "The page table does the mapping.",
        whyOthersWrong: "The others do not map pages.",
      },
      {
        id: "q-short-1",
        type: "recall-x2",
        question: "Why does paging avoid external fragmentation?",
        options: [],
        correctIndex: -1,
        source: "notes",
        answerKind: "short",
        modelAnswer: "Frames are fixed size, so any free frame fits any page.",
        keyPoints: ["Frames are fixed size", "Any free frame can hold any page"],
      },
      {
        id: "q-short-2",
        type: "recall-x2",
        question: "What does the TLB cache?",
        options: [],
        correctIndex: -1,
        source: "notes",
        answerKind: "short",
        modelAnswer: "Recent page-table translations.",
        keyPoints: ["Page-table translations", "Recently used entries"],
      },
    ],
    createdAt: now,
    updatedAt: now,
    questionsGeneratedAt: now,
  };
}

export async function seedShort(page: Page): Promise<void> {
  await page.addInitScript(
    ({ format, reviewer: r }: { format: { id: string }; reviewer: { id: string } }) => {
      const fraw = window.localStorage.getItem("mayreviewer-formats");
      const formats = fraw ? (JSON.parse(fraw) as { id: string }[]) : [];
      if (!formats.some((f) => f.id === format.id)) formats.push(format);
      window.localStorage.setItem("mayreviewer-formats", JSON.stringify(formats));
      const rraw = window.localStorage.getItem("mayreviewer-reviewers");
      const reviewers = rraw ? (JSON.parse(rraw) as { id: string }[]) : [];
      if (!reviewers.some((x) => x.id === r.id)) reviewers.push(r);
      window.localStorage.setItem("mayreviewer-reviewers", JSON.stringify(reviewers));
    },
    { format: FORMAT, reviewer: reviewer() } as unknown as {
      format: { id: string };
      reviewer: { id: string };
    },
  );
}
