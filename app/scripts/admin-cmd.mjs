// Dev helper: node scripts/admin-cmd.mjs <pin> <cmd> [host]
import WebSocket from "ws";
const [pin, cmd, host = "localhost:3000"] = process.argv.slice(2);
const ws = new WebSocket(`ws://${host}/ws?role=admin`);
ws.on("open", () => { ws.send(JSON.stringify({ t: "auth", pin })); setTimeout(() => { ws.send(JSON.stringify({ t: "cmd", name: cmd })); setTimeout(() => process.exit(0), 300); }, 200); });
ws.on("message", (m) => { const j = JSON.parse(m); if (j.t === "error") console.log(j.msg); });
