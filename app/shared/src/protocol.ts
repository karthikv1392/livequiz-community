import type { Command, LeaderboardRow, Phase } from "./types";

// ---- client -> server ----
export type PlayerMsg = { t: "join"; name: string; token?: string } | { t: "answer"; qIndex: number; choice: number };
export type AdminMsg =
  | { t: "auth"; pin: string }
  | { t: "cmd"; name: Command }
  | { t: "kick"; playerId: string }
  | { t: "set"; key: "autoClose"; value: boolean }
  | { t: "select_quiz"; id: string };

// ---- server -> client ----
export interface PlayerState {
  t: "player_state";
  title: string;
  phase: Phase;
  qIndex: number;
  total: number;
  joined: number;
  question?: { text: string; options: string[] };
  myChoice?: number;
  result?: { correct: boolean; points: number; correctIndex: number };
  score: number;
  rank: number;
  final: boolean;
  top3?: LeaderboardRow[];
}
export type PlayerServerMsg =
  | { t: "joined"; playerId: string; token: string; name: string }
  | PlayerState
  | { t: "error"; code: string; msg: string };

export interface AdminState {
  t: "admin_state";
  title: string;
  phase: Phase;
  qIndex: number;
  total: number;
  joined: number;
  connected: number;
  answered: number;
  question: { text: string; options: string[]; correct: number } | null;
  allowed: Command[];
  players: { id: string; name: string; score: number; connected: boolean }[];
  autoClose: boolean;
  joinUrl: string | null;
  quizId: string;
  quizzes: { id: string; title: string; total: number }[];
}
export type AdminServerMsg = { t: "auth_ok" } | AdminState | { t: "error"; code: string; msg: string };

export interface DisplayInit {
  t: "display_init";
  title: string;
  joinUrl: string | null;
  leaderboardEvery: number;
  credit?: string; // optional small footer text on every slide (env CREDIT_TEXT)
  questions: { text: string; options: string[] }[];
}
export interface DisplayState {
  t: "display_state";
  phase: Phase;
  qIndex: number;
  total: number;
  joined: number;
  recent?: string[]; // newest-first names, lobby only
  answered: number;
  counts?: number[];
  correct?: number;
  leaderboard?: LeaderboardRow[];
  final?: boolean;
}
export type DisplayServerMsg = DisplayInit | DisplayState;
