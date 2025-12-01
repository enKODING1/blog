import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
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
      },
      typography: {
        DEFAULT: {
          css: {
            "code::before": {
              content: '""',
            },
            "code::after": {
              content: '""',
            },
            code: {
              backgroundColor: "rgba(135,131,120,0.15)",
              color: "#EB5757",
              padding: "0.2em 0.4em",
              borderRadius: "3px",
              fontWeight: "500",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
