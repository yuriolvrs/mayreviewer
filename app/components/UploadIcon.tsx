// Shared upload glyph (tray + up arrow) for every file dropzone. Inline SVG,
// no emoji; aria-hidden since the adjacent text already names the action.
export default function UploadIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 text-text-secondary"
    >
      <path
        d="M12 15V3m0 0L7 8m5-5 5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
