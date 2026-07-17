import type { Config } from 'tailwindcss'

// Tokens per skills/design-system/SKILL.md — Legal Contract Review Platform.
const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#112E81',
          hover: '#0E276E',
        },
        secondary: {
          DEFAULT: '#4647AE',
          hover: '#3B3C96',
        },
        accent: {
          DEFAULT: '#AACCD6',
          light: '#D8E8ED',
        },
        violet: {
          DEFAULT: '#7F00FF',
          light: '#F7F0FF',
        },
        blue: {
          DEFAULT: '#115ACB',
          light: '#E7EFFC',
        },
        surface: {
          bg: '#FFFFFF',
          subtle: '#F8FAFC',
          card: '#F1F5F9',
          elevated: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
        text: {
          primary: '#0F172A',
          secondary: '#475569',
          muted: '#64748B',
        },
        success: '#16A34A',
        warning: '#F59E0B',
        error: '#DC2626',
        info: '#0284C7',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '1.3', fontWeight: '700' }],
        h1: ['28px', { lineHeight: '1.3', fontWeight: '700' }],
        h2: ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h4: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        small: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '40px',
        '3xl': '48px',
      },
      borderRadius: {
        card: '12px',
        input: '8px',
        badge: '4px',
      },
    },
  },
  plugins: [],
}

export default config
