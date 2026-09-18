// Placeholder until a real support address exists. Single source of truth —
// every user-facing mention (feedback form, privacy, terms) references this,
// so swapping in the real address is one line.
export const SUPPORT_EMAIL = "support@example.com";
export const APP_VERSION = "0.1.0";

export type FeedbackType = "bug" | "idea" | "question" | "other";

export const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: "bug", label: "Bug report" },
  { value: "idea", label: "Feature idea" },
  { value: "question", label: "Question" },
  { value: "other", label: "Other" },
];

export function feedbackTypeLabel(type: FeedbackType): string {
  return FEEDBACK_TYPES.find((t) => t.value === type)?.label ?? "Feedback";
}

// Builds the mailto: link the form hands to the mail app. Nothing is sent
// automatically — the user reviews and sends from their own email.
export function buildFeedbackMailto(type: FeedbackType, message: string): string {
  const subject = `[May Reviewer] ${feedbackTypeLabel(type)}`;
  const body = `${message.trim()}\n\n—\nSent from May Reviewer v${APP_VERSION}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function isFeedbackMessageValid(message: string): boolean {
  return message.trim().length >= 10;
}
