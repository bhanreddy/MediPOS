/** @type {import('tailwindcss').Config} */
import { tokens } from './src/styles/tokens';

export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: 'rgb(var(--background) / <alpha-value>)',
                surface: 'rgb(var(--surface) / <alpha-value>)',
                'surface-elevated': 'rgb(var(--surface-elevated) / <alpha-value>)',
                'surface-alt': 'rgb(var(--surface-alt) / <alpha-value>)',
                border: 'rgb(var(--border) / <alpha-value>)',
                foreground: 'rgb(var(--foreground) / <alpha-value>)',
                'foreground-strong': 'rgb(var(--foreground-strong) / <alpha-value>)',
                muted: 'rgb(var(--muted) / <alpha-value>)',
                overlay: 'rgb(var(--overlay) / <alpha-value>)',

                primary: 'rgb(var(--primary) / <alpha-value>)',
                success: 'rgb(var(--success) / <alpha-value>)',
                warning: 'rgb(var(--warning) / <alpha-value>)',
                danger: 'rgb(var(--danger) / <alpha-value>)',
                error: 'rgb(var(--danger) / <alpha-value>)',

                'on-primary': 'rgb(var(--on-primary) / <alpha-value>)',
                'on-success': 'rgb(var(--on-success) / <alpha-value>)',
                'on-warning': 'rgb(var(--on-warning) / <alpha-value>)',
                'on-danger': 'rgb(var(--on-danger) / <alpha-value>)',
                
                // Phase 5 specified colors
                bg: {
                    primary:  '#0A0A0F',
                    surface:  '#0F1117',
                    card:     'rgba(255,255,255,0.04)',
                },
                accent: {
                    primary:   '#00C9A7',
                    secondary: '#0077B6',
                },
                status: {
                    success: '#22C55E',
                    warning: '#F59E0B',
                    error:   '#EF4444',
                },
            },
            ringColor: {
                focus: 'rgb(var(--focus) / <alpha-value>)',
                primary: 'rgb(var(--focus) / <alpha-value>)',
            },
            borderColor: {
                primary: 'rgb(var(--primary) / <alpha-value>)',
                border: 'rgb(var(--border) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
            },
            fontSize: {
                'billing-total': tokens.typography.sizes['billing-total'],
                'heading': tokens.typography.sizes['heading'],
                'item-name': tokens.typography.sizes['item-name'],
                'base': tokens.typography.sizes['base'],
                'label': tokens.typography.sizes['label'],
                'small': tokens.typography.sizes['small'],
            },
            spacing: {
                ...tokens.spacing,
            },
            borderRadius: {
                ...tokens.radius,
            },
        },
    },
    plugins: [],
}
