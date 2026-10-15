import { getSupabaseClient } from "@/app/lib/supabase";
import { isQuestion, MAX_QUESTION_COUNT } from "@/app/lib/questions";
import { MAX_IMPORT_TEXT_CHARS } from "@/app/lib/reviewerFile";
import { isValidFormatDef, sanitizeFormatDef, MAX_ID_CHARS } from "@/app/lib/examFormats";
import type { ExamFormat } from "@/app/lib/examFormats";
import type { Question, Reviewer } from "@/app/types";

// Sharing sends a QUESTIONS-ONLY snapshot. Notes, project material, past exam
// text, files, and a format's pastExam never enter a share, and a recipient
// never trusts the JSON it gets back (validateShared* below).

export type ShareKind = "reviewer" | "format";

export type ShareRow = {
  code: string;
  kind: ShareKind;
  title: string;
  subject: string;
  questionCount: number;
  data: unknown;
  listed: boolean;
  updatedAt: string;
  ownerId: string;
  authorName: string | null;
  authorTag: string | null;
  // Only set on the owner's own rows (direct table reads carry `show_name`).
  showName?: boolean;
  // Owner reads only. get_share and list_gallery do not return it.
  addCount?: number;
  createdAt?: string;
};

// Gallery cards carry no questions.
export type GalleryRow = Omit<ShareRow, "data">;

export type ShareResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// 30 chars: no 0, O, 1, I, L, U. Matches the SQL check on shares.code.
export const SHARE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHARE_CODE_LENGTH = 6;
const CODE_RE = /^[A-HJKMNP-TV-Z2-9]{6}$/;
const OFFLINE = "Sharing needs the online version.";
const MAX_SHARED_QUESTIONS = 1000;
const MAX_SHARED_TOPICS = 100;
const MAX_SHARED_TEXT = 500;

export function newShareCode(): string {
  const n = SHARE_CODE_ALPHABET.length; // 30
  // Rejection sampling: 256 % 30 = 16, so bytes >= 240 would bias the pick.
  const limit = 256 - (256 % n);
  let out = "";
  while (out.length < SHARE_CODE_LENGTH) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue;
      out += SHARE_CODE_ALPHABET[b % n];
      if (out.length === SHARE_CODE_LENGTH) break;
    }
  }
  return out;
}

