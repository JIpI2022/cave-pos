/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette "cave" : bordeaux / or / ardoise
        wine: {
          50: '#fdf2f4', 100: '#fbe8ec', 200: '#f5cdd6', 300: '#eda5b6',
          400: '#e07290', 500: '#d0476d', 600: '#ba2b55', 700: '#9c1f45',
          800: '#7a1c3b', 900: '#5d1a31', 950: '#380a18',
        },
        slate: {
          850: '#172033',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
