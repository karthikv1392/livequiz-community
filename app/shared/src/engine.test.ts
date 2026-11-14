import { describe, expect, it } from "vitest";
import { addPlayer, allAnswered, allowedCommands, boardAfter, command, counts, createSession, leaderboard, submitAnswer, validateQuiz } from "./engine";
import type { QuizConfig } from "./types";

const cfg: QuizConfig = {
  title: "t", leaderboardEvery: 1,
  questions: [
    { text: "q1", options: ["a", "b", "c"], correct: 1, points: 1000 },
    { text: "q2", options: ["a", "b"], correct: 0, points: 500 },
  ],
};
const mk = () => { const s = createSession(); const p = (n: string, t = 0) => (addPlayer(s, n, t) as any).value; return { s, p }; };

describe("joining", () => {
  it("dedupes names and rejects empty", () => {
    const { s, p } = mk();
    expect(p("Sam").name).toBe("Sam");
    expect(p("sam").name).toBe("sam 2");
    expect(addPlayer(s, "   ", 0).ok).toBe(false);
  });
});

describe("flow", () => {
  it("runs lobby -> q1 -> closed -> leaderboard -> q2 -> closed -> final leaderboard", () => {
    const { s, p } = mk(); p("a");
    expect(command(s, cfg, "close", 0).ok).toBe(false);
    command(s, cfg, "start", 0); expect(s.phase).toBe("QUESTION_OPEN");
    command(s, cfg, "close", 1); expect(s.phase).toBe("QUESTION_CLOSED");
    command(s, cfg, "next", 2); expect(s.phase).toBe("LEADERBOARD");
    command(s, cfg, "next", 3); expect(s.phase).toBe("QUESTION_OPEN"); expect(s.qIndex).toBe(1);
    command(s, cfg, "close", 4); command(s, cfg, "next", 5);
    expect(s.phase).toBe("LEADERBOARD");
    expect(allowedCommands(s, cfg)).toEqual(["reset"]);
    expect(command(s, cfg, "next", 6).ok).toBe(false);
  });
  it("skips interim boards when leaderboardEvery=2 but always ends on one", () => {
    const c = { ...cfg, leaderboardEvery: 2 };
    expect(boardAfter(c, 0)).toBe(false); expect(boardAfter(c, 1)).toBe(true);
  });
  it("reset clears everything", () => {
    const { s, p } = mk(); p("a"); command(s, cfg, "start", 0); command(s, cfg, "reset", 1);
    expect(s.phase).toBe("LOBBY"); expect(Object.keys(s.players)).toHaveLength(0);
  });
});

describe("answers and scoring", () => {
  it("allows changing answers, counts once, rejects after close", () => {
    const { s, p } = mk(); const a = p("a");
    command(s, cfg, "start", 100);
    expect(submitAnswer(s, cfg, a.id, 0, 0, 110).ok).toBe(true);
    expect(submitAnswer(s, cfg, a.id, 0, 1, 120).ok).toBe(true);
    expect(counts(s, cfg)).toEqual([0, 1, 0]);
    expect(submitAnswer(s, cfg, a.id, 0, 9, 120).ok).toBe(false);
    expect(allAnswered(s)).toBe(true);
    command(s, cfg, "close", 130);
    expect(s.players[a.id].score).toBe(1000);
    expect(s.players[a.id].totalAnswerMs).toBe(20);
    expect(submitAnswer(s, cfg, a.id, 0, 0, 140).ok).toBe(false);
  });
  it("late joiner can answer the open question; wrong answers score 0", () => {
    const { s, p } = mk(); p("a"); command(s, cfg, "start", 0);
    const late = p("late", 5);
    submitAnswer(s, cfg, late.id, 0, 2, 6); command(s, cfg, "close", 7);
    expect(s.players[late.id].score).toBe(0);
  });
  it("ranks by score, then faster total time, then join order", () => {
    const { s, p } = mk(); const a = p("a", 1), b = p("b", 2), c = p("c", 3), d = p("d", 4);
    command(s, cfg, "start", 0);
    submitAnswer(s, cfg, a.id, 0, 1, 900); submitAnswer(s, cfg, b.id, 0, 1, 300);
    submitAnswer(s, cfg, c.id, 0, 1, 300); submitAnswer(s, cfg, d.id, 0, 0, 10);
    command(s, cfg, "close", 1000);
    expect(leaderboard(s).map((r) => r.name)).toEqual(["b", "c", "a", "d"]);
  });
});

describe("validateQuiz", () => {
  it("accepts good input with defaults and reports bad input", () => {
    const q = validateQuiz({ questions: [{ text: "x", options: ["a", "b"], correct: 1 }] });
    expect(q.questions[0].points).toBe(1000); expect(q.leaderboardEvery).toBe(1);
    expect(() => validateQuiz({ questions: [{ text: "x", options: ["a"], correct: 0 }] })).toThrow(/Q1/);
  });
});
