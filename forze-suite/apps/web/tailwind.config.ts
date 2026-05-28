import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#08090b',
          surface: '#0d0e11',
          raised: '#111317',
          hover: '#16181d',
          active: '#1c1f25',
        },
        line: {
          DEFAULT: '#1f232b',
          strong: '#2a2f38',
          subtle: '#15181d',
        },
        ink: {
          DEFAULT: '#e6e8ec',
          muted: '#a4a9b4',
          dim: '#6b7280',
          faint: '#4a505a',
        },
        accent: {
          DEFAULT: '#22d3ee',
          bright: '#67e8f9',
          dim: '#0891b2',
          soft: 'rgba(34, 211, 238, 0.10)',
          border: 'rgba(34, 211, 238, 0.35)',
        },
        ok: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171',
        info: '#60a5fa',
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      },
      borderRadius: {
        xs: '3px',
      },
      boxShadow: {
        glow: '0 0 24px rgba(34, 211, 238, 0.18)',
        card: '0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px rgba(0,0,0,0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out forwards',
        'scale-in': 'scale-in 180ms ease-out forwards',
        'pulse-dot': 'pulse-dot 1800ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
