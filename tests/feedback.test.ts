import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  buildFeedbackMailto,
  feedbackTypeLabel,
  isFeedbackMessageValid,
} from "@/app/lib/feedback";

describe("feedbackTypeLabel", () => {
  it("labels every known type", () => {
    expect(feedbackTypeLabel("bug")).toBe("Bug report");
    expect(feedbackTypeLabel("idea")).toBe("Feature idea");
    expect(feedbackTypeLabel("question")).toBe("Question");
    expect(feedbackTypeLabel("other")).toBe("Other");
  });
});

describe("isFeedbackMessageValid", () => {
  it("rejects blank and trivially short messages", () => {
    expect(isFeedbackMessageValid("")).toBe(false);
    expect(isFeedbackMessageValid("   ")).toBe(false);
    expect(isFeedbackMessageValid("too short")).toBe(false);
  });

  it("accepts a real message", () => {
    expect(isFeedbackMessageValid("The shuffle toggle does nothing.")).toBe(true);
  });
});

describe("buildFeedbackMailto", () => {
  it("builds a mailto link with encoded subject and versioned body", () => {
    const link = buildFeedbackMailto("bug", "Quiz froze on submit.");
    expect(link.startsWith("mailto:")).toBe(true);
    expect(link).toContain(encodeURIComponent("[May Reviewer] Bug report"));
    expect(link).toContain(encodeURIComponent("Quiz froze on submit."));
    expect(link).toContain(encodeURIComponent(`v${APP_VERSION}`));
  });

  it("trims the message and encodes special characters", () => {
    const link = buildFeedbackMailto("idea", "  spaced &/=? text  ");
    expect(link).toContain(encodeURIComponent("spaced &/=? text"));
    expect(link).not.toContain(encodeURIComponent("  spaced"));
  });
});
