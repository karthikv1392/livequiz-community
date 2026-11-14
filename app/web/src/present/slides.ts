import { boardAfter } from "@livequiz/shared";
import type { DisplayInit, DisplayState } from "@livequiz/shared";

export const SLIDE_W = 1920, SLIDE_H = 1080, GAP = 240;

export interface SlideDef { key: string; x: number }

/** One slide per phase, laid out left-to-right: lobby, then (question, results, [leaderboard]) per question. */
export function buildSlides(init: DisplayInit): SlideDef[] {
  const keys = ["lobby"];
  init.questions.forEach((_, i) => {
    keys.push(`q${i}`, `r${i}`);
    if (boardAfter({ title: "", leaderboardEvery: init.leaderboardEvery, questions: init.questions as any }, i)) keys.push(`b${i}`);
  });
  return keys.map((key, n) => ({ key, x: n * (SLIDE_W + GAP) }));
}

export function activeKey(s: DisplayState): string {
  switch (s.phase) {
    case "LOBBY": return "lobby";
    case "QUESTION_OPEN": return `q${s.qIndex}`;
    case "QUESTION_CLOSED": return `r${s.qIndex}`;
    case "LEADERBOARD": return `b${s.qIndex}`;
  }
}

/** JSON props rendered by the QuizSlide shape for a given slide key. */
export function slideData(key: string, init: DisplayInit, s: DisplayState | null): Record<string, any> {
  const joinUrl = init.joinUrl;
  const joined = s?.joined ?? 0;
  const kind = key === "lobby" ? "lobby" : key[0] === "q" ? "question" : key[0] === "r" ? "results" : "board";
  const i = key === "lobby" ? 0 : Number(key.slice(1));
  const live = s && activeKey(s) === key ? s : null;
  const q = init.questions[i];
  // tldraw's jsonValue validator rejects `undefined`, so round-trip through JSON
  return JSON.parse(JSON.stringify({
    kind, title: init.title, joinUrl, credit: init.credit, joined, total: init.questions.length, index: i,
    text: q?.text, options: q?.options,
    recent: live?.recent ?? [], answered: live?.answered ?? 0, counts: live?.counts, correct: live?.correct,
    rows: live?.leaderboard ?? [], final: live?.final ?? false,
  }));
}
