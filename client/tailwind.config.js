/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — nautical navy + signal accents.
        brand: {
          50: '#eef4fb',
          100: '#d9e6f5',
          500: '#1d4e89',
          600: '#173e6e',
          700: '#102d51',
        },
      },
    },
  },
  plugins: [],
};
