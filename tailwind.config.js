/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/**/*.{tsx,ts,jsx,js}"],
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#0a0a0f",
          surface: "#12121a",
          "surface-2": "#1a1a25",
          border: "#2a2a3a",
          "border-light": "#3a3a4a",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
          "accent-dim": "#4f46e5",
          success: "#22c55e",
          warning: "#f59e0b",
          error: "#ef4444",
          muted: "#6b7280",
          text: "#e5e7eb",
          "text-dim": "#9ca3af",
          "text-bright": "#f9fafb",
        },
      },
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
