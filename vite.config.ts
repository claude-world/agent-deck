import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "client",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3002",
      "/ws": {
        target: "ws://127.0.0.1:3002",
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist",
    rolldownOptions: {
      output: {
        // Keep third-party code (React, React Flow) in its own chunk
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules/ }],
        },
      },
    },
  },
});
