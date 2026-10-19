import type { Metadata } from "next";
import Link from "next/link";
import FeedbackForm from "@/app/components/FeedbackForm";
import BackLink from "@/app/components/BackLink";
import AboutNav from "@/app/components/AboutNav";
import { APP_VERSION } from "@/app/lib/feedback";

export const metadata: Metadata = { title: "About | May Reviewer" };

const LINK = "font-medium text-accent underline underline-offset-2";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#data", label: "Your data" },
  { href: "#limitations", label: "Limitations" },
  { href: "#feedback", label: "Feedback" },
  { href: "#credits", label: "Credits" },
];

const STEPS = [
  {
    title: "Add your material",
    body: "Name the subject and its topics. Paste notes or upload PDFs, images, DOCX, TXT, or code files. Attach a past exam if you have one.",
  },
  {
    title: "Pick a question format",
    body: "Use a built-in format or build your own with the question types your exam uses. A past exam can draft the types for you. You review every draft.",
  },
  {
    title: "Generate, check, study",
    body: "Gemini writes the questions. Edit or delete any of them, then take quizzes as often as you like. Short answers are graded by AI, and you can override any grade.",
  },
];

const DATA = [
  {
    title: "On your device",
    body: "Reviewers, questions, quiz history, and settings are stored in this browser. Uploaded files stay on the device that uploaded them.",
  },
  {
    title: "With an account",
    body: "Sign in and your reviewers, formats, and history sync across your devices. Without an account, nothing is kept on a server.",
  },
  {
    title: "When you generate",
    body: "Your material goes to the AI model once. Text is sent as text. PDFs and images go to temporary storage and are deleted when the questions come back. Mistral is the fallback if Gemini fails.",
  },
  {
    title: "When you share",
    body: "Only the questions become public. Notes, files, past exams, and history stay private. Sharing is optional and needs an account.",
  },
];

const LIMITS = [
  {
    title: "Questions can be wrong",
    body: "Quality follows your material. Thin or unfocused notes give thin questions, and the model can still make mistakes. Check questions before you study from them.",
  },
  {
    title: "One format per reviewer",
    body: "Built-in formats are Operating Systems Exam, Math, Language, Science, and History. You can build your own, but each reviewer uses one format at a time.",
  },
  {
    title: "Upload limits",
    body: (
      <>
        Accepts <span className="font-mono">.pdf</span>, <span className="font-mono">.jpg</span>,{" "}
        <span className="font-mono">.png</span>, <span className="font-mono">.webp</span>, <span className="font-mono">.heic</span>,{" "}
        <span className="font-mono">.docx</span>, <span className="font-mono">.txt</span>, and{" "}
        <span className="font-mono">.cpp</span>. Up to 10 files per field, 15 MB each, 40 MB in total.
        HEIC photos are converted to JPEG when you add them.
      </>
    ),
  },
  {
    title: "Rate limits",
    body: "8 generations and 8 past-exam format inferences every 10 minutes, and 30 file uploads every 10 minutes. This keeps the free service affordable.",
  },
  {
    title: "AI grading",
    body: "Short answers are graded against a key-point rubric. It can miss nuance, so you can override any grade on the results screen. Answers are limited to 600 characters. Long essays are not supported.",
  },
  {
    title: "Sharing is questions only",
    body: "A share is a snapshot. Later edits do not reach people who already added it, unless you update the share. Files and past exams never travel with it.",
  },
];

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border py-8">
      <h2 className="text-[1.1875rem] font-semibold tracking-tight text-text-primary">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">About</h1>
      <p className="mt-1 text-[0.9375rem] text-text-secondary">pre, May Reviewer ka ba?</p>

      <p className="mt-8 max-w-[34rem] text-[1.0625rem] leading-relaxed text-text-primary text-pretty">
        May Reviewer turns the notes and handouts you already have into practice exams in the
        format your exam actually uses. Retake them as often as you want.
      </p>
      <p className="mt-3 max-w-[34rem] text-[0.9375rem] text-text-secondary">
        It began as a way to prepare for one Operating Systems final. It now works for any
        course. It is free, and the core loop works without an account.
      </p>

      <AboutNav items={NAV} />

      <div className="mt-8 flex flex-col">
        <Section title="How it works" id="how">
          <ol className="flex flex-col">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[0.9375rem] top-9 bottom-1 w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="flex size-[1.875rem] shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[0.875rem] font-semibold text-accent"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold text-text-primary">{s.title}</h3>
                  <p className="mt-1 max-w-[34rem] text-[0.9375rem] text-text-secondary">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Where your data goes" id="data">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {DATA.map((d) => (
              <div key={d.title}>
                <dt className="text-[0.9375rem] font-semibold text-text-primary">{d.title}</dt>
                <dd className="mt-1 text-[0.9375rem] text-text-secondary">{d.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-[0.9375rem] text-text-secondary">
            Nothing is used for training or advertising, and there are no analytics. Read the{" "}
            <Link href="/privacy" className={LINK}>
              Privacy Policy
            </Link>{" "}
            for the full detail.
          </p>
        </Section>

        <Section title="Known limitations" id="limitations">
          <ul className="flex flex-col divide-y divide-border">
            {LIMITS.map((l) => (
              <li key={l.title} className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6">
                <h3 className="text-[0.9375rem] font-semibold text-text-primary">{l.title}</h3>
                <p className="text-[0.9375rem] text-text-secondary">{l.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Feedback" id="feedback">
          <p className="max-w-[34rem] text-[0.9375rem] text-text-secondary">
            Found a bug or have an idea? Write it below and it opens in your mail app, ready to
            send. You can also email the address directly.
          </p>
          <FeedbackForm />
        </Section>

        <Section title="Credits" id="credits">
          <p className="max-w-[34rem] text-[0.9375rem] text-text-secondary">
            Questions are generated by Google Gemini, with Mistral as a fallback. Temporary file
            storage uses Vercel Blob, and accounts and sync run on Supabase. The app is built with
            Next.js, React, and Tailwind CSS, with <span className="font-mono">mammoth</span> for
            reading <span className="font-mono">.docx</span> files,{" "}
            <span className="font-mono">fflate</span> for zip import and export, and{" "}
            <span className="font-mono">idb</span> for storing uploaded files in the browser.
          </p>
          <p className="mt-3 text-[0.875rem] text-text-tertiary">May Reviewer v{APP_VERSION}</p>
        </Section>

        <section id="disclaimer" className="scroll-mt-20 border-t border-border pt-8">
          <h2 className="text-[1.1875rem] font-semibold tracking-tight text-text-primary">Disclaimer</h2>
          <p className="mt-4 max-w-[34rem] rounded-lg bg-surface-alt px-4 py-3 text-[0.9375rem] text-text-secondary">
            May Reviewer is an independent personal project. No school, course, or instructor
            endorses it. Generated questions are practice material, not official exam content,
            and they may be inaccurate. Check questions and answers against your own source
            material before you study from them or share them.
          </p>
        </section>
      </div>
    </div>
  );
}
