/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E05A1E',
          hover: '#C94E16',
          light: '#FFF4EE',
          glow: 'rgba(224, 90, 30, 0.15)',
        },
        slate: {
          surface: '#FFFFFF',
          canvas: '#F8F9FB',
          border: '#E8EBF0',
          dark: '#121314',
          muted: '#64748B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft-sm': '0 2px 8px -1px rgba(18, 19, 20, 0.04), 0 1px 3px -1px rgba(18, 19, 20, 0.02)',
        'soft-md': '0 12px 24px -4px rgba(18, 19, 20, 0.05), 0 4px 12px -2px rgba(18, 19, 20, 0.02)',
        'soft-lg': '0 20px 40px -8px rgba(18, 19, 20, 0.08), 0 8px 20px -4px rgba(18, 19, 20, 0.04)',
        'glow-orange': '0 4px 14px rgba(224, 90, 30, 0.25)',
        'card-hover': '0 20px 35px -8px rgba(18, 19, 20, 0.06), 0 4px 14px -4px rgba(224, 90, 30, 0.08)',
      }
    },
  },
  plugins: [],
}
