# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## NPM scripts and local development

- Install dependencies: `npm install`
- Start local dev server (Vite): `npm run dev`
- Lint the codebase (ESLint): `npm run lint`
- Generic production build: `npm run build`
- Environment-aware builds (uses `.env.*` via the env manager):
  - Development build: `npm run build:dev` (runs `npm run env:dev && vite build`)
  - Production build: `npm run build:prod` (runs `npm run env:prod && vite build`)
- Preview built app locally: `npm run preview`

Environment management helpers (backed by `scripts/env-manager.cjs`):
- Show current `.env` status: `npm run env:status`
- Switch to development env: `npm run env:dev` (copies `.env.development` to `.env`)
- Switch to production env: `npm run env:prod` (copies `.env.production` to `.env`)

This project does not currently define any test scripts (there is no `npm test` or equivalent), so there is no standard command for running a single test yet.

## Environment and API configuration

- Vite / API environment is controlled via `.env` files and `src/config/api.config.js`.
- Key env vars (see `.env.example`):
  - `VITE_API_ENV` – selects `development` vs `production` configuration.
  - `VITE_API_BASE_URL` – overrides the default backend base URL.
  - `VITE_ENABLE_CONSOLE_LOGS` – when set to `true`, enables verbose logging for API requests/responses and ad-tracking utilities.
  - `VITE_FACEBOOK_ACCESS_TOKEN`, `VITE_FACEBOOK_TEST_EVENT_CODE` – credentials/settings for Facebook Conversions API.
- `src/config/api.config.js`:
  - Chooses the active config (`BASE_URL`, `TIMEOUT`, `FACEBOOK_API_URL`, logging flags) based on `VITE_API_ENV` and Vite’s `import.meta.env.PROD`.
  - Exposes `getCurrentConfig()` for runtime access and `API_ENDPOINTS` as the canonical list of backend paths.
  - Any new backend endpoints should be added to `API_ENDPOINTS` and consumed via the shared axios client in `src/services/api.js`.

## Backend integration layer

All HTTP calls should go through `src/services/api.js` rather than using `axios` directly:

- A preconfigured axios instance is created with `baseURL` and timeouts from `getCurrentConfig()` and wired with request/response interceptors that respect the logging flags.
- Service groupings:
  - `productAPI` – product list, detail, and variant retrieval.
  - `categoryAPI` – top-level categories (`/api/flash-local/categories/level1`).
  - `pickupAPI` – pickup locations.
  - `districtAPI` – city/district hierarchy from `/api/flash-local/cities-and-districts/` (used by the checkout map flow).
  - `orderAPI` – order creation (`createOrder`), which always includes an `ad_id` field (falling back to `null` when absent) and returns the full axios response, not just `data`.
  - `facebookAPI` – server-side entrypoint for Facebook Conversions events, posting to `/api/facebook-conversions` on the same domain defined by `FACEBOOK_API_URL`.

When adding new network calls, prefer extending these service objects so that logging, base URLs, and error handling stay consistent.

## Frontend architecture and routing

The app is a single-page React application bootstrapped by Vite:

- Entry point: `src/main.jsx` mounts the app, wrapping it with `AdTrackingProvider` and `BrowserRouter`.
- Router: `src/App.jsx` defines the main routes:
  - `/` – `HomePage`
  - `/product/:productId` – `ProductPage` (wrapper around `ProductDetail`)
  - `/payment` – `PaymentPage` (multi-step checkout with map and form)
  - `/order-success` – `OrderSuccessPage`
  - `/download` – `DownloadPage`
  - `/update-address` and `/address/:orderNo` – address update flows
- `src/pages/` contains screen-level components; most business logic lives here, while presentational and reusable pieces live in `src/components/`.
- Key page responsibilities:
  - `HomePage` – category selection and product listing (`CategoryTabs`, `ProductList`).
  - `ProductPage` / `ProductDetail` – product detail + quantity/variant selection, leading into the payment flow.
  - `PaymentPage` – orchestrates district selection, map-based location marking, contact details, order creation, and purchase tracking.
  - `OrderSuccessPage` – post-purchase confirmation, including app download and WhatsApp contact entry points.

For new flows, follow this pattern: create a route in `App.jsx`, a page component under `src/pages/`, and compose existing components/services where possible.

## Advertising and tracking pipeline

Advertising and tracking are handled centrally via context, hooks, and utilities:

