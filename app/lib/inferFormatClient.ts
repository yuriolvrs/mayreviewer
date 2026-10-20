import { upload } from "@vercel/blob/client";
import type { InferredType, UnsupportedNote } from "@/app/lib/examFormats";
import { fetchWithTurnstile } from "@/app/lib/turnstileClient";

export type InferFile = { id: string; name: string; mimeType: string; data: ArrayBuffer };

// Runs one format inference over course material (a past exam, notes, slides).
// Files relay through Blob storage past the Function's body limit — the same
// relay generation uses for reviewer attachments. Throws with a user-facing
// message on failure.
export async function inferFormat({
  files,
  text,
  subject,
  uploadPrefix,
}: {
  files: InferFile[];
  text: string;
  subject?: string;
  uploadPrefix: string;
}): Promise<{ types: InferredType[]; unsupported: UnsupportedNote[] }> {
  const attachments = await Promise.all(
    files.map(async (a) => {
      const blob = await upload(`${uploadPrefix}/${a.id}-${a.name}`, new Blob([a.data], { type: a.mimeType }), {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });
      return { name: a.name, mimeType: a.mimeType, url: blob.url, field: "pastexam" };
    }),
  );
  const res = await fetchWithTurnstile("/api/infer-format", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachments, text, subject: subject || undefined }),
  });
  const data = (await res.json()) as {
    types?: InferredType[];
    unsupported?: UnsupportedNote[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Inference failed.");
  return { types: data.types ?? [], unsupported: data.unsupported ?? [] };
}