// Accepts a bare code, a code with spaces/dashes, or a pasted link ending in
// "/s/<code>". Returns null when nothing valid is left.
export function normalizeShareCode(input: string): string | null {
  let s = input.trim();
  const pathAt = s.toLowerCase().lastIndexOf("/s/");
  if (pathAt !== -1) s = s.slice(pathAt + 3);
  s = s.split(/[?#]/)[0].replace(/[\s-]+/g, "").toUpperCase();
  return CODE_RE.test(s) ? s : null;
}

function withoutPastExam(format: ExamFormat): ExamFormat {
  const { pastExam: _pastExam, ...rest } = format;
  void _pastExam;
  return rest;
}

function withoutFavorite(question: Question): Question {
  const { favorite: _favorite, ...rest } = question;
  void _favorite;
  return rest;
}

export type ReviewerSnapshot = {
  reviewerName: string;
  subject: string;
  topics: string[];
  examFormatId: string;
  questionCount: number;
  questionCountByType: Record<string, number>;
  questions: Question[];
  format?: ExamFormat;
};

export function buildReviewerSnapshot(reviewer: Reviewer, customFormat?: ExamFormat): ReviewerSnapshot {
  return {
    reviewerName: reviewer.reviewerName,
    subject: reviewer.subject,
    topics: [...reviewer.topics],
    examFormatId: reviewer.examFormatId,
    questionCount: reviewer.questionCount,
    questionCountByType: { ...reviewer.questionCountByType },
    questions: reviewer.questions.map(withoutFavorite),
    ...(customFormat ? { format: withoutPastExam(customFormat) } : {}),
  };
}

export function buildFormatSnapshot(format: ExamFormat): ExamFormat {
  return withoutPastExam(format);
}

// --- Untrusted-input validation (recipient side) ---

function cleanFormat(value: unknown): ExamFormat | null {
  if (!isValidFormatDef(value)) return null;
  const clean = sanitizeFormatDef(value);
  return clean ? withoutPastExam(clean) : null;
}

export function validateSharedFormat(data: unknown): ExamFormat | null {
  return cleanFormat(data);
}

export function validateSharedReviewer(data: unknown): ReviewerSnapshot | null {
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  const questions = o.questions;
  if (
    !Array.isArray(questions) ||
    questions.length === 0 ||
    questions.length > MAX_SHARED_QUESTIONS ||
    !questions.every(isQuestion)
  ) {
    return null;
  }
  if (typeof o.reviewerName !== "string" || o.reviewerName.trim().length === 0) return null;
  if (o.reviewerName.length > MAX_IMPORT_TEXT_CHARS) return null;

  const topics = Array.isArray(o.topics)
    ? o.topics
        .filter((t): t is string => typeof t === "string")
        .slice(0, MAX_SHARED_TOPICS)
        .map((t) => t.slice(0, MAX_SHARED_TEXT))
    : [];

  const byTypeRaw = o.questionCountByType;
  const byTypeEntries =
    typeof byTypeRaw === "object" && byTypeRaw !== null && !Array.isArray(byTypeRaw)
      ? Object.entries(byTypeRaw as Record<string, unknown>)
      : [];
  const byTypeOk =
    byTypeEntries.length > 0 &&
    byTypeEntries.length <= 50 &&
    byTypeEntries.every(
      ([k, n]) =>
        k.length > 0 &&
        k.length <= MAX_ID_CHARS &&
        Number.isInteger(n) &&
        (n as number) >= 0 &&
        (n as number) <= MAX_QUESTION_COUNT,
    );
  const questionCountByType = byTypeOk
    ? (Object.fromEntries(byTypeEntries) as Record<string, number>)
    : {};

  const format = o.format === undefined ? undefined : (cleanFormat(o.format) ?? undefined);
  const count = o.questionCount;
  return {
    reviewerName: o.reviewerName.slice(0, MAX_SHARED_TEXT),
    subject: typeof o.subject === "string" ? o.subject.slice(0, MAX_SHARED_TEXT) : "",
    topics,
    examFormatId: typeof o.examFormatId === "string" ? o.examFormatId.slice(0, MAX_ID_CHARS) : "",
    questionCount:
      typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= MAX_QUESTION_COUNT
        ? count
        : Math.min(questions.length, MAX_QUESTION_COUNT),
    questionCountByType,
    questions: (questions as Question[]).map(withoutFavorite),
    ...(format ? { format } : {}),
  };
}

// --- Supabase ---

type DbRow = Record<string, unknown>;

function toShareRow(r: DbRow): ShareRow {
  return {
    code: r.code as string,
    kind: r.kind as ShareKind,
    title: r.title as string,
    subject: (r.subject as string) ?? "",
    questionCount: (r.question_count as number) ?? 0,
    data: r.data,
    listed: Boolean(r.listed),
    updatedAt: r.updated_at as string,
    ownerId: r.owner_id as string,
    authorName: (r.author_name as string | null) ?? null,
    authorTag: (r.author_tag as string | null) ?? null,
    ...(typeof r.show_name === "boolean" ? { showName: r.show_name } : {}),
    ...(typeof r.add_count === "number" ? { addCount: r.add_count } : {}),
    ...(typeof r.created_at === "string" ? { createdAt: r.created_at } : {}),
  };
}

function toGalleryRow(r: DbRow): GalleryRow {
  const { data: _data, ...rest } = toShareRow(r);
  void _data;
  return rest;
}

function message(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export type UpsertShareInput = {
  kind: ShareKind;
  sourceId: string;
  title: string;
  subject: string;
  questionCount: number;
  data: unknown;
  listed: boolean;
  showName: boolean;
};

export async function getMyShare(
  kind: ShareKind,
  sourceId: string,
): Promise<ShareResult<{ share: ShareRow | null }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { data: session } = await client.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { ok: false, error: "Sign in to share." };
    const { data, error } = await client
      .from("shares")
      .select("*")
      .eq("owner_id", userId)
      .eq("kind", kind)
      .eq("source_id", sourceId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, share: data ? toShareRow(data as DbRow) : null };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't load the share.") };
  }
}

export async function upsertShare(input: UpsertShareInput): Promise<ShareResult<{ share: ShareRow }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { data: session } = await client.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { ok: false, error: "Sign in to share." };
    const fields = {
      title: input.title,
      subject: input.subject,
      question_count: input.questionCount,
      data: input.data,
      listed: input.listed,
      show_name: input.showName,
      updated_at: new Date().toISOString(),
    };
    let lastError = "Couldn't create a share code.";
    for (let attempt = 0; attempt < 5; attempt++) {
      // Re-checked each pass: a racing insert may have created the row.
      const existing = await getMyShare(input.kind, input.sourceId);
      if (!existing.ok) return existing;
      if (existing.share) {
        const { data, error } = await client
          .from("shares")
          .update(fields)
          .eq("code", existing.share.code)
          .select("*")
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, share: toShareRow(data as DbRow) };
      }
      const { data, error } = await client
        .from("shares")
        .insert({
          ...fields,
          code: newShareCode(),
          owner_id: userId,
          kind: input.kind,
          source_id: input.sourceId,
        })
        .select("*")
        .single();
      if (!error) return { ok: true, share: toShareRow(data as DbRow) };
      if (error.code !== "23505") return { ok: false, error: error.message };
      lastError = error.message;
    }
    return { ok: false, error: lastError };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't save the share.") };
  }
}

