import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/ws": { target: "ws://localhost:3000", ws: true }, "/api": "http://localhost:3000" } },
  build: {
    rollupOptions: {
      input: { join: resolve(__dirname, "join.html"), admin: resolve(__dirname, "admin.html"), present: resolve(__dirname, "present.html"), create: resolve(__dirname, "create.html") },
    },
  },
});
