import type { Answer, Command, LeaderboardRow, Phase, Player, QuizConfig, Session } from "./types";

export const MAX_PLAYERS = 100;
export const MAX_NAME = 20;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; code: string; msg: string };
export type Result<T> = Ok<T> | Err;
const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = (code: string, msg: string): Err => ({ ok: false, code, msg });

export function createSession(autoClose = false): Session {
  return { phase: "LOBBY", qIndex: 0, openedAt: null, autoClose, players: {}, answers: {} };
}

const uid = () => globalThis.crypto.randomUUID();

export function addPlayer(s: Session, rawName: string, now: number): Result<Player> {
  const base = rawName.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  if (!base) return err("BAD_NAME", "Please enter a name");
  if (Object.keys(s.players).length >= MAX_PLAYERS) return err("ROOM_FULL", "The room is full");
  const taken = new Set(Object.values(s.players).map((p) => p.name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, MAX_NAME - 3)} ${n}`;
  const p: Player = { id: uid(), token: uid(), name, joinedAt: now, connected: true, score: 0, totalAnswerMs: 0 };
  s.players[p.id] = p;
  return ok(p);
}

export function findByToken(s: Session, token: string | undefined): Player | undefined {
  if (!token) return undefined;
  return Object.values(s.players).find((p) => p.token === token);
}

export function removePlayer(s: Session, id: string): void {
  delete s.players[id];
  for (const q of Object.values(s.answers)) delete q[id];
}

export function submitAnswer(s: Session, cfg: QuizConfig, playerId: string, qIndex: number, choice: number, now: number): Result<null> {
  if (!s.players[playerId]) return err("NO_PLAYER", "Unknown player");
  if (s.phase !== "QUESTION_OPEN" || qIndex !== s.qIndex) return err("CLOSED", "This question is closed");
  const q = cfg.questions[s.qIndex];
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) return err("BAD_CHOICE", "Invalid option");
  (s.answers[s.qIndex] ??= {})[playerId] = { choice, at: now, points: null };
  return ok(null);
}

export const answeredCount = (s: Session, q = s.qIndex) => Object.keys(s.answers[q] ?? {}).length;

/** True when every player has answered the open question (used by the optional auto-close rule). */
export function allAnswered(s: Session): boolean {
  const n = Object.keys(s.players).length;
  return s.phase === "QUESTION_OPEN" && n > 0 && answeredCount(s) >= n;
}

export function counts(s: Session, cfg: QuizConfig, q = s.qIndex): number[] {
  const out = cfg.questions[q].options.map(() => 0);
  for (const a of Object.values(s.answers[q] ?? {})) out[a.choice]++;
  return out;
}

export const isLast = (s: Session, cfg: QuizConfig) => s.qIndex >= cfg.questions.length - 1;

/** Whether the leaderboard follows question index q. */
export function boardAfter(cfg: QuizConfig, q: number): boolean {
  return q === cfg.questions.length - 1 || (q + 1) % cfg.leaderboardEvery === 0;
}

function scoreQuestion(s: Session, cfg: QuizConfig) {
  const q = cfg.questions[s.qIndex];
  for (const [pid, a] of Object.entries(s.answers[s.qIndex] ?? {})) {
    const p = s.players[pid];
    if (!p || a.points !== null) continue; // idempotent
    if (a.choice === q.correct) {
      a.points = q.points;
      p.score += q.points;
      p.totalAnswerMs += Math.max(0, a.at - (s.openedAt ?? a.at));
    } else a.points = 0;
  }
}

export function allowedCommands(s: Session, cfg: QuizConfig): Command[] {
  switch (s.phase) {
    case "LOBBY": return cfg.questions.length ? ["start"] : [];
    case "QUESTION_OPEN": return ["close", "reset"];
    case "QUESTION_CLOSED": return ["next", "reset"];
    case "LEADERBOARD": return isLast(s, cfg) ? ["reset"] : ["next", "reset"];
  }
}

export function command(s: Session, cfg: QuizConfig, name: Command, now: number): Result<Phase> {
  if (!allowedCommands(s, cfg).includes(name)) return err("NOT_ALLOWED", `"${name}" is not allowed during ${s.phase}`);
  const open = (q: number) => { s.phase = "QUESTION_OPEN"; s.qIndex = q; s.openedAt = now; };
  switch (name) {
    case "start": open(0); break;
    case "close": scoreQuestion(s, cfg); s.phase = "QUESTION_CLOSED"; break;
    case "next":
      if (s.phase === "QUESTION_CLOSED") {
        if (boardAfter(cfg, s.qIndex)) s.phase = "LEADERBOARD"; else open(s.qIndex + 1);
      } else open(s.qIndex + 1); // from LEADERBOARD
      break;
    case "reset": Object.assign(s, createSession(s.autoClose)); break;
  }
  return ok(s.phase);
}

/** Ranked players: score desc, then lower total answer time, then earlier join. Ranks are strict (1..n). */
export function leaderboard(s: Session): LeaderboardRow[] {
  return Object.values(s.players)
    .sort((a, b) => b.score - a.score || a.totalAnswerMs - b.totalAnswerMs || a.joinedAt - b.joinedAt)
    .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score }));
}

export function validateQuiz(raw: any): QuizConfig {
  const errors: string[] = [];
  if (!raw || !Array.isArray(raw.questions) || !raw.questions.length) throw new Error("Quiz needs a non-empty 'questions' list");
  const defPoints = Number(raw.defaults?.points ?? 1000);
  const questions = raw.questions.map((q: any, i: number) => {
    const n = i + 1;
    if (typeof q.text !== "string" || !q.text.trim()) errors.push(`Q${n}: missing text`);
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) errors.push(`Q${n}: needs 2-6 options`);
    else if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) errors.push(`Q${n}: choose the correct answer`);
    else if (q.options.some((o: unknown) => !String(o ?? "").trim())) errors.push(`Q${n}: an option is empty`);
    return { text: String(q.text), options: (q.options ?? []).map(String), correct: q.correct, points: Number(q.points ?? defPoints) };
  });
  if (errors.length) throw new Error("Quiz is invalid:\n  " + errors.join("\n  "));
  return { title: String(raw.title ?? "").trim() || "Untitled quiz", leaderboardEvery: Math.max(1, Number(raw.leaderboardEvery ?? 1)), questions };
}
