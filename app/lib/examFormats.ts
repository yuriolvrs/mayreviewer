import { MAX_QUESTION_COUNT, QUESTION_TYPES, TYPE_LABELS } from "@/app/lib/questions";
import { MAX_FILENAME_CHARS } from "@/app/lib/attachmentLimits";
import { clampToLine, stripSpoofingControls } from "@/app/lib/promptSafety";
import { newId } from "@/app/lib/ids";
import type { QuestionType } from "@/app/types";

// An exam format is a named set of question types: the thing that makes one
// subject's exam a different shape from another's. Built-ins ship below;
// customs live in the localStorage store, and every key is an opaque string —
// behavior comes from the format/shape/stimulus fields, never from matching
// the key.

// Choice-based answering only in v1. Free-text/numeric answers would break
// option shuffling, the verify pass, and scoring, so they stay out until a
// chapter takes those three on deliberately.
export type AnswerFormat = "mc" | "true-false" | "modified-tf";
export type TypeShape = "standalone" | "set";
// Where the type's content lives when rendered: none means the question text
// carries everything (Identification, MTF); anything else shares one
// preformatted block across the set's questions.
export type StimulusKind = "none" | "prose" | "table" | "code" | "formula";

export type FormatTypeDef = {
  // Opaque within the format: a built-in literal or a custom slug. Nothing
  // outside this module assigns meaning to the value — behavior comes from
  // the format/shape/stimulus fields below.
  key: string;
  label: string;
  format: AnswerFormat;
  shape: TypeShape;
  stimulus: StimulusKind;
  // Plain-language guidance compiled into the generation prompt ("ask for
  // causes, not dates"). Built-ins leave this empty; the builder fills it.
  guidance?: string;
  // Past-exam questions in this format, pasted by hand (builder) or proposed
  // by inference (Chapter 4). Format reference for generation, never facts.
  examples?: string[];
  // Default questions per generation for this type. New reviewers start from
  // splitCountEvenly, which agrees with these numbers; the field exists so a
  // future preset can weight its mix differently.
  defaultCount: number;
};

export type ExamFormat = {
  id: string;
  name: string;
  description: string;
  types: FormatTypeDef[];
  // A sample past exam kept on the format: teaches question format (and, by
  // decision, supplies facts) to every reviewer on it. Text lives here;
  // PDFs/images live in the format-attachments store, same local-only rule
  // as reviewer attachments.
  pastExam?: PastExam;
};

// Cap keeps one format's record small against localStorage's ~5MB quota.
export const MAX_PAST_EXAM_CHARS = 30_000;

export type PastExam = {
  fileName: string;
  text: string;
  addedAt: string;
};

// Wire shapes for /api/infer-format, shared so route and client agree. The
// enums repeat the supported sets on purpose: inference may only propose
// renderers the app can actually render and verify.
export type InferredType = {
  label: string;
  answerFormat: AnswerFormat;
  shape: TypeShape;
  stimulusKind: StimulusKind;
  guidance: string;
  example: string;
  suggestedCount: number;
};

export type UnsupportedNote = {
  label: string;
  reason: string;
};

export const CSOPESY_FINAL_ID = "csopesy-final";

// Today's five hardcoded types, frozen as data: generation, counts, filters,
// and quiz scope behave exactly as before for reviewers on this format.
export const CSOPESY_FINAL: ExamFormat = {
  id: CSOPESY_FINAL_ID,
  name: "CSOPESY Final",
  description:
    "Identification, Scenario, Timeline and Code sets, plus Modified True/False — the Intro to Operating Systems final format.",
  types: [
    { key: "identification", label: "Identification", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 4 },
    { key: "scenario", label: "Scenario", format: "mc", shape: "standalone", stimulus: "none", defaultCount: 4 },
    { key: "timeline", label: "Timeline", format: "mc", shape: "set", stimulus: "table", defaultCount: 4 },
    { key: "code", label: "Code", format: "mc", shape: "set", stimulus: "code", defaultCount: 4 },
    { key: "modified-tf", label: "Modified True/False", format: "modified-tf", shape: "standalone", stimulus: "none", defaultCount: 4 },
  ],
};

