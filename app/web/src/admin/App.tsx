import { useEffect, useState } from "react";
import type { AdminState, Command } from "@livequiz/shared";
import { LETTERS, useSocket } from "../lib/socket";

const KEY = "lq_pin";
const initialPin = () => {
  const h = new URLSearchParams(location.hash.slice(1)).get("pin");
  if (h) { try { localStorage.setItem(KEY, h); } catch {} history.replaceState(null, "", location.pathname); return h; }
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
};

const LABEL = (a: AdminState): Record<string, string> => ({
  start: "Start quiz", close: "Close & reveal",
  next: a.phase === "LEADERBOARD" ? "Next question" : "Show leaderboard",
});

export function App() {
  const [pin, setPin] = useState(initialPin);
  const [input, setInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [st, setSt] = useState<AdminState | null>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);

  const { online, send } = useSocket("admin",
    (m) => {
      if (m.t === "auth_ok") { setAuthed(true); setError(""); }
      else if (m.t === "admin_state") setSt(m);
      else if (m.t === "error") { setError(m.msg); if (m.code === "AUTH") { setAuthed(false); try { localStorage.removeItem(KEY); } catch {} setPin(""); } }
    },
    (send) => { if (pin) send({ t: "auth", pin }); },
  );

  // keep the phone awake while presenting
  useEffect(() => {
    let lock: any;
    const req = () => (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    req(); const f = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", f);
    return () => { document.removeEventListener("visibilitychange", f); lock?.release?.(); };
  }, []);

  const cmd = (name: Command) => {
    if (name === "reset" && !confirm("Reset the session? This removes all players and scores.")) return;
    send({ t: "cmd", name });
  };

  if (!authed || !st) {
    return (<div className="screen center">
      <span className="eyebrow">Host</span><h1>Admin</h1>
      <input className="text" inputMode="numeric" placeholder="PIN" value={input} onChange={(e) => setInput(e.target.value)} />
      {error && <div style={{ color: "var(--bad)" }}>{error}</div>}
      <button className="btn" disabled={!online || !input}
        onClick={() => { try { localStorage.setItem(KEY, input); } catch {} setPin(input); send({ t: "auth", pin: input }); }}>Unlock</button>
    </div>);
  }

  const primary = st.allowed.find((c) => c !== "reset");
  const label = LABEL(st);
  const phaseName = { LOBBY: "Lobby", QUESTION_OPEN: "Question open", QUESTION_CLOSED: "Results", LEADERBOARD: "Leaderboard" }[st.phase];

  return (<>
    {!online && <div className="banner">Reconnecting…</div>}
    <div className="screen">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pill">{phaseName}{st.phase !== "LOBBY" && ` · Q${st.qIndex + 1}/${st.total}`}</span>
        <button className="btn ghost" onClick={() => setDrawer(!drawer)}>Players</button>
      </div>
      <div className="stat">
        <div><b>{st.joined}</b>joined</div>
        <div><b>{st.phase === "QUESTION_OPEN" || st.phase === "QUESTION_CLOSED" ? `${st.answered}/${st.joined}` : "–"}</b>answered</div>
      </div>

      {st.question && (<div style={{ display: "grid", gap: 8 }}>
        <h2>{st.question.text}</h2>
        {st.question.options.map((o, i) => <div key={i} className={`opt-prev ${i === st.question!.correct ? "right" : ""}`}><b>{LETTERS[i]}</b> <span>{o}</span> {i === st.question!.correct && <span style={{ marginLeft: "auto" }}>✓</span>}</div>)}
      </div>)}
      {st.phase === "LOBBY" && st.quizzes.length > 1 && (<div style={{ display: "grid", gap: 8 }}>
        <span className="eyebrow">Quiz</span>
        {st.quizzes.map((q) => (<button key={q.id} className="row" style={{ textAlign: "left", cursor: "pointer", borderColor: q.id === st.quizId ? "var(--ink)" : undefined }}
          onClick={() => q.id !== st.quizId && send({ t: "select_quiz", id: q.id })}>
          <span>{q.title}</span><span className="muted">{q.total} questions{q.id === st.quizId ? " · selected" : ""}</span>
        </button>))}
      </div>)}
      {st.phase === "LOBBY" && <p className="muted">Players are joining by QR on the presentation screen. Press Start when ready. <a href="/create" style={{ color: "inherit" }}>Create or edit quizzes</a></p>}

      {drawer && (<div style={{ display: "grid", gap: 8 }}>
        {st.players.map((p) => (<div className="row" key={p.id}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 10, background: p.connected ? "var(--sage-ink)" : "var(--line)" }} />{p.name}</span><span>{p.score}
            <button className="btn ghost" style={{ marginLeft: 10, padding: "3px 10px" }} onClick={() => confirm(`Remove ${p.name}?`) && send({ t: "kick", playerId: p.id })}>✕</button></span>
        </div>))}
        {!st.players.length && <p className="muted">No players yet.</p>}
      </div>)}

      <label className="row" style={{ marginTop: "auto" }}>
        <span>Auto-close when everyone has answered</span>
        <input type="checkbox" checked={st.autoClose} onChange={(e) => send({ t: "set", key: "autoClose", value: e.target.checked })} />
      </label>
      <div className="admin-bottom">
        {primary ? <button className="btn primary" onClick={() => cmd(primary)}>{label[primary]}</button>
          : st.phase === "LEADERBOARD" ? <div className="muted" style={{ textAlign: "center" }}>That's the final leaderboard.{st.quizzes.length > 1 && " Reset to run another quiz."}</div> : null}
        {st.allowed.includes("reset") && <button className="btn danger" onClick={() => cmd("reset")}>Reset session</button>}
      </div>
    </div>
  </>);
}
