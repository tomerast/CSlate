import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx}', './components/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--slate-primary)',
        secondary: 'var(--slate-secondary)',
        accent: 'var(--slate-accent)',
        background: 'var(--slate-bg)',
        surface: 'var(--slate-surface)',
        text: 'var(--slate-text)',
        muted: 'var(--slate-text-muted)',
        border: 'var(--slate-border)',
        error: 'var(--slate-error)',
        success: 'var(--slate-success)',
        warning: 'var(--slate-warning)'
      },
      borderRadius: {
        sm: 'var(--slate-radius-sm)',
        md: 'var(--slate-radius-md)',
        lg: 'var(--slate-radius-lg)',
        full: 'var(--slate-radius-full)'
      },
      boxShadow: {
        sm: 'var(--slate-shadow-sm)',
        md: 'var(--slate-shadow-md)',
        lg: 'var(--slate-shadow-lg)'
      }
    }
  },
  plugins: []
} satisfies Config
