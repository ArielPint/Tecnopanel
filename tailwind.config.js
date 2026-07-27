/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // tokens propios del hub (además del set shadcn de arriba)
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          hover: 'hsl(var(--brand-hover))',
        },
        // tokens del módulo CRM (namespace propio para no chocar con `brand` del hub)
        'crm-red': '#ed3224',
        'crm-dark': '#c0241a',
        // alias legacy: páginas aún no rediseñadas (Login, Dashboard, CRM, Proyectos, KpiCard)
        // siguen usando estas clases hasta que pasen por su fase de rediseño.
        tecnopanel: {
          DEFAULT: 'hsl(var(--brand))',
          hover: 'hsl(var(--brand-hover))',
          light: '#F2564A',
          plomo: '#424243',
          dark: '#2B2B2C',
        },
        info: 'hsl(var(--info))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        // tokens propios del módulo Financiero (colores fijos de íconos de nav,
        // ver dashboard.html / FinancieroLayout) — sin CSS var, no cambian con el tema.
        cyan: '#38bdf8',
        purple: '#bc8cff',
        pink: '#f472b6',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          border: 'hsl(var(--sidebar-border))',
          // reusa --muted (sin CSS var propia) para el hover de nav de Financiero.
          accent: 'hsl(var(--muted))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
