function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-6">
      <h2 className="text-[15px] font-medium text-text-primary">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-[15px] text-text-secondary">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">Privacy Policy</h1>
      <p className="mt-1 text-[15px] text-text-secondary">Last updated September 12, 2026.</p>

      <div className="mt-6 flex flex-col">
        <Section title="The short version">
          <p>
            Your reviewers, questions, and quiz history live in this browser only. The only
            time anything leaves your device is when you ask for AI generation: your material
            is sent to the question-generation providers once, the questions come back, and
            the uploaded files are deleted after. There are no accounts, no analytics, no
            advertising, and nothing is sold.
          </p>
        </Section>

        <Section title="What stays on your device">
          <p>
            Reviewers, questions, quiz attempts, formats, and settings are stored in your
            browser (local storage). Uploaded PDFs and images are stored in your
            browser&apos;s file database (IndexedDB). Nothing here is kept on a server and
            nothing syncs between devices. Clearing your browser data deletes it all.
          </p>
        </Section>

        <Section title="What is sent, and when">
          <p>
            Only when you tap Generate (or ask the app to draft question types from a past
            exam): the notes and material for that reviewer are sent so the model can read
            them. Pasted text travels as text. PDFs and images are uploaded to temporary
            storage so the model can read them natively, then deleted after the questions
            come back. Nothing is sent at any other time — browsing, editing, and quizzing
            are fully local.
          </p>
        </Section>

        <Section title="Who processes it">
          <p>
            Question generation is powered by Google&apos;s Gemini model
            (<span className="font-mono">gemini-3.1-flash-lite</span>), with Mistral&apos;s{" "}
            <span className="font-mono">mistral-small-latest</span> as a fallback when Gemini
            fails. Temporary file storage during generation uses Vercel Blob. Your material
            is used only to generate your questions — not for advertising, and never sold.
          </p>
        </Section>

        <Section title="What is never collected">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>No accounts, so no names, emails, or passwords.</li>
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
            <li>Clearing your browser data removes everything, since everything lives there.</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy:{" "}
            <a href="mailto:support@example.com?subject=May%20Reviewer%20privacy" className="font-medium text-accent underline">
              support@example.com
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
