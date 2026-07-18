/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — Buccaneer Yacht Club navy (navy + white, minimal).
        brand: {
          50: '#eef3fa',
          100: '#d7e3f2',
          500: '#1c4a7e',
          600: '#123a63',
          700: '#0a2342',
          800: '#071a33',
        },
      },
    },
  },
  plugins: [],
};
