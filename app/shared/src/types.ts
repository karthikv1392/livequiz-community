export type Phase = "LOBBY" | "QUESTION_OPEN" | "QUESTION_CLOSED" | "LEADERBOARD";

export interface Question {
  text: string;
  options: string[]; // 2..6
  correct: number;
  points: number;
}

export interface QuizConfig {
  title: string;
  /** Show the leaderboard after every N questions (1 = after each). The last question always ends on the leaderboard. */
  leaderboardEvery: number;
  questions: Question[];
}

export interface Player {
  id: string;
  token: string; // secret, never broadcast
  name: string;
  joinedAt: number;
  connected: boolean;
  score: number;
  /** Sum of (answer time - question open time) over CORRECT answers; used as tie-break (lower is better). */
  totalAnswerMs: number;
}

export interface Answer {
  choice: number;
  at: number;
  points: number | null; // null until the question is closed
}

export interface Session {
  phase: Phase;
  qIndex: number;
  openedAt: number | null;
  autoClose: boolean;
  players: Record<string, Player>;
  answers: Record<number, Record<string, Answer>>;
}

export interface LeaderboardRow {
  rank: number;
  id: string;
  name: string;
  score: number;
}

export type Command = "start" | "close" | "next" | "reset";