// Day-one presets (Chapter 3): starting templates for other subjects. Each
// type behaves like its shape/stimulus says — the generation prompt is
// compiled from the label, guidance, and examples below, never from the key,
// so these need no code beyond this data.
export const MATH_101: ExamFormat = {
  id: "math-101",
  name: "Math 101",
  description:
    "Concept recall, formula choice, and solve-and-pick questions over worked stems.",
  types: [
    {
      key: "math-concept",
      label: "Concept recall",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Ask what a definition or theorem states. Wrong options are neighboring definitions, not nonsense.",
      defaultCount: 5,
    },
    {
      key: "math-formula",
      label: "Which formula applies",
      format: "mc",
      shape: "standalone",
      stimulus: "formula",
      guidance: "Name a situation and ask which formula applies and why. Wrong options are other real formulas from the material.",
      defaultCount: 5,
    },
    {
      key: "math-solve",
      label: "Solve and pick the value",
      format: "mc",
      shape: "standalone",
      stimulus: "formula",
      guidance: "Give values and ask for the computed result. Wrong options are the classic arithmetic slips (sign errors, off-by-one).",
      defaultCount: 5,
    },
    {
      key: "math-worked-set",
      label: "Worked-problem set",
      format: "mc",
      shape: "set",
      stimulus: "formula",
      guidance: "One worked problem traced once, then questions about its steps and result.",
      defaultCount: 5,
    },
  ],
};

export const LANGUAGE: ExamFormat = {
  id: "language",
  name: "Language",
  description: "Vocabulary, usage in context, and sentence-blank sets over short passages.",
  types: [
    {
      key: "lang-vocab",
      label: "Vocabulary",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Ask what a word or grammatical term means. Wrong options are related words, not random ones.",
      defaultCount: 7,
    },
    {
      key: "lang-usage",
      label: "Usage in context",
      format: "mc",
      shape: "standalone",
      stimulus: "prose",
      guidance: "Give a sentence or short passage and ask what a word or construction does in it.",
      defaultCount: 7,
    },
    {
      key: "lang-blank-set",
      label: "Sentence-blank set",
      format: "mc",
      shape: "set",
      stimulus: "prose",
      guidance: "One passage with numbered blanks, one question per blank asking what belongs there.",
      defaultCount: 6,
    },
  ],
};

export const SCIENCE: ExamFormat = {
  id: "science",
  name: "Science",
  description: "Definitions, scenarios, and experiment-trace sets over data tables.",
  types: [
    {
      key: "sci-definition",
      label: "Definition",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Ask what a term, law, or process states. Wrong options are neighboring concepts.",
      defaultCount: 6,
    },
    {
      key: "sci-scenario",
      label: "Scenario",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Describe an observation or setup and ask which concept it shows.",
      defaultCount: 6,
    },
    {
      key: "sci-experiment-set",
      label: "Experiment trace set",
      format: "mc",
      shape: "set",
      stimulus: "table",
      guidance: "One experiment's data table traced once, then questions reading trends, extremes, and what-happens-next from it.",
      defaultCount: 8,
    },
  ],
};

export const HISTORY: ExamFormat = {
  id: "history",
  name: "History",
  description: "Fact recall, cause and effect, and true/false questions.",
  types: [
    {
      key: "hist-fact",
      label: "Fact recall",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Ask who, when, or where — anchored to the material's own events and dates.",
      defaultCount: 8,
    },
    {
      key: "hist-cause",
      label: "Cause and effect",
      format: "mc",
      shape: "standalone",
      stimulus: "none",
      guidance: "Ask what caused an event or what followed from it. Wrong options are real but unrelated events.",
      defaultCount: 7,
    },
    {
      key: "hist-tf",
      label: "True / False",
      format: "true-false",
      shape: "standalone",
      stimulus: "none",
      guidance: "One crisp claim about the material per item — no double statements joined by 'and'.",
      defaultCount: 5,
    },
  ],
};

