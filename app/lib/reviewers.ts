import { deleteReviewer, hasQuizHistory } from "@/app/lib/storage";
import { deleteAttachmentsForReviewer } from "@/app/lib/attachments";
import type { Reviewer } from "@/app/types";

// A Reviewer's data lives in two stores: localStorage (details, questions, quiz
// attempts) and IndexedDB (PDF attachments). `storage.ts` stays localStorage-only
// on purpose — it's the seam a future Supabase swap goes through — so the
// cross-store cleanup is composed here instead, and callers get one function
// they can't half-remember.
export async function removeReviewerCompletely(id: string): Promise<void> {
  deleteReviewer(id);
  await deleteAttachmentsForReviewer(id);
}

// One source of truth for the delete warning: it appears on both the Home list
// and the Reviewer's Details tab, and the two had already drifted apart.
export function deleteWarning(reviewer: Reviewer): string {
  if (hasQuizHistory(reviewer.id)) {
    return `"${reviewer.reviewerName}" has quiz history — deleting it will also delete that history, its ${reviewer.questions.length} questions, and any uploaded files. This can't be undone.`;
  }
  return `This will permanently delete "${reviewer.reviewerName}", its ${reviewer.questions.length} question${
    reviewer.questions.length === 1 ? "" : "s"
  }, and any uploaded files. This can't be undone.`;
}
