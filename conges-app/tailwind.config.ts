import type { Config } from "tailwindcss";

// Charte verte de Dakar Mobilité, avec les statuts sémantiques existants.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EBF8F1",
          100: "#CDEEDD",
          200: "#9FDCBF",
          300: "#63C39A",
          400: "#2AA673",
          500: "#00975A",
          600: "#00884B",
          700: "#006E3D",
          800: "#055833",
          900: "#07482B",
          950: "#03281A"
        }
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "monospace"]
      },
      boxShadow: {
        card: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03)",
        elevated: "0 6px 16px -6px rgb(0 136 75 / 0.55)"
      }
    }
  },
  plugins: []
};
export default config;
