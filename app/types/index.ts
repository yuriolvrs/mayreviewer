// The five built-in type keys. Custom formats (Chapter 3) use their own
// opaque string keys — behavior comes from the format's type definitions,
// never from matching these literals, so nothing below switches on them.
export type BuiltinQuestionType =
  | "identification"
  | "scenario"
  | "timeline"
  | "code"
  | "modified-tf";

// Kept as the name the codebase imports: for built-in-only code it still
// reads as "one of the known types". The widened carriers (Question.type,
// counts, scopes) use plain string.
export type QuestionType = BuiltinQuestionType;
// "manual" marks a question written by hand in the Edit Questions tab, as
// opposed to one generated from uploaded notes/project material. "pastexam"
// marks one generated from a past exam (reviewer-level attachment or the
// format's own sample exam) — provenance the UI filters on.
export type QuestionSource = "notes" | "project" | "manual" | "pastexam";

// Timeline and Code questions come in sets: one traced problem (a scheduling
// table, a code listing with numbered blanks) with several questions hanging
// off it. The shared problem is copied onto every question in the set rather
// than stored once in a parallel array, so a Question stays self-contained —
// filtering, deleting, and importing one never has to chase a second table.
// Questions in a set are contiguous and share `groupId`; the other three types
// leave all three fields undefined.
export type Question = {
  id: string;
  // Opaque key into the reviewer's format type list (a built-in literal or a
  // custom slug). What it renders and generates as comes from that
  // definition, not from this string's value.
  type: string;
  question: string;
  options: string[];
  correctIndex: number;
  source: QuestionSource;
  groupId?: string;
  groupTitle?: string;
  stimulus?: string;
  // One or two sentences on why the correct option is correct. Optional so
  // older stored questions (generated or hand-written) without one still
  // validate — the UI just omits the explanation for those.
  explanation?: string;
  // The matching one or two sentences on why the other options are wrong,
  // shown as a second paragraph under `explanation`. Optional for the same
  // reason, and independently so — questions stored before it existed keep
  // showing their single paragraph.
  whyOthersWrong?: string;
  // Starred by hand in the Questions tab. Optional so older stored questions
  // without it still validate — the UI treats missing as unstarred.
  favorite?: boolean;
};

export type FeedbackMode = "immediate" | "end-only";

// Phase 1 (Mobile-Gaps-Plan): user-level preferences stored in
// `mayreviewer-settings` via `app/lib/settings.ts`. The only file that
// touches that key — same seam as `storage.ts` for a future Supabase swap.
export type ThemePreference = "system" | "light" | "dark";
export type FontSizePreference = "normal" | "large";

export type UserSettings = {
  feedbackMode: FeedbackMode;
  defaultCount: number;
  shuffle: boolean;
  theme: ThemePreference;
  fontSize: FontSizePreference;
  reduceMotion: boolean;
  remindersEnabled: boolean;
  reminderTime: string;
  // Reserved for later monetization. Always "free" in v1 — nothing gates on it.
  proTier: "free";
};

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
  // Snapshot of the reviewer's `questionsGeneratedAt` when this attempt was
  // taken. Two attempts sharing this value were taken against the same
  // generated set; a change marks a regenerate in between. Attempts saved
  // before this field existed share one legacy value instead of a real
  // timestamp — see `normalizeAttempt` in storage.ts.
  questionSetGeneratedAt: string;
  // Snapshot of the format the reviewer was on: renames and edits after the
  // attempt must not rewrite what the history list says it was taken under.
  // Backfilled from the reviewer's current format for older attempts, same as
  // above.
  examFormatId: string;
  examFormatName: string;
};

export type Reviewer = {
  id: string;
  reviewerName: string;
  subject: string;
  topics: string[];
  notes: string;
  projectMaterial: string;
  // The reviewer's own sample past exam (text side; files live in the
  // attachments store under field "pastexam"). Reference material for
  // generation, alongside notes and project material.
  pastExamMaterial: string;
  // Which exam format this reviewer generates under. Reviewers saved before
  // formats existed read back as the built-in CSOPESY Final (see `normalize`
  // in storage.ts), so nothing about them changes.
  examFormatId: string;
  // The total, kept as a mirror of `questionCountByType`'s sum — it's what the
  // rest of the app reads when it just needs "how many". `storage.ts` derives
  // it on read so the two can't drift.
  questionCount: number;
  // How many questions of each type to generate, keyed by the format's type
  // keys. The editable setting; reviewers saved before it existed get one
  // seeded from their total.
  questionCountByType: Record<string, number>;
  questions: Question[];
  createdAt: string;
  // Stamped by storage.ts on every save, not by callers — so it can't be
  // missed by a write path that forgets to set it.
  updatedAt: string;
  // Stamped only when `questions` is wholesale-replaced by generation, not by
  // manual add/edit/delete of individual questions. Lets attempts snapshot
  // which generated set they were taken against.
  questionsGeneratedAt: string;
};
