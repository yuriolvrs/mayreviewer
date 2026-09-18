"use client";

import { useEffect, useState } from "react";
import { Ghost, Lock, Megaphone, PackageOpen, VolumeX, type LucideIcon } from "lucide-react";

type EmptyVariant = {
  id: string;
  title: string;
  body: string;
  icon?: LucideIcon;
  // LOCK INN weighs double so it comes up about twice as often as the rest.
  weight: number;
  // D2's storage bar + scoreboard instead of an icon.
  meter?: boolean;
};

const VARIANTS: EmptyVariant[] = [
  {
    id: "crickets",
    title: "Nothing here but crickets",
    body: "Total silence. Create a reviewer and make some noise.",
    icon: VolumeX,
    weight: 1,
  },
  {
    id: "walang-laman",
    title: "Walang laman!",
    body: "An empty box. Fill it with a reviewer.",
    icon: PackageOpen,
    weight: 1,
  },
  {
    id: "storage",
    title: "Reviewer storage: 0% full",
    body: "Plenty of room to grow.",
    weight: 1,
    meter: true,
  },
  {
    id: "ghosted",
    title: "Your notes ghosted you",
    body: "Or YOU are ghosting them. Make the first move.",
    icon: Ghost,
    weight: 1,
  },
  {
    id: "echo",
    title: "Hellooo? Anyone studying in here?",
    body: "Dead quiet. A reviewer would fix that.",
    icon: Megaphone,
    weight: 1,
  },
  {
    id: "lock-in",
    title: "LOCK INNN",
    body: "cmon just one reviewer. future you will thank you",
    icon: Lock,
    weight: 2,
  },
];

// First-visit marker. Lives in localStorage beside settings — a logout clear
// resets it, which is fine: LOCK INN is the default greeting anyway.
const GREETED_KEY = "mayreviewer-empty-greeted";

function pickVariant(): EmptyVariant {
  const total = VARIANTS.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * total;
  for (const v of VARIANTS) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return VARIANTS[VARIANTS.length - 1];
}

// Random empty state for the home list. The pick happens on mount — never
// during render — so server and client first paint agree and there's no
// hydration mismatch. New users always meet LOCK INN first.
export default function EmptyReviewers() {
  const [variant, setVariant] = useState<EmptyVariant | null>(null);

  useEffect(() => {
    let next: EmptyVariant;
    try {
      if (!window.localStorage.getItem(GREETED_KEY)) {
        window.localStorage.setItem(GREETED_KEY, "1");
        next = VARIANTS.find((v) => v.id === "lock-in") ?? pickVariant();
      } else {
        next = pickVariant();
      }
    } catch {
      next = pickVariant();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(next);
  }, []);

  if (!variant) {
    // Reserve roughly the content's height so the pick popping in doesn't
    // shift the layout below the box.
    return <div aria-hidden="true" className="min-h-[140px]" />;
  }

  const Icon = variant.icon;
  return (
    <div className="flex flex-col items-center">
      {Icon && <Icon aria-hidden="true" size={56} className="text-text-tertiary" />}
      <p className={`text-[17px] font-semibold text-text-primary ${Icon ? "mt-4" : ""}`}>
        {variant.title}
      </p>
      <p className="mt-1 text-[15px] text-text-secondary">{variant.body}</p>
      {variant.meter && (
        <>
          <div
            aria-hidden="true"
            className="mx-auto mt-5 h-2 w-full max-w-[320px] overflow-hidden rounded-full border border-border bg-surface-alt"
          >
            <div className="h-full w-0 bg-accent" />
          </div>
          <p className="mt-3 font-mono text-[13px] text-text-tertiary">
            reviewers? 0. quizzes taken? 0. excuses left? a lot
          </p>
        </>
      )}
    </div>
  );
}
