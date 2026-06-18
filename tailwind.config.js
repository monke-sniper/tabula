/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        amber: 'var(--amber)',
        cyan: 'var(--cyan)',
        green: 'var(--green)',
        red: 'var(--red)',
        blue: 'var(--blue)',
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
          elevated: 'var(--bg-elevated)',
          panel: 'var(--bg-panel)',
        },
        border: {
          DEFAULT: 'var(--border)',
          bright: 'var(--border-bright)',
          dim: 'var(--border-dim)',
        },
        white: 'var(--white)',
        grey: {
          DEFAULT: 'var(--grey)',
          dim: 'var(--grey-dim)',
          bright: 'var(--grey-bright)',
        },
      },
    },
  },
  plugins: [],
}
