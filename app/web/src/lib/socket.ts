import { useEffect, useRef, useState } from "react";

type Role = "player" | "admin" | "display";

/** WebSocket with auto-reconnect (exponential backoff 0.5s -> 5s). `onOpen` runs on every (re)connect. */
export function useSocket(role: Role, onMessage: (m: any) => void, onOpen?: (send: (m: unknown) => void) => void) {
  const [online, setOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef({ onMessage, onOpen });
  handlers.current = { onMessage, onOpen };

  useEffect(() => {
    let closed = false, attempt = 0, timer: number | undefined;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?role=${role}`);
      wsRef.current = ws;
      ws.onopen = () => { attempt = 0; setOnline(true); handlers.current.onOpen?.((m) => ws.send(JSON.stringify(m))); };
      ws.onmessage = (e) => handlers.current.onMessage(JSON.parse(e.data));
      ws.onclose = () => {
        setOnline(false);
        if (!closed) timer = window.setTimeout(connect, Math.min(5000, 500 * 2 ** attempt++));
      };
    };
    connect();
    const wake = () => { if (document.visibilityState === "visible" && wsRef.current?.readyState !== WebSocket.OPEN) { wsRef.current?.close(); } };
    document.addEventListener("visibilitychange", wake);
    return () => { closed = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); wsRef.current?.close(); };
  }, [role]);

  const send = (m: unknown) => { if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(m)); };
  return { online, send };
}

/** Soft pastel fill + a deeper tone of the same hue for text/accents. Options are always also identified by letter (A-F). */
export const OPTION_STYLE = [
  { bg: "#F7D3CD", ink: "#9A4036" }, { bg: "#D2DEF5", ink: "#34569E" }, { bg: "#F6E8BC", ink: "#7F6210" },
  { bg: "#D1E7D8", ink: "#2F6B4A" }, { bg: "#E0D7F3", ink: "#5B4399" }, { bg: "#CBE7E4", ink: "#26706B" },
];
export const LETTERS = "ABCDEF";
export const ordinal = (n: number) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
