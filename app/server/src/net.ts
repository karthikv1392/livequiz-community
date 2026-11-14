import os from "node:os";

/** First non-loopback IPv4 address as a URL, e.g. http://192.168.0.6:3000 (what phones on the same Wi-Fi can reach). */
export function lanUrl(port: number): string {
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) return `http://${i.address}:${port}`;
  return `http://localhost:${port}`;
}
