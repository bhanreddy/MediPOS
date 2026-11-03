# Mobile liquid gloss

The mobile UI uses pearl and sapphire for its foundation, with restrained violet, amber, and rose accents. Green is reserved for semantic success states. Dashboard, checkout, inventory, sheets, forms, and notifications share the same material tokens.

## Material and rendering budget

- `LiquidPanel` defaults to `surface`: one static sheen, a rim, and a readable fill. Scrolling cards never instantiate native glass or blur.
- Use `material="hero"` for the dashboard revenue surface; use `material="chrome"` for the dock and sheets. Interactive controls also default to chrome.
- Native optical material is limited to supported iOS builds and fixed chrome. Expo documents the runtime availability checks and iOS 26 requirement in its [SDK 54 GlassEffect reference](https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/).
- Android and older iOS use paint-only gloss. Lightweight mode preserves the palette and sheen, disables decorative backdrops, removes the inset panel rim, and disables the shared motion effects. The choice persists independently of dark appearance.
- Reduce Motion and Reduce Transparency are respected independently; an unavailable transparency API cannot prevent motion preferences from resolving.
- Loading skeletons are static. List rows do not play an entrance animation on every recycle. Screen backgrounds use one wash instead of stacked translucent orbs.

## Responsive behaviour

`src/theme/mobileLayout.ts` uses logical screen width, font scale, and the bottom safe area. It controls dashboard grids, checkout columns, dock dimensions, and scroll clearance. Compact checkout uses one column; normal phones use two, and tablets use three or four. Dashboard actions reflow to two columns on compact layouts.

The dock hides for the keyboard. Inventory and Patients Add buttons sit above the dock. The workspace menu uses a bounded, scrollable native modal with large controls. Reports use scrollable tabs and a horizontal GST table instead of squeezed financial columns. UPI sheets scroll on short screens and stack their actions on compact layouts.

## List and startup work

Product cards are memoized. A cart lookup map replaces a per-row linear scan, and stable list callbacks preserve unchanged cards. FlashList v2 uses its own sizing; obsolete estimated-size props and their `any` wrappers have been removed from the main lists. This follows the [FlashList performance guidance](https://shopify.github.io/flash-list/docs/fundamentals/performance/).

Stock, Sales, Patients, and POS rendering freeze off screen. The dashboard remains subscribed to navigation focus so its polling can stop on blur. AppState updates TanStack Query's focus manager, following its [React Native lifecycle guidance](https://tanstack.com/query/v5/docs/framework/react/react-native), so interval fetches pause when the app is backgrounded.

Four Jakarta font weights load once at the root. Scoped Ionicons imports avoid exporting unrelated icon fonts. Comparing the previous native export with the final export, shared asset files fell from 5,791,253 to 795,037 bytes (about 86%). This is an exported asset measurement, not an APK-size or frame-rate measurement.

## Verification — 10 October 2026

- TypeScript passes.
- 18 checks pass: 13 existing authentication/session regressions and 5 layout, material, and preference checks (`npm run test:auth`, `npm run test:ui`).
- Android and iOS Hermes exports pass from the pinned lockfile dependencies.
- React Native components were visually inspected through a temporary browser harness at 320×640, 390×844, and 768×1024, including light/dark appearance, Lightweight mode, checkout add/quantity controls, Inventory, and the workspace menu.
- Saved browser component previews in `docs/qa/mobile-liquid-gloss-390.jpg`, `mobile-liquid-gloss-dark-lightweight.jpg`, and `mobile-workspace-sheet.jpg` use sample data. The temporary fixture and preview-only dependencies were removed, and the live event provider was restored before export.

Native optical appearance, keyboard interactions, and frame times have not been measured on physical devices. Validate those with a release build on an iOS device supporting liquid glass and a lower-memory Android phone before making performance guarantees.
