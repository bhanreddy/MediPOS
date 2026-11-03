# Liquid glass design system

The app uses pearl and sapphire surfaces in light mode and midnight blue surfaces in dark mode. Muted violet, blue, warm amber and soft rose provide supporting colour. Green is reserved for success and healthy status indicators; it is no longer the brand accent or revenue-card colour.

## Design refinements — 9 October 2026

The design review found that the web theme and dashboard had reverted to flat teal surfaces, while native dashboard and inventory used separate palettes. Shared cards, inputs and dialogs also used inconsistent corner sizes and material treatments. Some charts still used bright hardcoded colours.

- Unified the web and native primary/secondary palettes, including chart colours and focus indicators.
- Added one glass material with translucent bodies, a thin reflective edge, a restrained diagonal sheen and soft depth. Content remains crisp; decorative gloss has no continuous animation.
- Refined the revenue hero, metric washes, icon lenses, quick actions and floating phone navigation.
- Applied shared web material globally to the clinic/admin shells, cards, tables, report choices, controls, auth frame and dialogs. Nested tables use one optical layer to keep records readable.
- Applied the native panel to the dashboard, POS, report summaries/charts, settings, inventory header and shared inputs/sheets. Scrolling patient, sales, purchase, supplier and expense rows use paint-only sheen to avoid adding a blur layer to every row.
- Connected native inventory to the shared light/dark theme. Shared typography loads Plus Jakarta Sans once at the root.
- Kept status colours semantic, supplied readable dark action labels, and matched native validation borders and inset corners to their containers.
- Retained reduced motion/transparency fallbacks and web forced-colour treatments. Native mesh decoration also respects Reduced Transparency.
- Moved the settings three-column layout to wider desktops so its controls have room at intermediate widths.

## Implementation

Web colour tokens live in `web/src/index.css`. Material tokens and shared treatments live in `web/src/styles/liquid-material.css`; dashboard composition and responsive navigation live in `web/src/styles/liquid-dashboard.css`. These styles load globally, so admin and auth do not rely on importing the clinic dashboard first.

Native theme and glass tokens live in `mobile/src/theme/index.ts`. `mobile/src/components/glass/LiquidGlass.tsx` uses native optical material on compatible iOS devices, a layered iOS blur fallback, and layered paint on Android. Accessibility preferences are provided once at the app root. Opaque surfaces replace translucency when requested.

## Verification

- Web TypeScript and production build passed; Vite retains its existing large-bundle warning.
- ESLint passed for the changed shared controls, dashboard/layout, report hub, sync badge and web tokens. Existing analytics/admin files were checked by TypeScript/build.
- All 37 web regression tests and 13 native auth tests passed.
- Native TypeScript and Metro production exports for both iOS and Android passed.
- Browser visual checks covered dashboard light/dark, reports light/dark, customer dialog, customer phone layout, mobile menu, POS and settings. Dashboard layouts at 390px and 320px were checked; 320px had no document or main-content horizontal overflow.
- Native visual appearance still needs a device check. Native exports verify bundling, not rendering on an iOS/Android device.

Existing data APIs, billing calculations and transaction workflows are unchanged. No preview records or authentication bypasses were added.