export function getBuiltinFormats(): ExamFormat[] {
  return [CSOPESY_FINAL, MATH_101, LANGUAGE, SCIENCE, HISTORY];
}

const CUSTOM_FORMATS_KEY = "mayreviewer-formats";

// Custom formats live in localStorage beside reviewers (same seam, same
// future Supabase swap). Built-ins are never stored — they ship with the app
// and always win name collisions on read.
export function getCustomFormats(): ExamFormat[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_FORMATS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidFormatDef) : [];
  } catch {
    return [];
  }
}

export function saveCustomFormat(format: ExamFormat): void {
  const rest = getCustomFormats().filter((f) => f.id !== format.id);
  window.localStorage.setItem(CUSTOM_FORMATS_KEY, JSON.stringify([...rest, format]));
}

export function deleteCustomFormat(id: string): void {
  window.localStorage.setItem(
    CUSTOM_FORMATS_KEY,
    JSON.stringify(getCustomFormats().filter((f) => f.id !== id)),
  );
}

export function getAllFormats(): ExamFormat[] {
  return mergeFormats(getBuiltinFormats(), getCustomFormats());
}

// Pure merge: built-ins first, customs after, built-in ids winning outright.
// Split out so render paths can merge a mount-loaded custom list instead of
// reading localStorage during render — which would SSR without customs and
// hydrate with them, a guaranteed hydration mismatch.
export function mergeFormats(builtins: ExamFormat[], customs: ExamFormat[]): ExamFormat[] {
  const builtinIds = new Set(builtins.map((f) => f.id));
  return [...builtins, ...customs.filter((f) => !builtinIds.has(f.id))];
}

// Unknown ids fall back to the built-in rather than breaking the page: a
// custom format deleted out from under its reviewers must degrade to
// something renderable, not "Reviewer not found".
export function resolveFormat(id: string | undefined): ExamFormat {
  return getAllFormats().find((f) => f.id === id) ?? CSOPESY_FINAL;
}

// Same lookup against an already-loaded list. Render paths use this with
// useFormats() (app/lib/useFormats.ts) — never resolveFormat/getAllFormats
// during render: those read localStorage, which is empty server-side, so the
// server would render built-ins-only while the client hydrates with customs
// (a guaranteed hydration mismatch wherever customs exist).
export function resolveFromList(formats: ExamFormat[], id: string | undefined): ExamFormat {
  return formats.find((f) => f.id === id) ?? CSOPESY_FINAL;
}

// The format's type keys in the format's own order — the list every count
// control, filter row, and scope chip iterates instead of QUESTION_TYPES.
export function formatTypeKeys(format: ExamFormat): string[] {
  return format.types.map((t) => t.key);
}

// Split for the generation schema and prompt: standalone questions go in the
// "questions" array, set types in "sets". Mirrors SET_TYPES in
// generationPlan.ts, which keeps owning placement order; the route passes
// this split as the planner's setTypes.
export function standaloneKeys(format: ExamFormat): string[] {
  return format.types.filter((t) => t.shape === "standalone").map((t) => t.key);
}

export function setKeys(format: ExamFormat): string[] {
  return format.types.filter((t) => t.shape === "set").map((t) => t.key);
}

export function typeDefOf(format: ExamFormat, key: string): FormatTypeDef | undefined {
  return format.types.find((t) => t.key === key);
}

// Which stimulus layout a question renders with. Unknown keys fall back to
// the legacy built-in rule (timeline/code were preformatted before formats
// existed); anything else is prose.
export function stimulusKindOf(format: ExamFormat, key: string): StimulusKind {
  const def = typeDefOf(format, key);
  if (def) return def.stimulus;
  if (key === "timeline") return "table";
  if (key === "code") return "code";
  return "none";
}

// Table, code, and formula stimuli render as a monospace block; prose rides
// as a quote (or inline, when there is no stimulus at all).
export function isMonoKind(kind: StimulusKind): boolean {
  return kind === "table" || kind === "code" || kind === "formula";
}

