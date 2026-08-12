import { upload } from "@vercel/blob/client";
import { getAttachments } from "@/app/lib/attachments";
import type { Question, QuestionType, Reviewer } from "@/app/types";

// The client half of a generation run: uploads the reviewer's attachments to
// Blob storage, opens the streaming /api/generate request, and reports source
// progress back as it arrives. Lives here rather than in a component so the
// Questions tab only has to own the UI state (button label, progress bar).

export type GenerationProgress = {
  completed: number;
  total: number;
  label: string;
  stage?: "verify";
};
export type GenerationFailure = { label: string; reason: string };
// One already-tested fact. The answer is the part that matters: a regeneration
// should keep covering the same topics, but land on a different fact within
// them — a second question whose answer is again "best fit" is the repeat,
// not a second question about memory allocation.
export type AvoidedQuestion = { question: string; answer: string };
export type VerificationSummary = { corrected: number; dropped: number };

type StreamMessage =
  | {
      type: "progress";
      phase: "start" | "done";
      label: string;
      completed: number;
      total: number;
      stage?: "verify";
    }
  | {
      type: "done";
      questions: Question[];
      failures: GenerationFailure[];
      verified: VerificationSummary;
    };

export async function generateQuestions(
  reviewer: Reviewer,
  count: number,
  types: QuestionType[],
  onProgress: (progress: GenerationProgress) => void,
  countByType: Record<QuestionType, number>,
  // The facts the reviewer's current pool already tests, sent so the model can
  // pick different ones. Generation replaces the pool wholesale, so without
  // this a regenerate over unchanged material has nothing distinguishing it
  // from the run that produced the pool being replaced.
  avoid: AvoidedQuestion[],
  signal?: AbortSignal,
): Promise<{ questions: Question[]; failures: GenerationFailure[]; verified: VerificationSummary }> {
  const rawAttachments = await getAttachments(reviewer.id);
  // Uploaded straight to Blob storage from the browser — Vercel Functions cap
  // request bodies at 4.5MB, far below what a PDF set can reach, so the
  // generate request carries a blob URL per file instead of its bytes.
  const attachments = await Promise.all(
    rawAttachments.map(async (a) => {
      const blob = await upload(
        `attachments/${reviewer.id}/${a.id}-${a.name}`,
        new Blob([a.data], { type: a.mimeType }),
        { access: "public", handleUploadUrl: "/api/blob-upload" },
      );
      return { name: a.name, mimeType: a.mimeType, url: blob.url, field: a.field };
    }),
  );

  // Aborting also errors the response body stream, so the read loop below
  // unwinds on cancel rather than sitting on a half-read NDJSON stream.
  const res = await fetch("/api/generate", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: reviewer.subject,
      topics: reviewer.topics,
      notes: reviewer.notes,
      projectMaterial: reviewer.projectMaterial,
      count,
      types,
      countByType,
      avoid,
      attachments,
    }),
  });

  if (!res.ok) {
    const data: { error?: string } = await res.json();
    throw new Error(data.error || "Generation failed.");
  }
  if (!res.body) throw new Error("No response from server.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { questions: Question[]; failures: GenerationFailure[]; verified: VerificationSummary } | null =
    null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const message: StreamMessage = JSON.parse(line);
      if (message.type === "progress") {
        onProgress({
          completed: message.completed,
          total: message.total,
          label: message.label,
          stage: message.stage,
        });
      } else if (message.type === "done") {
        result = { questions: message.questions, failures: message.failures, verified: message.verified };
      }
    }
  }

  if (!result) throw new Error("Connection closed before generation finished.");
  return result;
}
