import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../apps/landing/src/**/*.{ts,tsx}',
    '../../apps/dashboard/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'bg-base': '#080808',
        'bg-1': '#111111',
        'bg-2': '#1a1a1a',
        'bg-3': '#242424',
        // Borders
        border: '#2e2e2e',
        'border-hi': '#3d3d3d',
        // Cyan brand
        cyan: {
          50: '#e0fafe',
          100: '#b3f4fd',
          200: '#66e8fb',
          300: '#1ad9f8',
          400: '#00c2ff',
          500: '#00a3d9',
          600: '#0082ad',
        },
        // Copper
        copper: {
          300: '#f0a855',
          400: '#d4820a',
          500: '#b06a08',
        },
        // Semantic
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        // Text
        'text-primary': '#ffffff',
        'text-secondary': '#a1a1aa',
        'text-muted': '#71717a',
        'text-disabled': '#3f3f46',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 194, 255, 0.35)',
        'glow-cyan-sm': '0 0 10px rgba(0, 194, 255, 0.2)',
        'glow-copper': '0 0 20px rgba(212, 130, 10, 0.35)',
      },
      animation: {
        'circuit-draw': 'circuit-draw 2s ease-in-out infinite',
        'pulse-cyan': 'pulse-cyan 2s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
      },
      keyframes: {
        'circuit-draw': {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        'pulse-cyan': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
