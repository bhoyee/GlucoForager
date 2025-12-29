/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0FB7A5",
        accent: "#FFB703",
        midnight: "#0C1824",
        surface: "#13243A",
      },
    },
  },
  plugins: [],
};
