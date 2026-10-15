import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/app/components/BackLink";
import CopyEmail from "@/app/components/CopyEmail";

export const metadata: Metadata = { title: "Terms of Use | May Reviewer" };

// Numbered like the exam items the app generates.
const ITEMS: { title: string; body: string }[] = [
  {
    title: "A free study tool",
    body: "May Reviewer is an independent personal project. No school, course, or instructor runs or endorses it.",
  },
  {
    title: "Questions can be wrong",
    body: "An AI writes them. Treat them as practice, not official exam content, and check them against your notes.",
  },
  {
    title: "Your material is yours",
    body: "The app claims no ownership of what you upload or create. Only upload and share material you have the right to use.",
  },
  {
    title: "Play fair",
    body: "Don't abuse the limits or use the app for anything unlawful. Shares that break this may be removed.",
  },
  {
    title: "No guarantees",
    body: "The app is provided as-is and may change or stop. Export anything you want to keep. The developer is not liable for losses from using it.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <BackLink href="/">Home</BackLink>
      <h1 className="text-[1.625rem] font-semibold text-text-primary">Terms of Use</h1>
      <p className="mt-1 text-[0.875rem] text-text-tertiary">Last updated October 16, 2026</p>

      <p className="mt-8 max-w-[36rem] text-[0.9375rem] italic text-text-secondary">
        Directions: Five short items. Using May Reviewer means you accept them.
      </p>

      <ol className="mt-6 flex flex-col border-t border-border">
        {ITEMS.map((item, i) => (
          <li
            key={item.title}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 border-b border-border py-5"
          >
            <span className="pt-px text-[0.9375rem] font-semibold text-text-tertiary">{i + 1}.</span>
            <div className="max-w-[36rem]">
              <h2 className="text-[0.9375rem] font-semibold text-text-primary">{item.title}</h2>
              <p className="mt-1 text-[0.9375rem] text-text-secondary">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-6 max-w-[36rem] text-[0.9375rem] text-text-secondary">
        These terms may change. The date above shows the latest version. See also the{" "}
        <Link href="/privacy" className="font-medium text-accent underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>

      <section className="mt-10 max-w-[36rem]">
        <h2 className="text-[0.9375rem] font-semibold text-text-primary">Questions</h2>
        <CopyEmail className="mt-3" />
      </section>
    </div>
  );
}
