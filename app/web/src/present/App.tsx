import { useRef, useState } from "react";
import { Box, Tldraw, createShapeId, type Editor } from "tldraw";
import type { DisplayInit, DisplayState } from "@livequiz/shared";
import { useSocket } from "../lib/socket";
import { QuizSlideUtil } from "./QuizSlideShape";
import { SLIDE_H, SLIDE_W, activeKey, buildSlides, slideData } from "./slides";

const shapeUtils = [QuizSlideUtil];
const sid = (key: string) => createShapeId(key);

export function App() {
  const editor = useRef<Editor | null>(null);
  const init = useRef<DisplayInit | null>(null);
  const state = useRef<DisplayState | null>(null);
  const [ready, setReady] = useState(false);
  const lastKey = useRef<string | null>(null);

  const rebuild = () => {
    const e = editor.current, i = init.current;
    if (!e || !i) return;
    const slides = buildSlides(i);
    try { e.run(() => {
      e.deleteShapes(e.getCurrentPageShapes().map((s) => s.id));
      e.createShapes(slides.map((s) => ({ id: sid(s.key), type: "quiz-slide", x: s.x, y: 0, isLocked: true, props: { w: SLIDE_W, h: SLIDE_H, data: slideData(s.key, i, state.current) } })));
    }, { ignoreShapeLock: true }); } catch (err) { console.error("LQ rebuild failed", err); }
    lastKey.current = null;
    apply();
  };

  const apply = () => {
    const e = editor.current, i = init.current, s = state.current;
    if (!e || !i || !s) return;
    const key = activeKey(s);
    const slide = buildSlides(i).find((d) => d.key === key);
    if (!slide) return;
    e.run(() => e.updateShape({ id: sid(key), type: "quiz-slide", props: { data: slideData(key, i, s) } }), { ignoreShapeLock: true });
    if (lastKey.current !== key) {
      const first = lastKey.current === null;
      lastKey.current = key;
      e.zoomToBounds(new Box(slide.x, 0, SLIDE_W, SLIDE_H), { inset: 0, force: true, animation: first ? undefined : { duration: 600 } });
    }
  };

  useSocket("display", (m) => {
    if (m.t === "display_init") {
      const rebuildNeeded = !init.current || JSON.stringify(init.current.questions) !== JSON.stringify(m.questions) || init.current.title !== m.title;
      init.current = m;
      if (rebuildNeeded) rebuild(); else if (state.current) {
        // only the join URL changed: refresh all slides' QR/url
        const e = editor.current!;
        buildSlides(m).forEach((s) => e.run(() => e.updateShape({ id: sid(s.key), type: "quiz-slide", props: { data: slideData(s.key, m, state.current) } }), { ignoreShapeLock: true }));
        lastKey.current = null; apply();
      }
    } else if (m.t === "display_state") { state.current = m; if (ready) apply(); }
  });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw hideUi shapeUtils={shapeUtils}
        onMount={(e) => {
          editor.current = e;
          (window as any).__editor = e;
          e.user.updateUserPreferences({ colorScheme: "light" });
          e.updateInstanceState({ isGridMode: false }); // not isReadonly: that blocks our own shape updates. Shapes are locked instead.
          e.setCurrentTool("hand");
          e.setCameraOptions({ isLocked: true });
          setReady(true);
          rebuild();
          const onResize = () => { lastKey.current = null; apply(); };
          window.addEventListener("resize", onResize);
        }}
      />
    </div>
  );
}
