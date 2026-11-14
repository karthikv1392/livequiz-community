// Dev helper: join a few named bots and hold the connections. node scripts/few.mjs [host]
import WebSocket from "ws";
const host = process.argv[2] ?? "localhost:3000";
for (const n of ["Asha", "Ben", "Chitra", "Dev", "Elena", "Farid", "Gita"]) {
  const ws = new WebSocket(`ws://${host}/ws?role=player`);
  ws.on("open", () => ws.send(JSON.stringify({ t: "join", name: n })));
  ws.on("message", (m) => { const j = JSON.parse(m); if (j.t === "player_state" && j.phase === "QUESTION_OPEN" && j.myChoice === undefined) ws.send(JSON.stringify({ t: "answer", qIndex: j.qIndex, choice: n.length % 4 })); });
}
setTimeout(() => process.exit(0), 600000);
