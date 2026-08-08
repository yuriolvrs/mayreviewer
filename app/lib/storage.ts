import type { Reviewer } from "@/app/types";

// The ONLY file that touches localStorage. Swapping to Supabase later means
// rewriting the insides of these functions, not the components that call them.
const STORAGE_KEY = "mayreviewer-reviewers";

export function getReviewers(): Reviewer[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Reviewer[];
  } catch {
    return [];
  }
}

export function getReviewer(id: string): Reviewer | undefined {
  return getReviewers().find((r) => r.id === id);
}

export function saveReviewer(reviewer: Reviewer): void {
  const reviewers = getReviewers();
  const index = reviewers.findIndex((r) => r.id === reviewer.id);
  if (index === -1) {
    reviewers.push(reviewer);
  } else {
    reviewers[index] = reviewer;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewers));
}

export function deleteReviewer(id: string): void {
  const reviewers = getReviewers().filter((r) => r.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewers));
}

// Stub until Phase 6c wires up real quiz attempts — keeps the delete-warning
// branch in place now so it just starts returning true later.
export function hasQuizHistory(id: string): boolean {
  void id;
  return false;
}
