import { describe, expect, it } from "vitest";
import { compose, filesToText, type UploadedTextFile } from "@/app/components/ContentField";

function file(overrides: Partial<UploadedTextFile> = {}): UploadedTextFile {
  return {
    id: crypto.randomUUID(),
    name: "week1.txt",
    file: null as unknown as File, // only used for the download link in the UI
    text: "SCHEDULING BASICS",
    status: "done",
    ...overrides,
  };
}

describe("filesToText", () => {
  it("labels each file and joins them", () => {
    expect(filesToText([file(), file({ name: "week2.txt", text: "PAGING" })])).toBe(
      "--- week1.txt ---\nSCHEDULING BASICS\n\n--- week2.txt ---\nPAGING",
    );
  });

  it("skips files that haven't finished extracting or failed", () => {
    expect(filesToText([file({ status: "extracting", text: "" }), file({ status: "error" })])).toBe(
      "",
    );
  });
});

describe("compose", () => {
  // The regression this exists for: adding or removing a PDF re-emits the
  // field value, and it used to send only the file text — which is "" when the
  // user had *pasted* their notes, silently wiping them on the next save.
  it("keeps pasted text when there are no extracted files", () => {
    expect(compose("MY PASTED NOTES", [])).toBe("MY PASTED NOTES");
  });

  it("keeps pasted text when a file is added alongside it", () => {
    expect(compose("MY PASTED NOTES", [file()])).toBe(
      "MY PASTED NOTES\n\n--- week1.txt ---\nSCHEDULING BASICS",
    );
  });

  it("returns just the file text when nothing was pasted", () => {
    expect(compose("", [file()])).toBe("--- week1.txt ---\nSCHEDULING BASICS");
  });

  it("emits nothing rather than stray separators when both halves are empty", () => {
    expect(compose("", [])).toBe("");
    expect(compose("   ", [])).toBe("");
    expect(compose("", [file({ status: "extracting", text: "" })])).toBe("");
  });

  // `textFiles` is session-only, so after a remount the previously composed
  // value comes back as the pasted half. Appending is what stops a file added
  // after a tab switch from replacing everything that came before it.
  it("appends to a previously composed value rather than replacing it", () => {
    const first = compose("MY PASTED NOTES", [file()]);
    const second = compose(first, [file({ name: "week2.txt", text: "PAGING BASICS" })]);

    expect(second).toContain("MY PASTED NOTES");
    expect(second).toContain("SCHEDULING BASICS");
    expect(second).toContain("PAGING BASICS");
  });
});
