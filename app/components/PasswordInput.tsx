// Shared password input with an inline show/hide toggle. The toggle sits
// inside the field's right edge so it doesn't shift layout, and keeps a 44px
// hit target. Used by /login (labelled) and /account (placeholder +
// aria-label) — one icon set, one behavior.
//
// Icons are inline SVGs (no emoji): open eye for "show", slashed eye for
// "hide". The state stays in the spoken labels ("Show password") so screen
// readers announce it; sighted users get the icon.

// Same 24px stroke-icon language as the chevrons elsewhere in the app.
export function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function PasswordInput({
  id,
  autoComplete,
  value,
  onChange,
  shown,
  onToggleShown,
  // Noun for the toggle's spoken label ("password", "new password").
  toggleNoun,
  placeholder,
  ariaLabel,
  required,
  minLength,
  className = "relative",
}: {
  id?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  shown: boolean;
  onToggleShown: () => void;
  toggleNoun: string;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  minLength?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <input
        id={id}
        type={shown ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-12 w-full rounded-lg border border-border bg-surface py-2 pr-14 pl-3 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
      />
      <button
        type="button"
        onClick={onToggleShown}
        aria-pressed={shown}
        aria-label={shown ? `Hide ${toggleNoun}` : `Show ${toggleNoun}`}
        className="absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
