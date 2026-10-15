import type { Metadata } from "next";
import BackLink from "@/app/components/BackLink";
import CopyEmail from "@/app/components/CopyEmail";

export const metadata: Metadata = { title: "Privacy Policy | May Reviewer" };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What stays on your device",
    body: (
      <p>
        Your reviewers, questions, quiz history, and settings are saved in this browser. Uploaded
        files stay on the device you uploaded them from. Clearing your browser data removes them.
      </p>
    ),
  },
  {
    title: "What is sent, and when",
    body: (
      <p>
        When you generate questions, your material for that reviewer is sent to an AI model so it
        can write them. Uploaded files are held briefly for this and then deleted. When you submit a
        quiz with short answers, those answers are sent for grading. Your material is used only to
        make your questions.
      </p>
    ),
  },
  {
    title: "Accounts",
    body: (
      <p>
        An account is optional. If you sign in with email or Google, your reviewers and history
        sync so they appear on your other devices. You can delete your account data from the
        Account page.
      </p>
    ),
  },
  {
    title: "Sharing",
    body: (
      <p>
        When you share, only the questions become public. Your notes, files, and past exams stay
        private. Your display name shows only if you turn it on. You can unshare at any time.
      </p>
    ),
  },
  {
    title: "Services we use",
    body: (
      <p>
        The app runs on Google Gemini and Mistral for AI, Supabase for accounts, Vercel for hosting
        and temporary file storage, and Cloudflare for bot protection. Like any website, these
        services see basic request data such as your IP address.
      </p>
    ),
  },
  {
    title: "What we don't do",
    body: (
      <p>No analytics, no ads, no tracking cookies. Your data is never sold.</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Privacy Policy</h1>
      <p className="mt-1 text-[0.875rem] text-text-tertiary">Last updated October 16, 2026</p>

      <p className="mt-8 max-w-[36rem] text-[1.1875rem] leading-snug text-text-primary text-pretty">
        Your study material stays on your device unless you ask the AI to read it.
      </p>

      <div className="mt-10 flex flex-col border-t border-border">
        {SECTIONS.map((s) => (
          <section
            key={s.title}
            className="grid gap-x-8 gap-y-1.5 border-b border-border py-6 sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <h2 className="text-[0.9375rem] font-semibold text-text-primary">{s.title}</h2>
            <div className="max-w-[36rem] text-[0.9375rem] text-text-secondary">{s.body}</div>
          </section>
        ))}
      </div>

      <section className="mt-10 max-w-[36rem]">
        <h2 className="text-[0.9375rem] font-semibold text-text-primary">Questions</h2>
        <p className="mt-1.5 text-[0.9375rem] text-text-secondary">
          Ask about your data, or ask us to delete it.
        </p>
        <CopyEmail className="mt-3" />
      </section>
    </div>
  );
}
