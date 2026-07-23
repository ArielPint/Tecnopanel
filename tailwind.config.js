/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta oficial del Brandbook Tecnopanel
        tecnopanel: {
          DEFAULT: '#ED3224', // rojo de marca
          hover: '#D42A1E', // rojo hover / pressed
          light: '#F2564A', // rojo claro (focus rings, hover sobre fondos oscuros)
          plomo: '#424243', // gris plomo (color secundario oficial)
          dark: '#2B2B2C', // variante oscura del plomo (fondo sidebar)
        },
      },
      fontFamily: {
        // Aproximaciones libres de las tipografías de marca (Proxima Nova / DIN, ambas de pago)
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
