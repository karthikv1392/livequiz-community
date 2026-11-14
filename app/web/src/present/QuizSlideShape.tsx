import { HTMLContainer, Rectangle2d, ShapeUtil, T, type TLBaseShape } from "tldraw";
import { LETTERS, OPTION_STYLE } from "../lib/socket";
import { SLIDE_H, SLIDE_W } from "./slides";

export type QuizSlideShape = TLBaseShape<"quiz-slide", { w: number; h: number; data: any }>;

export class QuizSlideUtil extends ShapeUtil<QuizSlideShape> {
  static override type = "quiz-slide" as const;
  static override props = { w: T.number, h: T.number, data: T.jsonValue };

  getDefaultProps(): QuizSlideShape["props"] { return { w: SLIDE_W, h: SLIDE_H, data: {} }; }
  getGeometry(s: QuizSlideShape) { return new Rectangle2d({ width: s.props.w, height: s.props.h, isFilled: true }); }
  override canResize = () => false;
  override canEdit = () => false;
  override hideSelectionBoundsFg = () => true;
  override hideSelectionBoundsBg = () => true;

  component(s: QuizSlideShape) {
    return (
      <HTMLContainer style={{ width: s.props.w, height: s.props.h, pointerEvents: "none" }}>
        <Slide d={s.props.data} />
        {s.props.data.credit && <div className="credit">{s.props.data.credit}</div>}
      </HTMLContainer>
    );
  }
  indicator() { return null; }
}

const host = (u?: string | null) => u?.replace(/^https?:\/\//, "") ?? "";
const Qr = () => <img className="qr" src={`/api/qr?t=${Date.now() % 1e6}`} alt="Scan to join" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />;
const Badge = ({ i }: { i: number }) => <span className="lbadge" style={{ color: OPTION_STYLE[i].ink }}>{LETTERS[i]}</span>;
const Plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Long questions/options (like exam-style MCQs) get smaller type so they always fit the 1920x1080 slide. */
const fit = (d: any) => {
  const q = String(d.text ?? "").length, o = Math.max(0, ...(d.options ?? []).map((x: string) => x.length));
  return `${q > 260 ? "q-xs" : q > 170 ? "q-sm" : q > 100 ? "q-md" : ""} ${o > 70 ? "o-xs" : o > 40 ? "o-sm" : ""}`;
};

function Slide({ d }: { d: any }) {
  if (d.kind === "lobby") return (
    <div className="slide lobby">
      <div className="lobby-text">
        <span className="eyebrow">Live quiz</span>
        <h1 className={d.title.length > 26 ? "long" : ""}>{d.title}</h1>
        <div className="rule" />
        <div className="count"><b key={d.joined} className="tick">{d.joined}</b><span>{d.joined === 1 ? "player" : "players"} joined</span></div>
        <div className="chips">{(d.recent ?? []).map((n: string, i: number) => <span key={n} className="namechip" style={{ background: OPTION_STYLE[i % 6].bg, color: OPTION_STYLE[i % 6].ink }}>{n}</span>)}</div>
      </div>
      <div className="joincard">
        <div className="qrbox">{d.joinUrl ? <Qr key={d.joinUrl} /> : <span className="eyebrow">Preparing…</span>}</div>
        <div className="eyebrow">Scan to join</div>
        <div className="url">{host(d.joinUrl)}</div>
      </div>
    </div>
  );

  if (d.kind === "question") return (
    <div className={`slide ${fit(d)}`}>
      <div className="topbar"><span className="eyebrow">Question {d.index + 1} of {d.total}</span><span className="eyebrow">{Plural(d.joined, "player")}</span></div>
      <h2 className="qtext">{d.text}</h2>
      <div className={`opts n${d.options.length}`}>
        {d.options.map((o: string, i: number) => (
          <div className="opt-card" key={i} style={{ background: OPTION_STYLE[i].bg, animationDelay: `${i * 0.06}s` }}><Badge i={i} /><span>{o}</span></div>))}
      </div>
      <div className="footer">
        <div className="progress"><div className="bar"><div style={{ width: `${d.joined ? (d.answered / d.joined) * 100 : 0}%` }} /></div>
          <span>Answered <b>{d.answered}</b> of {d.joined}</span></div>
        <div className="joinbadge"><Qr /><div><div className="eyebrow">Join</div><div className="url sm">{host(d.joinUrl)}</div></div></div>
      </div>
    </div>
  );

  if (d.kind === "results") {
    const counts: number[] = d.counts ?? d.options.map(() => 0), max = Math.max(1, ...counts), sum = counts.reduce((a, b) => a + b, 0);
    return (
      <div className={`slide ${fit(d)}`}>
        <div className="topbar"><span className="eyebrow">Question {d.index + 1} of {d.total} · Results</span><span className="eyebrow">{sum} answered</span></div>
        <h2 className="qtext">{d.text}</h2>
        <div className="bars">
          {d.options.map((o: string, i: number) => (
            <div className={`barrow ${d.correct === i ? "right" : d.correct === undefined ? "" : "wrong"}`} key={i}>
              <div className="lab"><Badge i={i} /><span>{o}</span>{d.correct === i && <em className="check">Correct</em>}</div>
              <div className="track"><div className="fill" style={{ width: `${(counts[i] / max) * 100}%`, background: OPTION_STYLE[i].bg }} /></div>
              <div className="num">{counts[i]}{sum ? <small>{Math.round((counts[i] / sum) * 100)}%</small> : null}</div>
            </div>))}
        </div>
      </div>);
  }

  const rows: { rank: number; name: string; score: number }[] = d.rows ?? [];
  const tones = ["#F6E8BC", "#D2DEF5", "#F7D3CD"]; // 1st butter, 2nd periwinkle, 3rd blush
  return (
    <div className="slide board">
      <div className="topbar"><span className="eyebrow">{d.final ? "Final standings" : `Standings after question ${d.index + 1}`}</span><span className="eyebrow">{Plural(d.joined, "player")}</span></div>
      <h2 className="qtext boardtitle">{d.final ? "Final leaderboard" : "Leaderboard"}</h2>
      <div className="podium">
        {[1, 0, 2].map((idx) => rows[idx] && (
          <div key={idx} className={`pod p${idx + 1}`} style={{ background: tones[idx] }}>
            <div className="prank">{idx + 1}</div><div className="pname">{rows[idx].name}</div><div className="pscore">{rows[idx].score}</div>
          </div>))}
      </div>
      <div className="lbrows">{rows.slice(3, 10).map((r) => <div className="lbrow" key={r.rank}><span className="r">{r.rank}</span><span>{r.name}</span><b>{r.score}</b></div>)}</div>
    </div>);
}
