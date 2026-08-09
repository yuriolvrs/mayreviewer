export type QuestionType = "identification" | "scenario" | "timeline" | "code";
// "manual" marks a question written by hand in the Edit Questions tab, as
// opposed to one generated from uploaded notes/project material.
export type QuestionSource = "notes" | "project" | "manual";

// Timeline and Code questions come in sets: one traced problem (a scheduling
// table, a code listing with numbered blanks) with several questions hanging
// off it. The shared problem is copied onto every question in the set rather
// than stored once in a parallel array, so a Question stays self-contained —
// filtering, deleting, and importing one never has to chase a second table.
// Questions in a set are contiguous and share `groupId`; the other two types
// leave all three fields undefined.
export type Question = {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  source: QuestionSource;
  groupId?: string;
  groupTitle?: string;
  stimulus?: string;
};

export type FeedbackMode = "immediate" | "end-only";

// One completed quiz attempt, listed in the Quiz History section. The "unsure"
// flags aren't here on purpose — they're scoped to a single attempt in progress
// and reset on retake, so they never outlive the attempt itself.
export type QuizAttempt = {
  id: string;
  reviewerId: string;
  takenAt: string;
  score: number;
  total: number;
};

export type Reviewer = {
  id: string;
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  questionCount: number;
  questions: Question[];
  createdAt: string;
};
