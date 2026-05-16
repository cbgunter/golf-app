/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Soft sage green — primary brand color
        sage: {
          50:  '#f4f7f4',
          100: '#e6ede6',
          200: '#ccdccc',
          300: '#a8c3a8',
          400: '#7da47d',
          500: '#5a875a',
          600: '#466b46',
          700: '#385538',
          800: '#2e442e',
          900: '#263826',
        },
        // Warm stone — neutrals
        stone: {
          50:  '#fafaf9',
          100: '#f5f5f4',
          200: '#e7e5e4',
          300: '#d6d3d1',
          400: '#a8a29e',
          500: '#78716c',
          600: '#57534e',
          700: '#44403c',
          800: '#292524',
          900: '#1c1917',
        },
        // Soft gold — accents
        sand: {
          50:  '#fdfbf5',
          100: '#faf4e1',
          200: '#f5e8be',
          300: '#eed794',
          400: '#e5c265',
          500: '#d4a832',
          600: '#b8891f',
          700: '#956c18',
          800: '#785518',
          900: '#634618',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
