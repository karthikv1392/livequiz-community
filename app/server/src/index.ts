import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { WebSocketServer, type WebSocket } from "ws";
import {
  addPlayer, allAnswered, command, createSession, findByToken, leaderboard, removePlayer, submitAnswer,
  type AdminMsg, type PlayerMsg, type Session,
} from "@livequiz/shared";
import { adminView, displayInit, displayView, playerView } from "./views";
import { lanUrl } from "./net";
import { QUIZ_ID, deleteQuizFile, loadQuizzes, saveQuizFile, parseQuiz, type QuizEntry } from "./quizzes";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PIN = process.env.ADMIN_PIN ?? String(100000 + (randomBytes(3).readUIntBE(0, 3) % 900000));
const QUIZZES_DIR = path.resolve(process.env.QUIZZES_DIR ?? path.join(root, "quizzes"));
const QUESTIONS_FILE = process.env.QUESTIONS_FILE ? path.resolve(process.env.QUESTIONS_FILE) : undefined; // optional: force a single quiz file
const CREDIT_TEXT = (process.env.CREDIT_TEXT ?? "").trim();
const CREDIT_URL = (process.env.CREDIT_URL ?? "").trim();
const SNAPSHOT = path.resolve(process.env.SNAPSHOT_PATH ?? path.join(root, "data/session.json"));
const DIST = path.join(root, "web/dist");


const quizzes: QuizEntry[] = loadQuizzes(QUIZZES_DIR, QUESTIONS_FILE);
let quizId = (quizzes.find((q) => q.id === process.env.DEFAULT_QUIZ) ?? quizzes[0]).id;
let cfg = quizzes.find((q) => q.id === quizId)!.cfg;
let session: Session = restore() ?? createSession(process.env.AUTO_CLOSE_ALL_ANSWERED === "true");
// PUBLIC_URL overrides the LAN address used in the QR code.
let publicUrl: string | null = process.env.PUBLIC_URL ?? null;

// ---------- snapshot ----------
function restore(): Session | null {
  try {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
    const s = (raw.session ?? raw) as Session;
    const saved = quizzes.find((q) => q.id === raw.quizId);
    if (saved) { quizId = saved.id; cfg = saved.cfg; }
    if (s.qIndex >= cfg.questions.length) return null;
    for (const p of Object.values(s.players)) p.connected = false;
    console.log(`Restored session (${Object.keys(s.players).length} players, phase ${s.phase})`);
    return s;
  } catch { return null; }
}
let snapTimer: NodeJS.Timeout | undefined;
function snapshot() {
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true }); fs.writeFileSync(SNAPSHOT, JSON.stringify({ quizId, session })); } catch (e) { console.error("snapshot failed", e); }
  }, 250);
}

// ---------- http ----------
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2" };
const PAGES: Record<string, string> = { "/join": "join.html", "/present": "present.html", "/admin": "admin.html", "/create": "create.html" };
const joinUrl = () => (publicUrl ? `${publicUrl}/join` : null);
const di = () => displayInit(cfg, joinUrl(), CREDIT_TEXT);
const av = () => adminView(session, cfg, joinUrl(), quizId, quizzes.map((q) => ({ id: q.id, title: q.cfg.title, total: q.cfg.questions.length })));


// ---------- quiz builder API (admin PIN required) ----------
let pinFails = 0, blockedUntil = 0;
const json = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
const readBody = (req: http.IncomingMessage, limit = 1_000_000) => new Promise<string>((resolve, reject) => {
  let n = 0; const parts: Buffer[] = [];
  req.on("data", (c: Buffer) => { n += c.length; if (n > limit) { reject(new Error("Quiz file is too large")); req.destroy(); } else parts.push(c); });
  req.on("end", () => resolve(Buffer.concat(parts).toString("utf8"))); req.on("error", reject);
});

