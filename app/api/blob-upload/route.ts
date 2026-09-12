import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { createRateLimiter, clientKey } from "@/app/lib/rateLimit";
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES } from "@/app/lib/attachmentLimits";

export const runtime = "nodejs";

// This route only mints upload tokens (cheap), but each token is a licence to
// write into the Blob store, so it gets the same abuse friction as generate —
// a loop against this endpoint would otherwise run up Blob storage quota for
// free, no Gemini call required.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const checkRateLimit = createRateLimiter(RATE_LIMIT, RATE_LIMIT_WINDOW_MS);

export async function POST(request: Request) {
  const limit = checkRateLimit(clientKey(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many uploads. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_ATTACHMENT_MIME_TYPES,
        maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
        addRandomSuffix: true,
      }),
      // No onUploadCompleted persistence needed — the client gets the blob
      // URL back directly from `upload()` and passes it to /api/generate
      // itself; nothing server-side needs to track it.
      onUploadCompleted: async () => {},
    });
    return Response.json(jsonResponse);
  } catch (err) {
    // handleUpload throws for bad payloads (400s) and for server misconfig
    // like a missing BLOB_READ_WRITE_TOKEN (500s) — don't mask the latter.
    const message = err instanceof Error ? err.message : "Upload failed.";
    const status = /token|environment|configuration|internal/i.test(message) ? 500 : 400;
    return Response.json({ error: message }, { status });
  }
}