// The label a screen shows for a type: the format's own wording first, then
// the built-in map, then the raw key rather than nothing.
export function typeLabelOf(format: ExamFormat, key: string): string {
  return typeDefOf(format, key)?.label ?? TYPE_LABELS[key as QuestionType] ?? key;
}

// Structural check for the built-ins: every global type appears in exactly
// one format entry, so no screen can encounter a question its format can't
// name. Custom formats (Chapter 3) are free to subset.
export function coversAllTypes(format: ExamFormat): boolean {
  const keys = formatTypeKeys(format);
  return QUESTION_TYPES.every((t) => keys.includes(t)) && new Set(keys).size === keys.length;
}

// Bounds shared by the builder, the file importer, and the generate route's
// format-def sanitizer — one definition so all three accept the same shapes.
export const MAX_FORMAT_TYPES = 8;
export const MAX_ID_CHARS = 80;
export const MAX_LABEL_CHARS = 80;
export const MAX_DESCRIPTION_CHARS = 500;
export const MAX_GUIDANCE_CHARS = 500;
export const MAX_EXAMPLES = 3;
export const MAX_EXAMPLE_CHARS = 800;

const ANSWER_FORMATS: AnswerFormat[] = ["mc", "true-false", "modified-tf"];
const TYPE_SHAPES: TypeShape[] = ["standalone", "set"];
const STIMULUS_KINDS: StimulusKind[] = ["none", "prose", "table", "code", "formula"];

function isValidTypeDef(value: unknown): value is FormatTypeDef {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.key === "string" &&
    // Slugs only: keys are interpolated into prompt headings and schema
    // enums, so anything outside this set is rejected rather than escaped.
    /^[A-Za-z0-9_-]{1,40}$/.test(t.key) &&
    typeof t.label === "string" &&
    t.label.trim().length > 0 &&
    t.label.length <= MAX_LABEL_CHARS &&
    typeof t.format === "string" &&
    ANSWER_FORMATS.includes(t.format as AnswerFormat) &&
    typeof t.shape === "string" &&
    TYPE_SHAPES.includes(t.shape as TypeShape) &&
    typeof t.stimulus === "string" &&
    STIMULUS_KINDS.includes(t.stimulus as StimulusKind) &&
    (t.guidance === undefined || (typeof t.guidance === "string" && t.guidance.length <= MAX_GUIDANCE_CHARS)) &&
    (t.examples === undefined ||
      (Array.isArray(t.examples) &&
        t.examples.length <= MAX_EXAMPLES &&
        t.examples.every((e) => typeof e === "string" && e.length <= MAX_EXAMPLE_CHARS))) &&
    typeof t.defaultCount === "number" &&
    Number.isInteger(t.defaultCount) &&
    t.defaultCount >= 0 &&
    t.defaultCount <= MAX_QUESTION_COUNT
  );
}

// Structural validation for anything claiming to be a format: the custom
// store read, file imports, and the builder all funnel through here, so a
// malformed shape is dropped in one place instead of defended against
// per screen.
// A kept past exam is small by construction (text only, capped) — files live
// in the format-attachments store, never in this record.
function isValidPastExam(value: unknown): value is PastExam {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.fileName === "string" &&
    p.fileName.length > 0 &&
    p.fileName.length <= MAX_FILENAME_CHARS &&
    typeof p.text === "string" &&
    p.text.length <= MAX_PAST_EXAM_CHARS &&
    typeof p.addedAt === "string"
  );
}

export function isValidFormatDef(value: unknown): value is ExamFormat {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.id === "string" &&
    f.id.length > 0 &&
    f.id.length <= MAX_ID_CHARS &&
    typeof f.name === "string" &&
    f.name.trim().length > 0 &&
    f.name.length <= MAX_ID_CHARS &&
    (f.description === undefined ||
      (typeof f.description === "string" && f.description.length <= MAX_DESCRIPTION_CHARS)) &&
    (f.pastExam === undefined || isValidPastExam(f.pastExam)) &&
    Array.isArray(f.types) &&
    f.types.length > 0 &&
    f.types.length <= MAX_FORMAT_TYPES &&
    f.types.every(isValidTypeDef) &&
    new Set(f.types.map((t) => (t as FormatTypeDef).key)).size === f.types.length
  );
}

