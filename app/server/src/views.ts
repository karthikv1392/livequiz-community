import { allowedCommands, answeredCount, counts, isLast, leaderboard } from "@livequiz/shared";
import type { AdminState, DisplayInit, DisplayState, Player, PlayerState, QuizConfig, Session } from "@livequiz/shared";

export function playerView(s: Session, cfg: QuizConfig, p: Player, lb = leaderboard(s)): PlayerState {
  const open = s.phase === "QUESTION_OPEN", closed = s.phase === "QUESTION_CLOSED";
  const q = cfg.questions[s.qIndex];
  const mine = s.answers[s.qIndex]?.[p.id];
  const final = s.phase === "LEADERBOARD" && isLast(s, cfg);
  return {
    t: "player_state", title: cfg.title, phase: s.phase, qIndex: s.qIndex, total: cfg.questions.length,
    joined: Object.keys(s.players).length,
    question: open || closed ? { text: q.text, options: q.options } : undefined, // never includes `correct`
    myChoice: mine?.choice,
    result: closed ? { correct: mine?.points ? mine.points > 0 : false, points: mine?.points ?? 0, correctIndex: q.correct } : undefined,
    score: p.score,
    rank: lb.find((r) => r.id === p.id)?.rank ?? 0,
    final,
    top3: s.phase === "LEADERBOARD" ? lb.slice(0, 3) : undefined,
  };
}

export function adminView(s: Session, cfg: QuizConfig, joinUrl: string | null, quizId: string, quizzes: AdminState["quizzes"]): AdminState {
  const q = cfg.questions[s.qIndex];
  const showQ = s.phase !== "LOBBY";
  const players = Object.values(s.players);
  return {
    t: "admin_state", title: cfg.title, phase: s.phase, qIndex: s.qIndex, total: cfg.questions.length,
    joined: players.length, connected: players.filter((p) => p.connected).length, answered: answeredCount(s),
    question: showQ ? { text: q.text, options: q.options, correct: q.correct } : null,
    allowed: allowedCommands(s, cfg),
    players: players.map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected })).sort((a, b) => b.score - a.score),
    autoClose: s.autoClose, joinUrl, quizId, quizzes,
  };
}

export function displayInit(cfg: QuizConfig, joinUrl: string | null, credit = ""): DisplayInit {
  return { t: "display_init", title: cfg.title, joinUrl, credit: credit || undefined, leaderboardEvery: cfg.leaderboardEvery,
    questions: cfg.questions.map((q) => ({ text: q.text, options: q.options })) };
}

export function displayView(s: Session, cfg: QuizConfig): DisplayState {
  const closed = s.phase === "QUESTION_CLOSED";
  return {
    t: "display_state", phase: s.phase, qIndex: s.qIndex, total: cfg.questions.length,
    joined: Object.keys(s.players).length, answered: answeredCount(s),
    recent: s.phase === "LOBBY" ? Object.values(s.players).sort((a, b) => b.joinedAt - a.joinedAt).slice(0, 14).map((p) => p.name) : undefined,
    // per-option counts and the correct answer are only revealed after Close
    counts: closed ? counts(s, cfg) : undefined,
    correct: closed ? cfg.questions[s.qIndex].correct : undefined,
    leaderboard: s.phase === "LEADERBOARD" ? leaderboard(s).slice(0, 10) : undefined,
    final: s.phase === "LEADERBOARD" && isLast(s, cfg),
  };
}