async function quizApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
  if (Date.now() < blockedUntil) return json(res, 429, { error: "Too many attempts, wait a minute" });
  if (req.headers["x-admin-pin"] !== ADMIN_PIN) { if (++pinFails >= 10) { blockedUntil = Date.now() + 60_000; pinFails = 0; } return json(res, 401, { error: "Wrong PIN" }); }
  const id = decodeURIComponent(pathname.slice("/api/quizzes".length).replace(/^\//, ""));
  if (req.method === "GET" && !id) return json(res, 200, { active: quizId, quizzes: quizzes.map((q) => ({ id: q.id, raw: q.raw })) });
  if (!QUIZ_ID.test(id)) return json(res, 400, { error: "Invalid quiz id (use lowercase letters, numbers, - and _)" });
  if (req.method === "PUT") {
    let entry: QuizEntry;
    try { entry = parseQuiz(id, await readBody(req)); } catch (e) { return json(res, 400, { error: (e as Error).message }); }
    if (id === quizId && session.phase !== "LOBBY") return json(res, 409, { error: "This quiz is running. Reset the session in the host console first." });
    saveQuizFile(QUIZZES_DIR, id, entry.raw);
    const at = quizzes.findIndex((q) => q.id === id);
    if (at >= 0) quizzes[at] = entry; else quizzes.push(entry);
    quizzes.sort((a, b) => a.id.localeCompare(b.id));
    if (id === quizId) { cfg = entry.cfg; for (const c of clients) if (c.role === "display") send(c, di()); }
    changed();
    return json(res, 200, { id, file: `${path.basename(QUIZZES_DIR)}/${id}.json` });
  }
  if (req.method === "DELETE") {
    if (id === quizId) return json(res, 409, { error: "This quiz is selected in the host console. Select another one first." });
    if (quizzes.length <= 1) return json(res, 409, { error: "Keep at least one quiz." });
    deleteQuizFile(QUIZZES_DIR, id);
    const at = quizzes.findIndex((q) => q.id === id);
    if (at >= 0) quizzes.splice(at, 1);
    changed();
    return json(res, 200, { ok: true });
  }
  json(res, 405, { error: "Method not allowed" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/") { res.writeHead(302, { Location: "/join" }); return res.end(); }
  if (url.pathname === "/api/health") { res.writeHead(200); return res.end("ok"); }
  if (url.pathname === "/api/config") return json(res, 200, { credit: CREDIT_TEXT || null, creditUrl: CREDIT_URL || null });
  if (url.pathname === "/api/quizzes" || url.pathname.startsWith("/api/quizzes/")) return quizApi(req, res, url.pathname).catch((e) => json(res, 500, { error: String(e?.message ?? e) }));
  if (url.pathname === "/api/qr") {
    const target = url.searchParams.get("target") === "join" || !url.searchParams.get("target") ? joinUrl() : null;
    if (!target) { res.writeHead(503); return res.end("public URL not ready"); }
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    return res.end(await QRCode.toString(target, { type: "svg", margin: 1, color: { dark: "#0b1020", light: "#ffffff" } }));
  }
  const rel = PAGES[url.pathname] ?? url.pathname.slice(1);
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("Not found (did you run `npm run build`?)"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

// ---------- websocket ----------
interface Client { ws: WebSocket; role: "player" | "admin" | "display"; playerId?: string; authed?: boolean; fails: number; budget: number }
const clients = new Set<Client>();
const send = (c: Client, m: unknown) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(m));

function pushPlayer(c: Client, lb?: ReturnType<typeof leaderboard>) {
  const p = c.playerId && session.players[c.playerId];
  if (p) send(c, playerView(session, cfg, p, lb));
}
function pushAll() {
  const lbRows = leaderboard(session);
  for (const c of clients) {
    if (c.role === "player") pushPlayer(c, lbRows);
    else if (c.role === "admin" && c.authed) send(c, av());
    else if (c.role === "display") send(c, displayView(session, cfg));
  }
}

// answers/joins arrive in bursts: coalesce updates to admin + display
let liveTimer: NodeJS.Timeout | undefined;
function pushLive() {
  if (liveTimer) return;
  liveTimer = setTimeout(() => {
    liveTimer = undefined;
    for (const c of clients) {
      if (c.role === "admin" && c.authed) send(c, av());
      else if (c.role === "display") send(c, displayView(session, cfg));
    }
  }, 150);
}
const changed = () => { snapshot(); pushAll(); };

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const role = new URL(req.url ?? "", "http://x").searchParams.get("role");
  if (role !== "player" && role !== "admin" && role !== "display") return ws.close();
  const c: Client = { ws, role, fails: 0, budget: 30 };
  clients.add(c);
  const refill = setInterval(() => (c.budget = 30), 1000);
  if (role === "display") { send(c, di()); send(c, displayView(session, cfg)); }

  ws.on("message", (raw) => {
    if (--c.budget < 0) return send(c, { t: "error", code: "RATE_LIMIT", msg: "Slow down" });
    let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
    const now = Date.now();
    if (c.role === "player") onPlayer(c, m as PlayerMsg, now);
    else if (c.role === "admin") onAdmin(c, m as AdminMsg, now);
  });
  ws.on("close", () => {
    clearInterval(refill); clients.delete(c);
    const p = c.playerId && session.players[c.playerId];
    if (p && ![...clients].some((o) => o.playerId === p.id)) { p.connected = false; pushLive(); }
  });
});

function onPlayer(c: Client, m: PlayerMsg, now: number) {
  if (m.t === "join") {
    let p = findByToken(session, m.token);
    if (!p) {
      const r = addPlayer(session, String(m.name ?? ""), now);
      if (!r.ok) return send(c, { t: "error", code: r.code, msg: r.msg });
      p = r.value;
    }
    p.connected = true; c.playerId = p.id;
    send(c, { t: "joined", playerId: p.id, token: p.token, name: p.name });
    pushPlayer(c); snapshot(); pushLive();
  } else if (m.t === "answer" && c.playerId) {
    const r = submitAnswer(session, cfg, c.playerId, Number(m.qIndex), Number(m.choice), now);
    if (!r.ok) { send(c, { t: "error", code: r.code, msg: r.msg }); return pushPlayer(c); }
    if (session.autoClose && allAnswered(session)) { command(session, cfg, "close", now); return changed(); }
    pushPlayer(c); snapshot(); pushLive();
  }
}

function onAdmin(c: Client, m: AdminMsg, now: number) {
  if (m.t === "auth") {
    if (c.fails >= 5) return send(c, { t: "error", code: "AUTH", msg: "Too many attempts" });
    if (m.pin === ADMIN_PIN) { c.authed = true; send(c, { t: "auth_ok" }); return send(c, av()); }
    c.fails++; return send(c, { t: "error", code: "AUTH", msg: "Wrong PIN" });
  }
  if (!c.authed) return send(c, { t: "error", code: "AUTH", msg: "Not authenticated" });
  if (m.t === "cmd") {
    const r = command(session, cfg, m.name, now);
    if (!r.ok) return send(c, { t: "error", code: r.code, msg: r.msg });
    changed();
  } else if (m.t === "kick") {
    for (const o of clients) if (o.playerId === m.playerId) { send(o, { t: "error", code: "KICKED", msg: "Removed by host" }); o.ws.close(); }
    removePlayer(session, m.playerId); changed();
  } else if (m.t === "set" && m.key === "autoClose") { session.autoClose = !!m.value; changed(); }
  else if (m.t === "select_quiz") {
    const q = quizzes.find((x) => x.id === m.id);
    if (!q) return send(c, { t: "error", code: "NO_QUIZ", msg: "Unknown quiz" });
    if (session.phase !== "LOBBY") return send(c, { t: "error", code: "BAD_PHASE", msg: "Reset the session to switch quiz" });
    quizId = q.id; cfg = q.cfg;
    for (const o of clients) if (o.role === "display") send(o, di());
    changed();
  }
}

setInterval(() => { for (const c of clients) c.ws.ping(); }, 20000);

// ---------- start ----------
function announce() {
  const url = publicUrl ?? lanUrl(PORT);
  console.log(`\n  Quizzes:  ${quizzes.map((q) => `${q.cfg.title} (${q.cfg.questions.length}q)`).join(" · ")}   [selected: ${cfg.title}]`);
  console.log(`  Present:  ${url}/present   (open on the projector laptop)`);
  console.log(`  Join:     ${url}/join`);
  console.log(`  Admin:    ${url}/admin   PIN ${ADMIN_PIN}`);
  console.log(`  Create:   ${url}/create   (build or edit quizzes, same PIN)`);
  console.log("\n  Scan with your phone to open the admin console:");
  QRCode.toString(`${url}/admin#pin=${ADMIN_PIN}`, { type: "terminal", small: true }, (_e, qr) => console.log(qr));
}
server.listen(PORT, async () => {
  console.log(`LiveQuiz server on http://localhost:${PORT}`);
  if (!fs.existsSync(DIST)) console.warn("  ! web/dist missing: run `npm run build` (or use `npm run dev:web` for development)");
  publicUrl ??= lanUrl(PORT);
  for (const c of clients) if (c.role === "display") send(c, di());
  announce();
});
process.on("SIGINT", () => process.exit(0));
