/**
 * Turns common quiz JSON shapes into LiveQuiz's own format, so people can paste or import
 * quizzes written elsewhere. Accepts:
 *  - title: `title` | `quizTitle` | `name`
 *  - question text: `text` | `question`
 *  - options: strings, or objects with `text`/`label`; an "A. " style prefix is removed when every option has one
 *  - correct answer: a 0-based index (`correct`), a letter ("B") or the option's text (`correct` | `correctAnswer`)
 * Output is a plain object ready for `validateQuiz` (extra fields such as `explanation` are kept).
 */
const LETTERS = "ABCDEF";
const PREFIX = /^\s*[A-Fa-f][.)]\s+/;

export function normalizeQuiz(raw: any): any {
  if (!raw || typeof raw !== "object") throw new Error("Quiz must be a JSON object");
  const list = raw.questions;
  if (!Array.isArray(list)) throw new Error("Quiz needs a 'questions' list");
  const questions = list.map((q: any, i: number) => {
    const n = i + 1;
    const rawOpts: any[] = Array.isArray(q?.options) ? q.options : [];
    const opts = rawOpts.map((o) => String(typeof o === "object" && o ? o.text ?? o.label ?? "" : o ?? ""));
    const stripped = opts.length > 1 && opts.every((o) => PREFIX.test(o)) ? opts.map((o) => o.replace(PREFIX, "")) : opts;
    const answer = q?.correct ?? q?.correctAnswer ?? q?.answer;
    let correct: number | undefined;
    if (Number.isInteger(answer)) correct = answer;
    else if (typeof answer === "string") {
      const a = answer.trim();
      const byLetter = a.length === 1 ? LETTERS.indexOf(a.toUpperCase()) : -1;
      const byText = stripped.findIndex((o) => o.trim().toLowerCase() === a.replace(PREFIX, "").trim().toLowerCase());
      correct = byLetter >= 0 ? byLetter : byText >= 0 ? byText : undefined;
    }
    const out: any = { text: String(q?.text ?? q?.question ?? ""), options: stripped, correct };
    if (q?.points !== undefined && q.points !== "") out.points = Number(q.points);
    for (const k of ["topic", "explanation"]) if (typeof q?.[k] === "string" && q[k]) out[k] = q[k];
    void n;
    return out;
  });
  const out: any = { title: String(raw.title ?? raw.quizTitle ?? raw.name ?? "").trim(), questions };
  const every = Number(raw.leaderboardEvery ?? 1);
  out.leaderboardEvery = Number.isInteger(every) && every >= 1 ? every : 1;
  const pts = Number(raw.defaults?.points ?? 1000);
  out.defaults = { points: Number.isFinite(pts) && pts > 0 ? pts : 1000 };
  return out;
}
