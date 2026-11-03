# MedPOS — Pharmacy Management Mobile App

A production-grade React Native (Expo) Point-of-Sale and pharmacy management application with full backend integration.

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 20+ |
| Expo CLI | `npx expo` (bundled) |
| EAS CLI | `npm i -g eas-cli` |
| Expo Go | Latest (iOS / Android) |

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd medical-pos-mobile

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API URL

# 4. Start the development server
npx expo start
```

## Environment Variables

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_APP_ENV=development
```

> **Android Emulator**: Use `http://10.0.2.2:3000/api` instead of `localhost`.

## Architecture Overview

```
medical-pos-mobile/
├── app/                          # Expo Router file-based routing
│   ├── _layout.tsx               # Root layout (QueryClient, GestureHandler, Toast)
│   ├── (auth)/                   # Auth flow (splash, login, PIN)
│   │   ├── index.tsx             # Splash / entry redirect
│   │   ├── login.tsx             # Email + password login
│   │   └── pin.tsx               # PIN / biometric lock
│   └── (app)/                    # Authenticated app shell
│       ├── (tabs)/               # Bottom tab navigator
│       │   ├── _layout.tsx       # Custom animated tab bar
│       │   ├── dashboard/        # KPI cards, revenue chart, activity feed
│       │   ├── pos/              # Point-of-sale, cart, barcode scanner
│       │   ├── inventory/        # Medicine list, stock tracking
│       │   ├── patients/         # CRM, patient profiles
│       │   └── reports/          # Analytics, Skia charts, GST reports
│       ├── inventory/            # [id] detail, add medicine
│       ├── patients/             # [id] detail, add patient
│       ├── sales/                # History, [id] receipt, returns
│       ├── purchases/            # List, [id] detail, add (scan bill)
│       ├── suppliers/            # List, [id] detail
│       ├── expenses/             # Tracking, category donut chart
│       ├── shortbook/            # Reorder queue
│       ├── reports/              # Accounting P&L summary
│       └── settings/             # Profile, dark mode, sync, logout
│
├── src/
│   ├── api/                      # Typed API clients (Axios)
│   │   ├── client.ts             # Axios instance w/ auth interceptor
│   │   ├── sales.ts, purchases.ts, suppliers.ts, ...
│   │   └── queryClient.ts        # TanStack Query config
│   ├── components/
│   │   ├── ui/                   # Reusable UI (Button, Toast, Skeleton, etc.)
│   │   ├── navigation/           # CustomTabBar with More bottom sheet
│   │   └── ErrorBoundary.tsx     # Per-screen crash protection
│   ├── hooks/                    # TanStack Query hooks per domain
│   ├── stores/                   # Zustand stores (auth, cart, UI)
│   ├── theme/                    # Light + dark tokens, useTheme hook
│   ├── types/                    # Shared TypeScript interfaces
│   └── utils/                    # Formatters, storage helpers
│
├── app.json                      # Expo config (Hermes, plugins)
├── tsconfig.json
└── package.json
```

## Key Technologies

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 |
| Routing | Expo Router (file-based) |
| State | Zustand (auth, cart, UI) |
| Server State | TanStack Query v5 |
| Charts | @shopify/react-native-skia |
| Lists | @shopify/flash-list |
| Animations | react-native-reanimated |
| Gestures | react-native-gesture-handler |
| Bottom Sheets | @gorhom/bottom-sheet |
| Storage | react-native-mmkv (in-memory fallback for Expo Go) |

## API Configuration

The app expects a REST backend running at `EXPO_PUBLIC_API_URL`. All endpoints are prefixed with `/api` and require a Bearer token (set via the auth store after login).

Key endpoint groups:
- `/auth/*` — Login, token refresh
- `/inventory/*` — Medicines, batches, stock
- `/customers/*` — Patient CRM
- `/sales/*` — POS transactions, returns
- `/purchases/*` — Supplier purchase orders
- `/suppliers/*` — Vendor management
- `/expenses/*` — Operating cost tracking
- `/reports/*` — Dashboard, P&L, GST, Schedule H1
- `/analytics/*` — Revenue trends, performance, insights
- `/shortbook/*` — Reorder queue
- `/accounting/*` — Summary financials

## Build Commands

```bash
# Development
npx expo start

# Preview build (internal testing)
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production build
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Features

- **Dashboard**: Real-time KPIs, animated revenue charts, recent activity feed
- **Point of Sale**: Medicine search, barcode scan, cart management, payment
- **Inventory**: Stock levels, batch tracking, expiry alerts, Schedule H1 tagging
- **CRM**: Patient profiles, purchase history, outstanding balances, reminders
- **Reports**: Skia-rendered line/donut charts, GST compliance, GSTR-1 export
- **Purchases**: Supplier bill entry, AI-powered bill scanning (OCR)
- **Expenses**: Category-wise tracking with visual analytics
- **Dark Mode**: Full theme support with MMKV-persisted preference
- **Offline-Ready**: MMKV caching, optimistic updates
- **Haptic Feedback**: Tactile responses on all interactions

## License

Private — All rights reserved.
