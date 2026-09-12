// Shown while client pages hydrate their localStorage reads, so a first
// paint is a skeleton rather than a blank flash.
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-6 py-12" aria-hidden="true">
      <div className="h-9 w-48 animate-pulse rounded-lg bg-surface-alt" />
      <div className="h-5 w-72 animate-pulse rounded-lg bg-surface-alt" />
      <div className="mt-4 h-24 animate-pulse rounded-lg bg-surface-alt" />
      <div className="h-24 animate-pulse rounded-lg bg-surface-alt" />
    </div>
  );
}
