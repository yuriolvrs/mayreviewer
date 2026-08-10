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

// One completed quiz attempt, listed in the Quiz History section and reopenable
// from there. It's a snapshot rather than a pointer: the questions asked are
// copied in beside the answers and unsure flags, so an old attempt still shows
// what it actually asked after those questions have been edited or deleted from
// the reviewer's pool.
export type QuizAttempt = {
  id: string;
  reviewerId: string;
  takenAt: string;
  score: number;
  total: number;
  questions: Question[];
  answers: Record<string, number>;
  unsureIds: string[];
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
  // Stamped by storage.ts on every save, not by callers — so it can't be
  // missed by a write path that forgets to set it.
  updatedAt: string;
};
