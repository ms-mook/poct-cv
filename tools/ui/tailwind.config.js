/** Tailwind 3 + daisyUI 4 → compiled once into ../../css/tw.css (committed). Re-run `npm run build` after changing classes. */
module.exports = {
  content: ['../../*.html', '../../js/*.js'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans Thai"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'] }
    }
  },
  plugins: [require('daisyui')],
  daisyui: {
    logs: false,
    themes: [
      { light: {
        'primary': '#0b6b5b', 'primary-content': '#ffffff', 'secondary': '#6250d6', 'secondary-content': '#ffffff',
        'accent': '#d97706', 'accent-content': '#ffffff', 'neutral': '#12201b', 'neutral-content': '#f2f5f4',
        'base-100': '#ffffff', 'base-200': '#f1f5f4', 'base-300': '#dde5e2', 'base-content': '#12201b',
        'info': '#2a78d6', 'info-content': '#ffffff', 'success': '#17794a', 'success-content': '#ffffff',
        'warning': '#f59e0b', 'warning-content': '#2b1a00', 'error': '#b4231f', 'error-content': '#ffffff',
        '--rounded-box': '1rem', '--rounded-btn': '0.75rem', '--rounded-badge': '9999px', '--tab-radius': '0.6rem'
      } },
      { dark: {
        'primary': '#3fb59f', 'primary-content': '#04120e', 'secondary': '#9085e9', 'secondary-content': '#0d0a24',
        'accent': '#fbbf24', 'accent-content': '#2b1a00', 'neutral': '#1d2a26', 'neutral-content': '#edf2f0',
        'base-100': '#121a17', 'base-200': '#0d1412', 'base-300': '#26322e', 'base-content': '#edf2f0',
        'info': '#5aa0f0', 'info-content': '#04101f', 'success': '#5fd197', 'success-content': '#04120a',
        'warning': '#fbbf24', 'warning-content': '#2b1a00', 'error': '#ff8d88', 'error-content': '#2a0705',
        '--rounded-box': '1rem', '--rounded-btn': '0.75rem', '--rounded-badge': '9999px', '--tab-radius': '0.6rem'
      } }
    ],
    darkTheme: 'dark'
  }
};