export async function unshare(code: string): Promise<ShareResult<object>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { error } = await client.from("shares").delete().eq("code", code);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't stop sharing.") };
  }
}

// Own shares only (RLS). No `data` column: lists don't need the questions.
export async function listMyShares(): Promise<ShareResult<{ shares: GalleryRow[] }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { data, error } = await client
      .from("shares")
      .select("code, kind, title, subject, question_count, listed, updated_at, owner_id, add_count")
      .order("updated_at", { ascending: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, shares: ((data ?? []) as DbRow[]).map(toGalleryRow) };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't load your shares.") };
  }
}

// `share: null` means no such code.
export async function getShare(code: string): Promise<ShareResult<{ share: ShareRow | null }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  const normalized = normalizeShareCode(code);
  if (!normalized) return { ok: true, share: null };
  try {
    const { data, error } = await client.rpc("get_share", { p_code: normalized });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? (data[0] as DbRow | undefined) : undefined;
    return { ok: true, share: row ? toShareRow(row) : null };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't open that share.") };
  }
}

export async function listGallery(opts: {
  query?: string;
  kind?: ShareKind;
  limit?: number;
  offset?: number;
}): Promise<ShareResult<{ rows: GalleryRow[] }>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { data, error } = await client.rpc("list_gallery", {
      p_query: opts.query?.trim() || null,
      p_kind: opts.kind ?? null,
      p_limit: opts.limit ?? 24,
      p_offset: opts.offset ?? 0,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, rows: ((data ?? []) as DbRow[]).map(toGalleryRow) };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't load the gallery.") };
  }
}

// Fire-and-forget add counter. Works signed out. Never throws.
export async function recordShareAdd(code: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    await client.rpc("record_share_add", { p_code: code });
  } catch {
    // The count is a nicety. Ignore failures.
  }
}

// "Added 3 times" wording shared by Account and the reviewer header.
export function addCountLabel(n: number): string {
  if (n === 0) return "Not added yet";
  return n === 1 ? "Added 1 time" : `Added ${n} times`;
}

export async function reportShare(code: string, reason: string): Promise<ShareResult<object>> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  const normalized = normalizeShareCode(code);
  if (!normalized) return { ok: false, error: "That share code isn't valid." };
  try {
    const { data: session } = await client.auth.getSession();
    const { error } = await client.from("share_reports").insert({
      code: normalized,
      reason: reason.slice(0, 500),
      reporter_id: session.session?.user.id ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Couldn't send the report.") };
  }
}
