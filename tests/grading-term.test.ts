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
    expect(asksForTerm("What was the official name of the event in November 1799?")).toBe(true);
    expect(asksForTerm("What were the lists of grievances prepared by regions called?")).toBe(true);
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

  it("drops a key point that only repeats the stem's year", () => {
    const kept = dropStemKeyPoints(
      "What was the official name of the event in November 1799 that replaced the Directory with the Consulate?",
      ["Coup of 18 Brumaire", "Occurred in 1799", "Established the Consulate with Napoleon as First Consul"],
    );
    expect(kept).toEqual(["Coup of 18 Brumaire", "Established the Consulate with Napoleon as First Consul"]);
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

  const brumaire =
    "Identify the 1799 political event that effectively ended the French Revolutionary government and brought Napoleon to power.";

  it("drops a key point whose only name is already in the stem", () => {
    expect(
      dropStemKeyPoints(brumaire, ["The coup of 18 Brumaire", "Led to the rise of Napoleon Bonaparte"]),
    ).toEqual(["The coup of 18 Brumaire"]);
  });

  it("keeps a key point that names someone new", () => {
    const terror =
      "What was the name of the radical faction that dominated the Committee of Public Safety during the Reign of Terror?";
    const points = ["Jacobins", "They were led by Maximilien Robespierre"];
    expect(dropStemKeyPoints(terror, points)).toEqual(points);
  });

  it("keeps a key point that adds new information", () => {
    const points = ["The coup of 18 Brumaire", "Ended the Directory"];
    expect(dropStemKeyPoints(brumaire, points)).toEqual(points);
  });

  it("keeps at least one", () => {
    expect(dropStemKeyPoints("Identify the 1789 pamphlet.", ["1789 pamphlet"])).toEqual(["1789 pamphlet"]);
  });
});
