import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // TRUV Practice Design Tokens
        graphite: {
          DEFAULT: "#171A19",
          900: "#171A19",
          800: "#2B302E",
          700: "#414744",
          600: "#5A615D",
          500: "#747C77",
          400: "#929A95",
          300: "#B4BBB6",
          200: "#D3D7D4",
          100: "#E9EBEA",
          50: "#F5F6F5",
        },
        ivory: {
          DEFAULT: "#F7F6F1",
          50: "#FAF9F5",
          100: "#F7F6F1",
          200: "#EFECE3",
          300: "#E5E1D5",
          400: "#DBD6C6",
          500: "#CFC9B6",
        },
        emerald: {
          DEFAULT: "#087F5B",
          50: "#EDF8F4",
          100: "#D7F0E7",
          200: "#B0E2D1",
          300: "#7ED1B7",
          400: "#44BC99",
          500: "#1CA37D",
          600: "#087F5B", // Primary brand action
          700: "#06694B",
          800: "#05543D",
          900: "#044532",
          950: "#02271C",
        },
        gold: {
          DEFAULT: "#C89B3C",
          50: "#FBF7ED",
          100: "#F6EED7",
          200: "#EEDCAE",
          300: "#E4C783",
          400: "#D8B25C",
          500: "#C89B3C",
          600: "#AD802B",
          700: "#8C6321",
          800: "#724F1E",
          900: "#5F411B",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'SF Mono'",
          "SFMono-Regular",
          "Consolas",
          "'Liberation Mono'",
          "Menlo",
          "Courier",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(23, 26, 25, 0.05), 0 1px 2px -1px rgba(23, 26, 25, 0.05)",
        "card-hover": "0 4px 6px -1px rgba(23, 26, 25, 0.08), 0 2px 4px -2px rgba(23, 26, 25, 0.05)",
        popover: "0 10px 15px -3px rgba(23, 26, 25, 0.08), 0 4px 6px -4px rgba(23, 26, 25, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