- `src/utils/urlParams.js` – parses UTM parameters and Facebook-specific fields (`fbclid`, `utm_content`) from the URL, determines if a session originated from a Facebook ad, and builds a `trackingInfo` object (including source URL and capture time).
- `src/hooks/useAdTracking.js` – core hook responsible for:
  - Extracting the ad ID from the URL (`utm_content`) and building full tracking info on first load.
  - Persisting `adId` and tracking metadata to `localStorage`.
  - Restoring ad data from `localStorage` when it’s not present in the URL.
  - Exposing helpers to clear or manually set the ad ID and to inspect current tracking info (including a `window.debugAdTracking` helper when console logging is enabled).
- `src/contexts/AdTrackingContext.jsx` – wraps the app in `AdTrackingProvider`, making ad-tracking state and helpers available across the tree.
- `src/hooks/useAdTrackingHooks.js` – convenience hooks for consumers:
  - `useAdId()` – returns the current ad ID (or `null`).
  - `useHasAdId()` – boolean indicating whether an ad ID is present.
  - `useTrackingInfo()` – returns the raw tracking info and a getter for a normalized view.
- `src/utils/adTrackingUtils.js` – non-hook helpers for accessing tracking data when you already have the context object.

`PaymentPage` uses `useAdId()` and passes `adId` through to `orderAPI.createOrder`, so any new flows that need to attribute orders or events to ads should similarly obtain `adId` from these hooks instead of re-parsing the URL.

## Facebook Conversions API integration

Server-side Facebook event tracking is encapsulated in `src/services/facebookConversions.js` and documented in detail in `docs/FACEBOOK_CONVERSIONS_API.md`:

- `trackPurchaseEvent(orderData, userInfo, clientInfo)`:
  - Builds a `user_data` object, hashing sensitive fields (email, phone, names, city, country) with SHA-256 when possible.
  - Normalizes phone numbers to an international format (Cameroon `237` prefix) before hashing.
  - Constructs `custom_data` with currency, total value, product IDs, item counts, and (optionally) `order_id`.
  - Adds an `event_id` derived from the order number (`purchase_<orderNo>`) for deduplication.
  - Delegates to `sendConversionEvent`, which posts to your backend’s `/api/facebook-conversions` endpoint via `facebookAPI`.
- `getClientInfo()` gathers browser-side metadata (user agent, Facebook cookies `_fbc` / `_fbp`, and current URL) to enrich the event.
- `setFacebookClickId(fbclid)` allows storing click IDs in cookies for later use.

`PaymentPage` calls `trackPurchaseEvent` after a successful order creation, passing both order data and user/client info. When changing purchase flows or adding new conversion types, wire them through this service rather than calling Facebook directly.

## Maps, districts, and location selection

Checkout involves selecting a district and marking a delivery location on a Google Map:

- `src/constants/districtCenters.js` – defines default map center and zoom for Abidjan and a few named districts. The current implementation primarily uses backend-provided coordinates per district, but these constants serve as sensible defaults/fallbacks.
- `src/services/api.js` / `districtAPI.getAllDistricts()` – fetches city-level data with nested `districts` from `/api/flash-local/cities-and-districts/`.
- `PaymentPage`:
  - Step 1: flattens the city/district response into a `districts` list, keeping references to the parent city for display.
  - Step 2: when a district is chosen, uses its latitude/longitude as the map center and prompts the user to click on the map or use geolocation for their exact location.
  - Step 3: collects contact details and address description, and includes both the selected district ID and the custom marker’s coordinates (`latitude`/`longitude`) in the order payload.
- `src/components/MapSelector.jsx` – wraps `@react-google-maps/api`:
  - Accepts `center`, `zoom`, `customMarker`, `userLocation`, and `onMarkerSet` props.
  - Handles map click events to compute the clicked lat/lng and propagate them via `onMarkerSet`.
  - Renders a blue marker for the user’s current location (when available) and a red marker for the chosen delivery point.

If you adjust the city/district API shape or introduce new location-based flows, update both `districtAPI` and the `PaymentPage`/`MapSelector` coordination logic so that selection, centering, and order payloads stay in sync.

## Deployment overview

Deployment is documented in `DEPLOYMENT.md` and automated primarily via CI:

- GitHub Actions are configured (outside this repo) to deploy automatically when changes land on the `main` branch.
- On the target server, `deploy-ci.sh`:
  - Resets the server-side repo (`/home/admin/projects/cod-ecommerce`) to `origin/main`.
  - Installs dependencies (`npm install --production=false`).
  - Builds the production bundle with `npm run build:prod`.
  - Backs up the current site from `/var/www/brainnel.com`.
  - Copies the new `dist/` contents into `/var/www/brainnel.com` and fixes ownership/permissions.
  - Validates and reloads Nginx, then performs a basic HTTP health check against `https://www.brainnel.com`.

For local testing of production builds, use the standard `npm run build` / `npm run preview` flow; `deploy-ci.sh` is intended for the server-side CI/CD environment rather than local machines.
