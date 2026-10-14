import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/app/lib/feedback";
import BackLink from "@/app/components/BackLink";

export const metadata: Metadata = { title: "Privacy Policy | May Reviewer" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="text-[0.9375rem] font-medium text-text-primary">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-[0.9375rem] text-text-secondary">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Privacy Policy</h1>
      <p className="mt-1 text-[0.9375rem] text-text-secondary">Last updated October 14, 2026.</p>

      <div className="mt-6 flex flex-col">
        <Section title="The short version">
          <p>
            Your reviewers, questions, and quiz history live in this browser. If you sign in,
            they also sync to your account. Material leaves your device when you ask for AI
            generation: it is sent to the question-generation providers once, the questions
            come back, and the uploaded files are deleted after. Questions are public only if
            you choose to share them. There are no analytics, no advertising, and nothing is
            sold.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            Reviewers, questions, quiz attempts, formats, and settings are stored in your
            browser (local storage). Uploaded PDFs and images are stored in your
            browser&apos;s file database (IndexedDB). Uploaded files never sync and stay on
            each device. Without an account, nothing here is kept on a server. Clearing your
            browser data deletes the local copy.
          </p>
        </Section>

        <Section title="What is sent, and when">
          <p>
            Only when you tap Generate, or ask the app to draft question types from a past
            exam. The notes and material for that reviewer are sent so the model can read
            them. Pasted text is sent as text. PDFs and images are uploaded to temporary
            storage so the model can read them, then deleted after the questions come back.
            Short-answer grading sends your answer to the model when you submit a quiz.
            Nothing is sent at any other time. Browsing and editing are fully local.
          </p>
        </Section>

        <Section title="Accounts and sync">
          <p>
            You can sign in with an email and password. Signed-in data (reviewers, questions,
            quiz history, formats, and settings) syncs to the cloud database so it is
            available on your other devices. You can delete your account data from the
            Account page.
          </p>
        </Section>

        <Section title="Sharing">
          <p>
            Sharing is optional and needs an account. A share is a snapshot of questions
            only. These items become public when you share:
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>The title, the subject, and the questions.</li>
            <li>For a reviewer, its exam format, without the past exam.</li>
            <li>Your display name and tag, only if you choose to show them. Otherwise the share is anonymous.</li>
            <li>The share code.</li>
          </ul>
          <p>
            Notes, uploaded files, past exams, and quiz history stay private. They are never
            part of a share.
          </p>
          <p>
            An unlisted share is not shown on the Browse page. Anyone who has the link or the
            code can open it. A share you mark &quot;List publicly&quot; also appears on the
            Browse page. Anyone can open a share without an account.
          </p>
          <p>
            The owner sees an anonymous count of how many times a share was added. No names
            or other details of who added it are stored.
          </p>
          <p>
            You can unshare at any time from the Account page. The share data is then
            removed. Anyone can report a share, and the operator may remove reported shares.
          </p>
        </Section>

        <Section title="Who processes it">
          <p>
            Question generation is powered by Google&apos;s Gemini model
            (<span className="font-mono">gemini-3.1-flash-lite</span>), with Mistral&apos;s{" "}
            <span className="font-mono">mistral-small-latest</span> as a fallback when Gemini
            fails. Temporary file storage during generation uses Vercel Blob. Your material
            is used only to generate your questions, not for advertising, and never sold.
          </p>
        </Section>

        <Section title="What is never collected">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Without an account, no names, emails, or passwords. With an account, only your email and password for sign-in, and the display name you set.</li>
            <li>No analytics, crash reporting, or tracking of any kind.</li>
            <li>No advertising SDKs.</li>
          </ul>
        </Section>

        <Section title="Fair-use limits">
          <p>
            Generation is rate limited to keep model costs in check: 8 generations and 8
            format inferences per 10 minutes, 30 file uploads per 10 minutes. Uploads are
            capped at 10 files per field, 15 MB each, 40 MB total.
          </p>
        </Section>

        <Section title="Your controls">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Export any reviewer as JSON, or back up everything from Settings.</li>
            <li>Delete a single reviewer (its files and quiz history go too) or wipe all local data from Settings.</li>
            <li>Unshare anything you shared from the Account page.</li>
            <li>Delete your account data from the Account page to remove your synced data from the cloud.</li>
            <li>Clearing your browser data removes the local copy.</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}?subject=May%20Reviewer%20privacy`} className="font-medium text-accent underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
