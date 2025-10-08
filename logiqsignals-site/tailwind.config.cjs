/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        gradientShift: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" }
        }
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        gradientShift: "gradientShift 15s ease infinite"
      }
    }
  },
  plugins: []
};
