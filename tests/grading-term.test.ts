import { describe, expect, it } from "vitest";
import { asksForTerm, dropStemKeyPoints, namesModelTerm } from "@/app/lib/grading";

const sieyes = {
  question:
    "Identify the influential 1789 pamphlet that argued the Third Estate represented the nation and should act as a National Assembly.",
  modelAnswer: "The pamphlet was titled 'What Is the Third Estate?' and was written by Abbé Sieyès.",
  keyPoints: ["What Is the Third Estate?", "Abbé Sieyès"],
};
const directory = {
  question:
    "What is the name of the legislative group established by the Constitution of 1795 that governed France for four years before being overthrown by Napoleon?",
  modelAnswer: "The Directory was the five-member committee that held executive power in France.",
  keyPoints: ["The Directory", "Five-member executive"],
};

describe("asksForTerm", () => {
  it("is true for name stems", () => {
    expect(asksForTerm(sieyes.question)).toBe(true);
    expect(asksForTerm(directory.question)).toBe(true);
    expect(asksForTerm("Name the scheduler that uses a time quantum.")).toBe(true);
    expect(asksForTerm("What is it called?")).toBe(true);
    expect(asksForTerm("What do we call a blocked process?")).toBe(true);
    expect(asksForTerm("What term describes this?")).toBe(true);
  });

  it("is false for other stems", () => {
    expect(asksForTerm("Explain why round robin avoids starvation.")).toBe(false);
    expect(asksForTerm("Why did the Estates General fail?")).toBe(false);
    expect(asksForTerm("Describe the Great Fear.")).toBe(false);
    expect(asksForTerm("How does a time quantum work?")).toBe(false);
  });
});

describe("namesModelTerm", () => {
  it("credits the pamphlet title", () => {
    expect(namesModelTerm(sieyes, "What Is the Third Estate?", false)).toBe(true);
  });

  it("credits The Directory", () => {
    expect(namesModelTerm(directory, "The Directory.", false)).toBe(true);
  });

  it("rejects a negated answer", () => {
    expect(namesModelTerm(directory, "Not the Directory", false)).toBe(false);
  });

  it("ignores key point 0 when the question is not a term question", () => {
    const item = {
      question: "Explain why round robin avoids starvation.",
      modelAnswer:
        "Every process gets a turn in order, so no process waits forever behind a long-running one.",
      keyPoints: ["Time quantum", "Fair turns"],
    };
    expect(namesModelTerm(item, "It uses a time quantum", false)).toBe(false);
  });
});

describe("dropStemKeyPoints", () => {
  const march =
    "Identify the event in which a group of Parisian women marched to the seat of royal power to protest bread shortages and demand the king's return to Paris.";

  it("drops a key point that restates the stem", () => {
    const kept = dropStemKeyPoints(march, [
      "Women's March on Versailles",
      "Protest regarding food shortages",
      "Forced the royal family to leave Versailles for Paris",
    ]);
    expect(kept[0]).toBe("Women's March on Versailles");
    expect(kept).not.toContain("Protest regarding food shortages");
  });

  it("leaves non-term questions unchanged", () => {
    const points = ["Each process gets a time quantum", "Avoids starvation"];
    expect(dropStemKeyPoints("Explain why round robin scheduling avoids starvation.", points)).toEqual(points);
  });

  it("drops a number already in the stem", () => {
    expect(dropStemKeyPoints("Identify the 1789 pamphlet.", ["What Is the Third Estate?", "1789"])).toEqual([
      "What Is the Third Estate?",
    ]);
  });

  it("keeps at least one", () => {
    expect(dropStemKeyPoints("Identify the 1789 pamphlet.", ["1789 pamphlet"])).toEqual(["1789 pamphlet"]);
  });
});
