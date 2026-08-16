// A stimulus that isn't a table or a code listing is prose — context to read
// before the question, not a problem to be traced — so it gets a quote rather
// than the monospace block `StimulusBlock` renders.
//
// Shared because the edit, quiz, and results screens had drifted: the edit tab
// branched on `isPreformatted(type)` and quoted it, while the other two only
// checked that a stimulus existed and ran everything through the monospace
// block, headed "PROBLEM · QUESTIONS 2-2".
export default function StimulusQuote({ stimulus }: { stimulus: string }) {
  return (
    <blockquote className="mt-2 border-l-2 border-accent pl-3 text-[15px] leading-relaxed whitespace-pre-wrap text-text-secondary italic">
      {stimulus}
    </blockquote>
  );
}
