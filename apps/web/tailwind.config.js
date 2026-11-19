/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',

        ink: { DEFAULT: '#141416', soft: '#55565c', faint: '#8d8e95' },
        hairline: '#e7e8ec',
        mist: '#f4f5f7',
        night: { DEFAULT: '#1b1b1d', 2: '#232326', 3: '#2c2c30' },
        mint: {
          DEFAULT: '#5fe88a',
          hover: '#48dc77',
          pale: '#a8f2c0',
          pixel: '#86f0a8',
          subtle: 'rgba(95, 232, 138, 0.14)',
        },
        sky: {
          DEFAULT: '#52b0f8',
          hover: '#3a9ff0',
          deep: '#2f8ae0',
          pale: '#a9d6fb',
          subtle: 'rgba(82, 176, 248, 0.14)',
        },
        hero: { backdrop: '#dedee4', canvas: '#f7f7fa', indigo: '#5a50f2', gold: '#f2b53a' },
        // Dashboard tokens: site palette, driven by CSS variables so light and dark themes both work.
        pos: {
          surface: 'rgb(var(--pos-surface) / <alpha-value>)',
          muted: 'rgb(var(--pos-muted) / <alpha-value>)',
          tint: 'rgb(var(--pos-tint) / <alpha-value>)',
          line: 'rgb(var(--pos-line) / <alpha-value>)',
          accent: 'rgb(var(--pos-accent) / <alpha-value>)',
          'accent-deep': 'rgb(var(--pos-accent-deep) / <alpha-value>)',
          ink: 'rgb(var(--pos-ink) / <alpha-value>)',
          head: 'rgb(var(--pos-head) / <alpha-value>)',
          green: 'rgb(var(--pos-green) / <alpha-value>)',
          red: 'rgb(var(--pos-red) / <alpha-value>)',
          grey: 'rgb(var(--pos-grey) / <alpha-value>)',
        },

        // Legacy palette still used by dashboard sub-pages
        swiss: {
          light: '#FFFFFF',
          'light-surface': '#F7F8FA',
          'light-border': '#E5E7EB',
          'light-ink': '#0E0F10',
          'light-muted': '#646A73',
          dark: '#0E0F10',
          'dark-elevated': '#17191C',
          'dark-border': '#24272B',
          'dark-ink': '#FFFFFF',
          'dark-muted': '#9BA1AA',
        },
        compliance: {
          warning: '#F59E0B',
          critical: '#EF4444',
          neutral: '#64748B',
        },
      },
      fontFamily: {
        sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-poppins)', 'sans-serif'],
        outfit: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        hero: '-0.055em',
        tightest: '-0.035em',
        eyebrow: '0.16em',
      },
      borderRadius: {
        'sm-box': '4px',
        '2xl-box': '18px',
        '3xl-box': '26px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
