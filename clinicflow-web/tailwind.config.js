/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /*
       * ClinicFlow design tokens. Use these instead of
       * hard-coded hex values: bg-brand-500, text-brand-600,
       * border-brand-100, rounded-card, shadow-card.
       */
      colors: {
        brand: {
          50: "#F2FCFC",
          100: "#D8F3F1",
          200: "#BFECE8",
          300: "#8FDCD8",
          400: "#4FC9C9",
          500: "#13B2B3",
          600: "#109A9B",
          700: "#0F8F91",
          800: "#0E6E70",
          900: "#0C4F51",
        },
      },
      borderRadius: {
        card: "1rem",
        control: "0.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
        raised: "0 12px 32px -12px rgba(15, 23, 42, 0.18)",
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
