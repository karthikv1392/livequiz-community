import { useEffect, useState } from "react";
import type { PlayerState } from "@livequiz/shared";
import { LETTERS, OPTION_STYLE, ordinal, useSocket } from "../lib/socket";

const KEY = "lq_player";
const load = (): { token?: string; name?: string } => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const save = (v: object | null) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };
const tone = (name: string) => OPTION_STYLE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % OPTION_STYLE.length];

export function App() {
  const [ps, setPs] = useState<PlayerState | null>(null);
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [name, setName] = useState(load().name ?? "");
  const [error, setError] = useState("");
  const [cfg, setCfg] = useState<{ credit: string | null; creditUrl: string | null } | null>(null);
  useEffect(() => { fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {}); }, []);

  const { online, send } = useSocket("player",
    (m) => {
      if (m.t === "joined") { save({ token: m.token, name: m.name }); setMe({ name: m.name }); setError(""); }
      else if (m.t === "player_state") setPs(m);
      else if (m.t === "error") {
        if (m.code === "KICKED") { save(null); setMe(null); setPs(null); }
        if (m.code === "BAD_NAME" || m.code === "ROOM_FULL" || m.code === "KICKED") setError(m.msg);
      }
    },
    (send) => { const s = load(); if (s.token) send({ t: "join", name: s.name ?? "", token: s.token }); },
  );

  const join = () => send({ t: "join", name, token: load().token });
  const credit = cfg?.credit ? (cfg.creditUrl ? <a className="credit" href={cfg.creditUrl} target="_blank" rel="noreferrer">{cfg.credit}</a> : <span className="credit">{cfg.credit}</span>) : null;
  const banner = !online && <div className="banner">Reconnecting…</div>;

  if (!me || !ps) {
    return (<>{banner}{credit}
      <div className="screen center">
        <span className="eyebrow">Live quiz</span>
        <h1>{ps?.title ?? "Join the quiz"}</h1>
        <input className="text" placeholder="Your name" maxLength={20} value={name} autoFocus
          onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && join()} />
        {error && <div style={{ color: "var(--rose-ink)", fontSize: 14 }}>{error}</div>}
        <button className="btn" disabled={!name.trim() || !online} onClick={join}>Join</button>
      </div></>);
  }

  const answer = (choice: number) => send({ t: "answer", qIndex: ps.qIndex, choice });
  let body;
  if (ps.phase === "LOBBY") {
    const t = tone(me.name);
    body = <div className="screen center">
      <div className="avatar" style={{ background: t.bg, color: t.ink }}>{me.name[0].toUpperCase()}</div>
      <h1>Welcome, {me.name}</h1>
      <p className="muted" style={{ margin: 0 }}>You're in. The host will start shortly.</p>
      <span className="pill">{ps.joined} {ps.joined === 1 ? "player" : "players"} here</span></div>;
  } else if (ps.phase === "QUESTION_OPEN" && ps.question) {
    body = (<div className="screen">
      <span className="eyebrow">Question {ps.qIndex + 1} of {ps.total}</span>
      <h2>{ps.question.text}</h2>
      <div className="grid">
        {ps.question.options.map((o, i) => (
          <button key={i} className={`opt ${ps.myChoice === i ? "sel" : ""}`} style={{ background: OPTION_STYLE[i].bg }} onClick={() => answer(i)}>
            <span className="badge" style={{ color: OPTION_STYLE[i].ink }}>{LETTERS[i]}</span><span>{o}</span>
          </button>))}
      </div>
      <p className="muted" style={{ textAlign: "center", margin: 0, fontSize: 14 }}>{ps.myChoice === undefined ? "Choose one answer" : "Answer saved. You can change it until the host closes the question."}</p>
    </div>);
  } else if (ps.phase === "QUESTION_CLOSED" && ps.question) {
    const r = ps.result!, answered = ps.myChoice !== undefined;
    body = (<div className="screen center">
      <div className={`badge-lg ${!answered ? "none" : r.correct ? "ok" : "bad"}`}>{!answered ? "–" : r.correct ? "✓" : "✕"}</div>
      <h1>{!answered ? "No answer" : r.correct ? `Correct  +${r.points}` : "Not quite"}</h1>
      <p className="muted" style={{ margin: 0 }}>Answer: {LETTERS[r.correctIndex]}. {ps.question.options[r.correctIndex]}</p>
      <p className="score">Score <b>{ps.score}</b> · Rank <b>{ordinal(ps.rank)}</b> of {ps.joined}</p>
      <span className="eyebrow">Eyes on the screen</span>
    </div>);
  } else {
    body = (<div className="screen center">
      <span className="eyebrow">{ps.final ? "Final result" : "Standings"}</span>
      <div className="big">{ordinal(ps.rank)}</div>
      <p className="score" style={{ margin: 0 }}><b>{ps.score}</b> points · {ps.joined} players</p>
      {ps.top3 && <div style={{ width: "100%", display: "grid", gap: 8, marginTop: 8 }}>
        {ps.top3.map((r) => <div className="row" key={r.id}><span><span className="muted" style={{ marginRight: 10 }}>{r.rank}</span>{r.name}</span><b>{r.score}</b></div>)}</div>}
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>{ps.final ? "Thank you for playing." : "Next question coming up."}</p>
    </div>);
  }
  return <>{banner}{body}{credit}</>;
}
