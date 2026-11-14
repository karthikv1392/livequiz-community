import { useEffect, useMemo, useRef, useState } from "react";
import { LETTERS, OPTION_STYLE } from "../lib/socket";
import { MAX_OPTIONS, MIN_OPTIONS, blankDraft, blankQuestion, fromRaw, problems, slug, toRaw, uniqueId, type Draft, type QDraft } from "./draft";

const PIN_KEY = "lq_pin";
const readPin = () => {
  const h = new URLSearchParams(location.hash.slice(1)).get("pin");
  if (h) { try { localStorage.setItem(PIN_KEY, h); } catch {} history.replaceState(null, "", location.pathname); return h; }
  try { return localStorage.getItem(PIN_KEY) ?? ""; } catch { return ""; }
};

interface Stored { id: string; raw: any }

export function App() {
  const [pin, setPin] = useState(readPin);
  const [pinInput, setPinInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [quizzes, setQuizzes] = useState<Stored[]>([]);
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const api = async (path: string, init: RequestInit = {}, withPin = pin) => {
    const r = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), "x-admin-pin": withPin } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error ?? `Request failed (${r.status})`), { status: r.status });
    return body;
  };

  const load = async (withPin = pin) => {
    try {
      const b = await api("/api/quizzes", {}, withPin);
      setQuizzes(b.quizzes); setActive(b.active); setAuthed(true);
      try { localStorage.setItem(PIN_KEY, withPin); } catch {}
    } catch (e: any) {
      setAuthed(false);
      if (e.status === 401 || e.status === 429) { setMsg({ kind: "err", text: e.message }); try { localStorage.removeItem(PIN_KEY); } catch {} }
      else setMsg({ kind: "err", text: e.message });
    }
  };
  useEffect(() => { if (pin) load(pin); }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const issues = useMemo(() => (draft ? problems(draft) : []), [draft]);
  const confirmDiscard = () => !dirty || confirm("Discard your unsaved changes?");
  const edit = (fn: (d: Draft) => Draft) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); setMsg(null); };
  const patchQ = (i: number, fn: (q: QDraft) => QDraft) => edit((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? fn(q) : q)) }));

  const open = (d: Draft) => { if (!confirmDiscard()) return; setDraft(d); setDirty(false); setMsg(null); window.scrollTo({ top: 0 }); };

  const save = async () => {
    if (!draft || issues.length) return;
    const id = draft.id ?? uniqueId(slug(draft.title), quizzes.map((q) => q.id));
    setBusy(true);
    try {
      const r = await api(`/api/quizzes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(toRaw(draft)) });
      setDraft({ ...draft, id }); setDirty(false);
      setMsg({ kind: "ok", text: `Saved as ${r.file}. Open the host console to run it.` });
      await load();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  };

  const remove = async () => {
    if (!draft?.id || !confirm(`Delete "${draft.title}"? This removes its file.`)) return;
    setBusy(true);
    try { await api(`/api/quizzes/${encodeURIComponent(draft.id)}`, { method: "DELETE" }); setDraft(null); setDirty(false); setMsg({ kind: "ok", text: "Quiz deleted." }); await load(); }
    catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    setBusy(false);
  };

  const download = () => {
    if (!draft) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(toRaw(draft), null, 2) + "\n"], { type: "application/json" }));
    a.download = `${draft.id ?? slug(draft.title)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };

  const importText = (text: string) => {
    try { open(fromRaw(null, JSON.parse(text))); setDirty(true); setShowPaste(false); setPaste(""); setMsg({ kind: "ok", text: "Imported. Check the questions, then Save." }); }
    catch (e: any) { setMsg({ kind: "err", text: `Could not import: ${e.message}` }); }
  };

  const move = (i: number, by: -1 | 1) => edit((d) => {
    const qs = d.questions.slice(), j = i + by;
    if (j < 0 || j >= qs.length) return d;
    [qs[i], qs[j]] = [qs[j], qs[i]]; return { ...d, questions: qs };
  });

  if (!authed) {
    return (<div className="builder narrow">
      <span className="eyebrow">Quiz builder</span><h1>Enter the host PIN</h1>
      <p className="muted">It is printed in the terminal where the server runs.</p>
      <input className="text" inputMode="numeric" placeholder="PIN" value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pinInput && (setPin(pinInput), load(pinInput))} />
      {msg && <div className="note err">{msg.text}</div>}
      <button className="btn" disabled={!pinInput} onClick={() => { setPin(pinInput); load(pinInput); }}>Unlock</button>
    </div>);
  }

  return (<div className="builder">
    <header className="b-head">
      <div><span className="eyebrow">Quiz builder</span><h1>{draft ? (draft.id ? "Edit quiz" : "New quiz") : "Your quizzes"}</h1></div>
      <a className="btn ghost" href="/admin" onClick={(e) => !confirmDiscard() && e.preventDefault()}>Host console</a>
    </header>

    {msg && <div className={`note ${msg.kind}`}>{msg.text}{msg.kind === "ok" && msg.text.startsWith("Saved") && <> <a href="/admin">Open host console</a></>}</div>}

    {!draft && (<>
      <div className="b-actions">
        <button className="btn" onClick={() => open(blankDraft())}>New quiz</button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import JSON file</button>
        <button className="btn ghost" onClick={() => setShowPaste(!showPaste)}>Paste JSON</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importText(await f.text()); }} />
      </div>
      {showPaste && (<div className="card stack">
        <textarea className="area mono" rows={8} placeholder='Paste quiz JSON here. Our format, or {"quizTitle": "...", "questions": [{"question": "...", "options": ["A. ...", "B. ..."], "correctAnswer": "B"}]}' value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn" disabled={!paste.trim()} onClick={() => importText(paste)}>Import</button>
      </div>)}
      <div className="stack">
        {quizzes.map((q) => (<button key={q.id} className="qrow" onClick={() => open(fromRaw(q.id, q.raw))}>
          <span><b>{q.raw.title}</b><span className="muted"> · {q.raw.questions.length} questions{q.id === active ? " · selected in host console" : ""}</span></span>
          <span className="muted">Edit</span>
        </button>))}
        {!quizzes.length && <p className="muted">No quizzes yet.</p>}
      </div>
      <p className="muted small">Quizzes are saved as JSON files in the <code>quizzes</code> folder, so you can also copy them, share them, or keep them in git.</p>
    </>)}

    {draft && (<>
      <div className="card stack">
        <label className="field"><span className="eyebrow">Quiz name</span>
          <input className="in" value={draft.title} placeholder="e.g. Friday Trivia" maxLength={80} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} /></label>
        <div className="two">
          <label className="field"><span className="eyebrow">Default points</span>
            <input className="in" inputMode="numeric" value={draft.points} onChange={(e) => edit((d) => ({ ...d, points: e.target.value.replace(/\D/g, "") }))} /></label>
          <label className="field"><span className="eyebrow">Leaderboard every</span>
            <input className="in" inputMode="numeric" value={draft.every} onChange={(e) => edit((d) => ({ ...d, every: e.target.value.replace(/\D/g, "") }))} />
            <span className="muted small">questions (1 = after each)</span></label>
        </div>
      </div>

      {draft.questions.map((q, i) => (
        <div className="card stack" key={q.key}>
          <div className="q-head">
            <span className="eyebrow">Question {i + 1}</span>
            <span className="q-tools">
              <button className="icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="icon" title="Move down" disabled={i === draft.questions.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="icon" title="Duplicate" onClick={() => edit((d) => ({ ...d, questions: [...d.questions.slice(0, i + 1), { ...q, key: Date.now() + i, options: [...q.options] }, ...d.questions.slice(i + 1)] }))}>⧉</button>
              <button className="icon" title="Delete question" onClick={() => edit((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}>✕</button>
            </span>
          </div>
          <textarea className="area" rows={2} placeholder="Type the question" value={q.text} onChange={(e) => patchQ(i, (x) => ({ ...x, text: e.target.value }))} />
          <div className="stack tight">
            {q.options.map((o, k) => (
              <div className="orow" key={k}>
                <button type="button" className={`letter ${q.correct === k ? "on" : ""}`} aria-pressed={q.correct === k} title="Mark as the correct answer"
                  style={{ background: q.correct === k ? undefined : OPTION_STYLE[k].bg, color: q.correct === k ? undefined : OPTION_STYLE[k].ink }}
                  onClick={() => patchQ(i, (x) => ({ ...x, correct: k }))}>{q.correct === k ? "✓" : LETTERS[k]}</button>
                <input className="in" value={o} placeholder={`Option ${LETTERS[k]}`} onChange={(e) => patchQ(i, (x) => ({ ...x, options: x.options.map((v, j) => (j === k ? e.target.value : v)) }))} />
                <button className="icon" title="Remove option" disabled={q.options.length <= MIN_OPTIONS}
                  onClick={() => patchQ(i, (x) => ({ ...x, options: x.options.filter((_, j) => j !== k), correct: x.correct === null ? null : x.correct === k ? null : x.correct > k ? x.correct - 1 : x.correct }))}>✕</button>
              </div>))}
          </div>
          <div className="q-foot">
            <button className="btn ghost" disabled={q.options.length >= MAX_OPTIONS} onClick={() => patchQ(i, (x) => ({ ...x, options: [...x.options, ""] }))}>Add option</button>
            <label className="pts"><span className="muted small">Points</span>
              <input className="in sm" inputMode="numeric" placeholder={draft.points || "1000"} value={q.points} onChange={(e) => patchQ(i, (x) => ({ ...x, points: e.target.value.replace(/\D/g, "") }))} /></label>
          </div>
          <span className="muted small">Tap a letter to mark the correct answer.</span>
        </div>
      ))}

      <button className="btn ghost wide" onClick={() => edit((d) => ({ ...d, questions: [...d.questions, blankQuestion()] }))}>Add question</button>

      <div className="savebar">
        {issues.length > 0 && <div className="muted small">{issues[0]}{issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}</div>}
        <div className="b-actions">
          <button className="btn" disabled={busy || issues.length > 0 || (!dirty && !!draft.id)} onClick={save}>{busy ? "Saving…" : dirty || !draft.id ? "Save quiz" : "Saved"}</button>
          <button className="btn ghost" disabled={issues.length > 0} onClick={download}>Download JSON</button>
          <button className="btn ghost" onClick={() => { if (confirmDiscard()) { setDraft(null); setDirty(false); } }}>Close</button>
          {draft.id && <button className="btn danger" disabled={busy} onClick={remove}>Delete</button>}
        </div>
      </div>
    </>)}
  </div>);
}
