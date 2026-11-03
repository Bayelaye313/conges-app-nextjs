import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        encre: {
          950: "#12182B", // fond profond, "encre administrative"
          900: "#1A2238",
          800: "#232E4D",
          700: "#324272"
        },
        parchemin: {
          50: "#F7F4EC",
          100: "#EFE9D8"
        },
        cachet: {
          DEFAULT: "#C1793A", // ambre "tampon officiel"
          light: "#E0A868",
          dark: "#8F5623"
        },
        alerte: "#B4483A",
        succes: "#3E7A5E"
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      backgroundImage: {
        grain: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)"
      },
      borderRadius: {
        card: "6px"
      }
    }
  },
  plugins: []
};
export default config;
