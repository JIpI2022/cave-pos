/** @type {import('tailwindcss').Config} */

/**
 * Les couleurs de l'interface passent par des JETONS SEMANTIQUES
 * (surface, carte, encre, marque...) definis en variables CSS dans
 * src/index.css. Le mode sombre se contente de redefinir ces variables :
 * aucun ecran n'a besoin d'etre reecrit, et une couleur oubliee se voit
 * immediatement au lieu de rester illisible dans un seul mode.
 */
const jeton = (nom) => `rgb(var(--${nom}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Jetons semantiques ---
        surface: jeton('surface'),        // fond de page
        card: jeton('card'),              // fond des cartes et tableaux
        raised: jeton('raised'),          // champs, survol, en-tetes de tableau
        line: jeton('line'),              // bordures et separateurs
        ink: jeton('ink'),                // texte principal
        'ink-2': jeton('ink-2'),          // texte secondaire
        'ink-3': jeton('ink-3'),          // texte discret
        brand: jeton('brand'),            // actions principales
        'brand-ink': jeton('brand-ink'),  // texte pose sur la marque
        'brand-soft': jeton('brand-soft'),
        'brand-soft-ink': jeton('brand-soft-ink'),
        strong: jeton('strong'),          // bandeau de total, contraste maximal
        'strong-ink': jeton('strong-ink'),

        // --- Palette de marque : ambre (boisson) et vert bouteille ---
        ambre: {
          50: '#fdf8ed', 100: '#f9ecd1', 200: '#f1d8a3', 300: '#e6bd6b',
          400: '#daa03e', 500: '#c98620', 600: '#ab6816', 700: '#8a4f15',
          800: '#704118', 900: '#5e3717', 950: '#361c08',
        },
        bouteille: {
          50: '#f0f7f2', 100: '#dbeede', 200: '#b8ddc2', 300: '#88c49d',
          400: '#56a576', 500: '#358857', 600: '#256d45', 700: '#1e5739',
          800: '#1a462f', 900: '#173a28', 950: '#0a2016',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        carte: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        flottant: '0 10px 30px -10px rgb(0 0 0 / 0.25)',
      },
    },
  },
  plugins: [],
}
