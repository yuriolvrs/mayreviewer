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
        When you generate questions or read a past exam&apos;s format, the material you picked is
        sent to an AI model. When you submit a quiz with short answers, those answers are sent for
        grading. Uploaded files pass through temporary storage on the way. We use your material
        only to make and grade your questions.
      </p>
    ),
  },
  {
    title: "AI providers",
    body: (
      <p>
        Google Gemini writes and grades your questions. If Gemini is unavailable, Mistral is used
        instead. Each provider handles what it receives under its own terms, which may let it keep
        the content for a time and use it to improve its services. Don&apos;t upload anything you
        wouldn&apos;t want an AI provider to see.
      </p>
    ),
  },
  {
    title: "Accounts",
    body: (
      <p>
        An account is optional. If you sign in with email or Google, your reviewers and history
        sync so they appear on your other devices. You can delete your synced data from the Account
        page. To also remove your sign-in and display name, unshare anything you shared and email
        us.
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
        Besides the AI providers, the app uses service providers for hosting, temporary file
        storage, accounts and sync, and abuse protection. Like any website, they see basic request
        data such as your IP address, which is also used for a short time to limit abuse. These
        providers may process data outside the Philippines.
      </p>
    ),
  },
  {
    title: "What we don't do",
    body: (
      <p>
        No analytics, no ads, no tracking cookies. The app sets only a short-lived security cookie
        after a bot check. Your data is never sold.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Privacy Policy</h1>
      <p className="mt-1 text-[0.875rem] text-text-tertiary">Last updated October 29, 2026</p>

      <p className="mt-8 max-w-[36rem] text-[1.1875rem] leading-snug text-text-primary text-pretty">
        Your study material stays on your device unless you sign in to sync it or ask the AI to read
        it.
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
          Ask about your data, or ask us for a copy, a correction, or deletion.
        </p>
        <CopyEmail className="mt-3" />
      </section>
    </div>
  );
}