// A format's own default mix. Used when a reviewer first picks the format —
// counts typed for another format's types are meaningless after a switch, so
// both pickers re-seed from here instead of carrying stale keys over.
export function defaultCounts(format: ExamFormat): Record<string, number> {
  return Object.fromEntries(format.types.map((t) => [t.key, t.defaultCount]));
}

// Accepts a format-shaped payload from outside the trust boundary (the
// generate request carries the reviewer's format because the server cannot
// read browser localStorage, where custom formats live; shared files arrive
// the same way). Validation bounds the shape; the copies below normalize the
// optionals so prompt code never defends against undefined. Heading slots
// (id, name, labels, filenames) are flattened to single lines — they sit in
// the instruction preamble. Guidance and examples keep their newlines but
// lose spoofing controls, so a reviewing human and the model read the same
// text. Returns undefined for anything malformed, and the caller falls back
// to the built-in.
export function sanitizeFormatDef(value: unknown): ExamFormat | undefined {
  if (!isValidFormatDef(value)) return undefined;
  return {
    id: clampToLine(value.id, MAX_ID_CHARS),
    name: clampToLine(value.name, MAX_ID_CHARS),
    description: stripSpoofingControls(value.description ?? ""),
    pastExam: value.pastExam
      ? {
          fileName: clampToLine(value.pastExam.fileName, MAX_FILENAME_CHARS),
          text: stripSpoofingControls(value.pastExam.text),
          addedAt: value.pastExam.addedAt,
        }
      : undefined,
    types: value.types.map((t) => ({
      key: t.key,
      label: clampToLine(t.label, MAX_LABEL_CHARS),
      format: t.format,
      shape: t.shape,
      stimulus: t.stimulus,
      guidance: stripSpoofingControls(t.guidance ?? ""),
      examples: (t.examples ?? []).slice(0, MAX_EXAMPLES).map(stripSpoofingControls),
      defaultCount: t.defaultCount,
    })),
  };
}
// Joins past-exam text parts for the format record. Exported for tests: the
// truncation marker itself must fit inside the cap, or a truncated exam saves
// a record that fails validation and silently vanishes on next read.
export function composePastExamText(parts: string[]): string {
  const composed = parts.filter((part) => part.trim().length > 0).join("\n\n");
  const MARKER = "\n[...truncated to fit]";
  return composed.length > MAX_PAST_EXAM_CHARS
    ? composed.slice(0, MAX_PAST_EXAM_CHARS - MARKER.length) + MARKER
    : composed;
}

// Opaque custom keys: slug of the label plus a short random tail, so two
// "Vocabulary" types in different formats never collide and renames never
// orphan a reviewer's counts. Tail comes from crypto, not Math.random —
// rapid adds must not collide.
export function newTypeKey(label: string): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "type";
  return `${slug}-${newId().replace(/-/g, "").slice(0, 6)}`;
}

export function newFormatId(): string {
  return `custom-${newId().replace(/-/g, "").slice(0, 8)}`;
}

// Cloning preserves type keys: a clone is the same shape under a new id, so
// a reviewer's existing questions and counts keep matching while its labels
// and guidance get edited. Only brand-new types added in the builder get
// fresh keys. The name is clamped: cloning an already-max-length name must
// not produce a record that fails validation and vanishes on next read.
export function cloneFormat(source: ExamFormat): ExamFormat {
  const name = `${source.name} (copy)`;
  return {
    ...source,
    id: newFormatId(),
    name: name.length > MAX_ID_CHARS ? name.slice(0, MAX_ID_CHARS).trimEnd() : name,
    pastExam: source.pastExam ? { ...source.pastExam } : undefined,
    // Examples get their own array: a shared reference would let editing the
    // copy's examples rewrite the original's.
    types: source.types.map((t) => ({ ...t, examples: [...(t.examples ?? [])] })),
  };
}
