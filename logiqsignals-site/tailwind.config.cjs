/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui"] },
      colors: {
        // subtle helpers for the brand
        lion: {
          gold: "#FFD700",
          blue: "#4E9EFF",
          onyx: "#0A0A0A"
        }
      }
    },
  },
  plugins: [],
};
