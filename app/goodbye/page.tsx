import Link from "next/link";

// Landing page after Account > Delete account. Confirms the wipe and gives
// the returning user one clear next step — it also reserves the URL the
// future Play "delete your account on the web" rule will point at.
export default function GoodbyePage() {
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <h1 className="text-[26px] font-semibold text-text-primary">Your data was deleted</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Your synced reviewers, questions, history, formats, and settings were removed from the
        cloud and this device. Uploaded files never left this device — clearing the browser&apos;s
        site data removes any leftovers.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 py-2 text-[15px] font-semibold text-on-accent"
        >
          Start fresh
        </Link>
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-border-strong px-4 py-2 text-[15px] font-medium text-text-primary"
        >
          Sign in again
        </Link>
      </div>
    </div>
  );
}
