import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif'
        ]
      },
      colors: {
        canvas: '#F8FAFC',
        stream: {
          DEFAULT: '#5FA8A6',
          dark: '#357f7d'
        },
        reservoir: '#6B8CAF',
        mint: {
          50: '#EEFBF3',
          200: '#C8EED4',
          300: '#A8D5BA'
        },
        honey: {
          50: '#FBF6E6',
          200: '#F4E2A8',
          300: '#E9C46A'
        }
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        'fade-in': 'fadeIn 250ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
