// @vitest-environment jsdom
// The count fields re-seed when the format's types change. On the first
// render a custom format resolves to the OS exam (customs load after mount),
// so the fields must follow once the real format arrives.
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import QuestionCountControl from "@/app/components/QuestionCountControl";
import { HISTORY, OS_EXAM } from "@/app/lib/examFormats";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("QuestionCountControl", () => {
  it("shows the stored counts after the format changes from the placeholder", () => {
    const value = Object.fromEntries(HISTORY.types.map((t, i) => [t.key, i + 2]));
    const container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
    const render = (format: typeof OS_EXAM) =>
      act(() => root!.render(createElement(QuestionCountControl, { format, value, onChange: () => {} })));

    render(OS_EXAM);
    render(HISTORY);

    const inputs = [...container.querySelectorAll("input")].map((i) => i.value);
    expect(inputs).toEqual(HISTORY.types.map((_, i) => String(i + 2)));
    const total = HISTORY.types.reduce((sum, _, i) => sum + i + 2, 0);
    expect(container.textContent).toContain(`Total: ${total} questions`);
  });
});
