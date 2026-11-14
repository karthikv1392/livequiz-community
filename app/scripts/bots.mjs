// Headless end-to-end load test: N bots + admin + display run a full quiz.
// Usage: node scripts/bots.mjs [players=75] [host=localhost:3000] [pin]
import WebSocket from "ws";
const N = Number(process.argv[2] ?? 75), HOST = process.argv[3] ?? "localhost:3000", PIN = process.argv[4] ?? process.env.ADMIN_PIN;
const SCHEME = HOST.startsWith("localhost") || /^\d/.test(HOST) ? "ws" : "wss"; // remote hosts are served over https/wss
const open = (role) => new Promise((res) => { const ws = new WebSocket(`${SCHEME}://${HOST}/ws?role=${role}`); ws.on("open", () => res(ws)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } else console.log("ok  ", m); };

const K = SCHEME === "wss" ? 4 : 1; // remote hosts need more time for state to arrive
const display = await open("display"); let dstate; display.on("message", (m) => { const j = JSON.parse(m); if (j.t === "display_state") dstate = j; });
const admin = await open("admin"); let astate; admin.on("message", (m) => { const j = JSON.parse(m); if (j.t === "admin_state") astate = j; });
admin.send(JSON.stringify({ t: "auth", pin: PIN })); await sleep(200 * K);
const cmd = async (name) => { admin.send(JSON.stringify({ t: "cmd", name })); await sleep(300 * K); };
await cmd("reset");

const bots = [];
for (let i = 0; i < N; i++) {
  const ws = await open("player"); const b = { ws, i, ps: null };
  ws.on("message", (m) => { const j = JSON.parse(m); if (j.t === "player_state") b.ps = j; });
  ws.send(JSON.stringify({ t: "join", name: `Bot${i}` })); bots.push(b);
}
await sleep(500 * K);
assert(dstate.joined === N, `display shows ${N} joined (got ${dstate.joined})`);

await cmd("start"); assert(dstate.phase === "QUESTION_OPEN" && dstate.counts === undefined, "Q1 open, counts hidden");
const late = await open("player"); late.on("message", (m) => { const j = JSON.parse(m); if (j.t === "player_state") late.ps = j; });
late.send(JSON.stringify({ t: "join", name: "Latecomer" })); await sleep(300 * K);
assert(late.ps?.question, "late joiner sees open question");
assert(!JSON.stringify(late.ps).includes('"correct"'), "open question does not leak the answer");

const total = astate.total; let q = 0;
for (;;) {
  const idx = astate.qIndex;
  bots.forEach((b) => b.ws.send(JSON.stringify({ t: "answer", qIndex: idx, choice: (b.i % 3 === 0) ? 1 : 0 })));
  await sleep(500 * K);
  assert(dstate.answered === N, `Q${idx + 1}: answered ${dstate.answered}/${N}`);
  await cmd("close"); assert(dstate.counts?.reduce((a, b) => a + b) === N, `Q${idx + 1}: counts revealed after close`);
  await cmd("next"); assert(dstate.phase === "LEADERBOARD", `leaderboard after Q${idx + 1}`);
  if (idx === total - 1) break;
  await cmd("next"); assert(dstate.phase === "QUESTION_OPEN", `Q${idx + 2} open`);
}
assert(dstate.final && dstate.leaderboard.length === 10, "final leaderboard has top 10");
console.log("top3:", dstate.leaderboard.slice(0, 3).map((r) => `${r.name}:${r.score}`).join(", "));
await sleep(200 * K); assert(bots[0].ps.rank > 0 && bots[0].ps.final, "player sees own rank on final");
console.log("ALL GOOD"); process.exit(0);
