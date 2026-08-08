export type QuestionType = "identification" | "scenario" | "timeline" | "code";
export type QuestionSource = "notes" | "project";

export type Question = {
  id: string;
  type: QuestionType;
  question: string;
  options: string[];
  correctIndex: number;
  source: QuestionSource;
};

export type Reviewer = {
  id: string;
  reviewerName: string;
  notes: string;
  projectMaterial: string;
  questions: Question[];
  createdAt: string;
};
