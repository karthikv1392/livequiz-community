import fs from "node:fs";
import path from "node:path";
import { normalizeQuiz, validateQuiz, type QuizConfig } from "@livequiz/shared";

/** `raw` is the normalised JSON as stored on disk (what the quiz builder edits); `cfg` is the validated config the engine runs. */
export interface QuizEntry { id: string; cfg: QuizConfig; raw: any }

/** Quiz ids double as file names, so keep them boring: no path separators, no leading `_` (hidden) or `.`. */
export const QUIZ_ID = /^[a-z0-9][a-z0-9_-]{0,60}$/;

export function parseQuiz(id: string, text: string): QuizEntry {
  const raw = normalizeQuiz(JSON.parse(text));
  return { id, raw, cfg: validateQuiz(raw) };
}

/** Loads every *.json in `dir` (id = file name without extension). Invalid files are skipped with a warning. */
export function loadQuizzes(dir: string, only?: string): QuizEntry[] {
  const files = only ? [only] : fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_") && !f.startsWith(".")).sort().map((f) => path.join(dir, f)) : [];
  const out: QuizEntry[] = [];
  for (const f of files) {
    try { out.push(parseQuiz(path.basename(f, ".json"), fs.readFileSync(f, "utf8"))); }
    catch (e) { console.warn(`  ! skipping ${path.basename(f)}: ${(e as Error).message}`); }
  }
  if (!out.length) throw new Error(`No valid quiz files found (${only ?? dir}). Add a JSON file to the quizzes folder.`);
  return out;
}

export function saveQuizFile(dir: string, id: string, raw: unknown) {
  if (!QUIZ_ID.test(id)) throw new Error("Invalid quiz id");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(raw, null, 2) + "\n");
}

export function deleteQuizFile(dir: string, id: string) {
  if (!QUIZ_ID.test(id)) throw new Error("Invalid quiz id");
  fs.rmSync(path.join(dir, `${id}.json`), { force: true });
}
