import { normalizeQuiz } from "@livequiz/shared";

/** Editable form state. Numbers are kept as strings while typing. */
export interface QDraft { key: number; text: string; options: string[]; correct: number | null; points: string; extra: Record<string, string> }
export interface Draft { id: string | null; title: string; every: string; points: string; questions: QDraft[] }

export const MAX_OPTIONS = 6, MIN_OPTIONS = 2;
let keySeq = 1;
export const blankQuestion = (): QDraft => ({ key: keySeq++, text: "", options: ["", "", "", ""], correct: null, points: "", extra: {} });
export const blankDraft = (): Draft => ({ id: null, title: "", every: "1", points: "1000", questions: [blankQuestion()] });

/** Accepts our format or other common shapes (see normalizeQuiz). */
export function fromRaw(id: string | null, input: any): Draft {
  const raw = normalizeQuiz(input);
  return {
    id, title: raw.title, every: String(raw.leaderboardEvery), points: String(raw.defaults.points),
    questions: raw.questions.map((q: any): QDraft => ({
      key: keySeq++, text: q.text, options: q.options.length ? q.options : ["", ""], correct: Number.isInteger(q.correct) ? q.correct : null,
      points: q.points !== undefined ? String(q.points) : "",
      extra: Object.fromEntries(["topic", "explanation"].filter((k) => q[k]).map((k) => [k, q[k]])),
    })),
  };
}

export function toRaw(d: Draft) {
  const every = Math.max(1, parseInt(d.every, 10) || 1), points = Math.max(1, parseInt(d.points, 10) || 1000);
  return {
    title: d.title.trim(), leaderboardEvery: every, defaults: { points },
    questions: d.questions.map((q) => {
      const out: Record<string, unknown> = { text: q.text.trim(), options: q.options.map((o) => o.trim()), correct: q.correct };
      const p = parseInt(q.points, 10);
      if (q.points.trim() && p > 0) out.points = p;
      return { ...out, ...q.extra };
    }),
  };
}

/** Human-readable problems that block saving. */
export function problems(d: Draft): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push("Give the quiz a name.");
  if (!d.questions.length) out.push("Add at least one question.");
  d.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text.trim()) out.push(`Question ${n} needs text.`);
    if (q.options.some((o) => !o.trim())) out.push(`Question ${n} has an empty option.`);
    if (q.correct === null) out.push(`Question ${n}: tap a letter to mark the correct answer.`);
    if (q.points.trim() && !(parseInt(q.points, 10) > 0)) out.push(`Question ${n}: points must be a positive number.`);
  });
  return out;
}

export const slug = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "quiz";
export function uniqueId(base: string, taken: string[]) {
  let id = base, n = 2;
  while (taken.includes(id)) id = `${base}-${n++}`;
  return id;
}
