import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f6feb",
          dark: "#1657c0",
        },
        ok: "#1a7f37",
        warn: "#9a6700",
        danger: "#cf222e",
      },
    },
  },
  plugins: [],
};

export default config;
