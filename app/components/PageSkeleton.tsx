// Quiet stand-in for a page while its data loads from storage. It keeps the
// page frame (width, padding, title bar) so content lands without a shift.
export default function PageSkeleton({
  maxWidth = "max-w-3xl",
  blocks = 3,
}: {
  maxWidth?: string;
  blocks?: number;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={`mx-auto flex w-full ${maxWidth} flex-1 flex-col gap-4 px-6 py-10`}
    >
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-9 w-48 rounded-lg bg-surface-alt motion-safe:animate-pulse" />
      {Array.from({ length: blocks }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-20 rounded-lg border border-border bg-surface-alt motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
