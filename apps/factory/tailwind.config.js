/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          400: "#1a1a1a",
          500: "#0d0d0d",
        },
        gold: {
          500: "#d4a74a",
        }
      }
    },
  },
  plugins: [],
}
