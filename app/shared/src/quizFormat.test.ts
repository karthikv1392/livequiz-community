import { describe, expect, it } from "vitest";
import { normalizeQuiz, validateQuiz } from "./index";

describe("normalizeQuiz", () => {
  it("keeps our own format unchanged", () => {
    const raw = { title: "T", leaderboardEvery: 2, defaults: { points: 500 }, questions: [{ text: "Q?", options: ["a", "b"], correct: 1, points: 200 }] };
    const out = normalizeQuiz(raw);
    expect(out.questions[0]).toEqual({ text: "Q?", options: ["a", "b"], correct: 1, points: 200 });
    expect(out.leaderboardEvery).toBe(2);
    expect(out.defaults.points).toBe(500);
  });

  it("imports a letter-based format with 'A. ' prefixes and extras", () => {
    const out = normalizeQuiz({
      quizTitle: "AI Engineering",
      questions: [{ id: 1, question: "Pick the CNN", options: ["A. RNN", "B. CNN", "C. GAN", "D. Perceptron"], correctAnswer: "B", explanation: "Spatial features." }],
    });
    expect(out.title).toBe("AI Engineering");
    expect(out.questions[0].options).toEqual(["RNN", "CNN", "GAN", "Perceptron"]);
    expect(out.questions[0].correct).toBe(1);
    expect(out.questions[0].explanation).toBe("Spatial features.");
    expect(() => validateQuiz(out)).not.toThrow();
  });

  it("imports option objects with a letter answer", () => {
    const out = normalizeQuiz({ title: "T", questions: [{ question: "Q", options: [{ id: "A", text: "x" }, { id: "B", text: "y" }], correctAnswer: "B" }] });
    expect(out.questions[0].options).toEqual(["x", "y"]);
    expect(out.questions[0].correct).toBe(1);
  });

  it("matches the correct answer by text", () => {
    const out = normalizeQuiz({ title: "T", questions: [{ text: "Q", options: ["x", "y", "z"], correct: "z" }] });
    expect(out.questions[0].correct).toBe(2);
  });

  it("does not strip a prefix unless every option has one", () => {
    const out = normalizeQuiz({ title: "T", questions: [{ text: "Q", options: ["A. one", "two"], correct: 0 }] });
    expect(out.questions[0].options).toEqual(["A. one", "two"]);
  });

  it("rejects input that is not a quiz", () => {
    expect(() => normalizeQuiz(null)).toThrow();
    expect(() => normalizeQuiz({ title: "x" })).toThrow(/questions/);
  });
});

describe("validateQuiz", () => {
  const ok = { title: "T", questions: [{ text: "Q", options: ["a", "b"], correct: 0 }] };
  it("accepts a minimal quiz and applies defaults", () => {
    const cfg = validateQuiz(ok);
    expect(cfg.questions[0].points).toBe(1000);
    expect(cfg.leaderboardEvery).toBe(1);
  });
  it("names problems by question number", () => {
    expect(() => validateQuiz({ title: "T", questions: [ok.questions[0], { text: "", options: ["a"], correct: 3 }] })).toThrow(/Q2/);
  });
  it("rejects empty options and a missing correct answer", () => {
    expect(() => validateQuiz({ title: "T", questions: [{ text: "Q", options: ["a", " "], correct: 0 }] })).toThrow(/empty/);
    expect(() => validateQuiz({ title: "T", questions: [{ text: "Q", options: ["a", "b"] }] })).toThrow(/correct/);
  });
  it("falls back to a title", () => { expect(validateQuiz({ questions: ok.questions }).title).toBe("Untitled quiz"); });
});
