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
        // TRUV Practice Design Tokens - Orange & White Enterprise Palette
        orange: {
          DEFAULT: "#F26B38",
          50: "#FFF4EE",
          100: "#FFE7DA",
          200: "#FFCEB5",
          300: "#FFAE89",
          400: "#FA8A58",
          500: "#F26B38", // Primary brand action
          600: "#D95524", // Hover / active
          700: "#B83E15",
          800: "#943213",
          900: "#7A2B12",
        },
        charcoal: {
          DEFAULT: "#263238",
          900: "#263238",
          800: "#374151",
          700: "#4B5563",
          600: "#6B7280",
          500: "#64748B",
          400: "#94A3B8",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50: "#F8FAFC",
        },
        graphite: {
          DEFAULT: "#202522",
          900: "#202522",
          800: "#2F3632",
          700: "#444D48",
          600: "#5B6660",
          500: "#74817A",
          400: "#929F98",
          300: "#B4BFB9",
          200: "#D3DBD6",
          100: "#E8ECE8",
          50: "#F2F4F2",
        },
        ivory: {
          DEFAULT: "#F5F4EF",
          50: "#FAFAF7",
          100: "#F5F4EF",
          200: "#EDEBE3",
          300: "#E3DFD5",
          400: "#D7D2C5",
          500: "#CAC3B3",
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
          DEFAULT: "#D4A64A",
          50: "#FDFBF7",
          100: "#FAF4E8",
          200: "#F4E7CE",
          300: "#ECD6AB",
          400: "#E2C182",
          500: "#D4A64A",
          600: "#B88934",
          700: "#946B25",
          800: "#73511D",
          900: "#5A3E17",
        },
        // TRUV LedgerOS Design Tokens
        surface: {
          canvas: "#090d16", // Deep app background
          base: "#0f172a",   // Card base, table row base
          raised: "#1e293b", // Elevated card, dropdowns, modal background
          overlay: "#334155",// Active selection, hovered row
          muted: "#182234",  // Table headers, nested inset panels
        },
        brand: {
          primary: "#6366f1", // Indigo primary action
          hover: "#4f46e5",   // Primary action hover
          subtle: "rgba(99, 102, 241, 0.12)", // Badge fill, active nav link
        },
        status: {
          success: {
            DEFAULT: "#10b981",
            subtle: "rgba(16, 185, 129, 0.12)",
          },
          warning: {
            DEFAULT: "#f59e0b",
            subtle: "rgba(245, 158, 11, 0.12)",
          },
          danger: {
            DEFAULT: "#ef4444",
            subtle: "rgba(239, 68, 68, 0.12)",
          },
          neutral: {
            DEFAULT: "#64748b",
            subtle: "rgba(100, 116, 139, 0.12)",
          },
        },
        border: {
          subtle: "#1e293b", // Table cell dividers, subtle card separators
          strong: "#334155", // Card borders, input strokes
          focused: "#6366f1",// Active focus ring & focused input outline
        },
        // Magical Frosted Glass Tokens
        glass: {
          canvas: "rgba(9, 13, 22, 0.75)",
          base: "rgba(15, 23, 42, 0.65)",
          raised: "rgba(30, 41, 59, 0.70)",
          hover: "rgba(51, 65, 85, 0.45)",
          border: "rgba(255, 255, 255, 0.08)",
          borderStrong: "rgba(255, 255, 255, 0.16)",
        },
      },
      backdropBlur: {
        xs: "2px",
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'Fira Code'",
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
        "glass-sm": "0 4px 6px -1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
        "glass-card": "0 10px 25px -5px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        "glass-glow": "0 0 30px -5px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
        "status-emerald": "0 0 14px -2px rgba(16, 185, 129, 0.45)",
        "status-rose": "0 0 14px -2px rgba(239, 68, 68, 0.45)",
        raised: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px -1px rgba(0, 0, 0, 0.3)",
        overlay: "0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.5)",
        card: "0 1px 3px 0 rgba(23, 26, 25, 0.05), 0 1px 2px -1px rgba(23, 26, 25, 0.05)",
        "card-hover": "0 4px 6px -1px rgba(23, 26, 25, 0.08), 0 2px 4px -2px rgba(23, 26, 25, 0.05)",
        popover: "0 10px 15px -3px rgba(23, 26, 25, 0.08), 0 4px 6px -4px rgba(23, 26, 25, 0.04)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite linear",
      },
    },
  },
  plugins: [],
};
export default config;
